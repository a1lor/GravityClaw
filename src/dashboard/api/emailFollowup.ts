import type { Request, Response } from "express";
import { db } from "../../memory/db.js";
import { createTask, runTask } from "../tasks.js";
import { chat } from "../../llm/llm.js";

function numParam(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function companyTimelineText(company: string): string {
  const thread = db.prepare(
    `SELECT
       'job' as kind,
       found_at as at,
       title as a,
       pipeline_status as b
     FROM job_postings
     WHERE company = ?
     UNION ALL
     SELECT
       'email' as kind,
       je.created_at as at,
       je.subject as a,
       je.status as b
     FROM job_emails je
     JOIN job_postings jp ON jp.id = je.linked_job_id
     WHERE jp.company = ?
     UNION ALL
     SELECT
       'outreach' as kind,
       COALESCE(sent_at, created_at) as at,
       COALESCE(email_subject,'') as a,
       status as b
     FROM spontaneous_targets
     WHERE company = ?
     ORDER BY at DESC
     LIMIT 30`,
  ).all(company, company, company) as any[];

  return thread.map((r) => `[${r.at}] ${r.kind.toUpperCase()} — ${r.a}${r.b ? ` (${r.b})` : ""}`).join("\n");
}

export function startEmailFollowup(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const t = createTask(`Generate follow-up for email ${id}`);

  runTask(t.id, async ({ isCancelled, setMessage }) => {
    setMessage("Loading email…");
    const email = db.prepare(`SELECT * FROM job_emails WHERE id = ?`).get(id) as any;
    if (!email) throw new Error("Email not found");

    let company = "";
    if (email.linked_job_id) {
      const job = db.prepare(`SELECT company FROM job_postings WHERE id = ?`).get(email.linked_job_id) as any;
      company = String(job?.company ?? "");
    }

    const timeline = company ? companyTimelineText(company) : "";
    if (isCancelled()) return;

    setMessage("Generating follow-up draft…");

    const prompt =
      `Write a concise, professional follow-up email for a job application.\n\n` +
      `Constraints:\n` +
      `- Tone: confident, direct, technical.\n` +
      `- Keep it short (6-10 sentences).\n` +
      `- Include a clear call-to-action (availability for a short call).\n` +
      `- Output JSON only: {"subject": "...", "body": "..."}.\n\n` +
      `Context:\n` +
      `- Company: ${company || "(unknown)"}\n` +
      `- Last received email:\nFrom: ${email.from_addr}\nSubject: ${email.subject}\nSnippet: ${email.snippet}\nStatus: ${email.status}\nDate: ${email.email_date || email.created_at}\n\n` +
      (timeline ? `Recent thread timeline:\n${timeline}\n\n` : "");

    const { message } = await chat([{ role: "user", content: prompt }], undefined, "", 1, "meta-llama/llama-3.1-8b-instruct", true);
    const raw = message.content ?? "";

    let subject = "Follow-up — application";
    let body = raw;
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const parsed = JSON.parse(start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw);
      subject = String(parsed.subject || subject);
      body = String(parsed.body || body);
    } catch {
      // keep fallback
    }

    if (isCancelled()) return;
    setMessage("Saving draft…");
    db.prepare(`UPDATE job_emails SET followup_subject = ?, followup_body = ?, followup_created_at = datetime('now') WHERE id = ?`)
      .run(subject, body, id);
    setMessage("Follow-up saved");
  });

  res.json({ taskId: t.id });
}

