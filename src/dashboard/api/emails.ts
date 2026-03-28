import type { Request, Response } from "express";
import type { JobEmailRow } from "../../types/db-rows.js";
import { db } from "../../memory/db.js";

const ALLOWED_STATUS = new Set(["positive", "negative", "neutral"]);

function numParam(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function listEmails(req: Request, res: Response) {
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 500) : 100;
  const jobId = typeof req.query.job_id === "string" && req.query.job_id.trim() ? req.query.job_id.trim() : null;

  try {
    const conditions: string[] = ["hidden = 0"];
    const params: any[] = [];

    if (jobId) {
      conditions.push("linked_job_id = ?");
      params.push(jobId);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    params.push(limit);

    const rows = db.prepare(
      `SELECT id, from_addr, subject, snippet, status, email_date, created_at, linked_job_id, gmail_message_id, gmail_thread_id, action_needed, stage, followup_subject, followup_body, followup_created_at
       FROM job_emails
       ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
    ).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function getEmail(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  try {
    const row = db.prepare(`SELECT * FROM job_emails WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function patchEmail(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const body = req.body ?? {};
  const sets: string[] = [];
  const vals: any[] = [];

  if (body.status && ALLOWED_STATUS.has(String(body.status))) {
    sets.push("status = ?");
    vals.push(String(body.status));
  }
  if (typeof body.followup_subject === "string") {
    sets.push("followup_subject = ?");
    vals.push(body.followup_subject);
  }
  if (typeof body.followup_body === "string") {
    sets.push("followup_body = ?");
    vals.push(body.followup_body);
  }
  // Allow updating stage and clearing action_needed
  if (typeof body.stage === "string") {
    sets.push("stage = ?");
    vals.push(body.stage);
  }
  if (typeof body.action_needed === "string") {
    sets.push("action_needed = ?");
    vals.push(body.action_needed);
  }
  // Allow hiding an email (marking as not job-related)
  if (body.hidden === 1 || body.hidden === 0) {
    sets.push("hidden = ?");
    vals.push(body.hidden);
  }
  // Allow manually linking / unlinking to a job
  if (Object.prototype.hasOwnProperty.call(body, "linked_job_id")) {
    sets.push("linked_job_id = ?");
    vals.push(body.linked_job_id ?? null);
  }

  if (sets.length === 0) return res.status(400).json({ error: "nothing to update" });

  try {
    vals.push(id);
    const result = db.prepare(`UPDATE job_emails SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    res.json({ ok: result.changes > 0 });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}


export function emailStats(_req: Request, res: Response) {
  try {
    const total = (db.prepare("SELECT COUNT(*) as c FROM job_emails WHERE hidden = 0").get() as any).c as number;
    const unread = (db.prepare("SELECT COUNT(*) as c FROM job_emails WHERE status = 'neutral' AND hidden = 0").get() as any).c as number;
    const positive = (db.prepare("SELECT COUNT(*) as c FROM job_emails WHERE status = 'positive' AND hidden = 0").get() as any).c as number;
    const negative = (db.prepare("SELECT COUNT(*) as c FROM job_emails WHERE status = 'negative' AND hidden = 0").get() as any).c as number;
    const withFollowup = (db.prepare("SELECT COUNT(*) as c FROM job_emails WHERE followup_body IS NOT NULL AND followup_body != '' AND hidden = 0").get() as any).c as number;
    res.json({ total, unread, positive, negative, drafts: withFollowup });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function deleteEmail(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  try {
    const result = db.prepare(`DELETE FROM job_emails WHERE id = ?`).run(id);
    res.json({ ok: result.changes > 0 });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function createGmailDraft(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  try {
    const email = db.prepare(`SELECT * FROM job_emails WHERE id = ?`).get(id) as any;
    if (!email) return res.status(404).json({ error: "not found" });
    if (!email.followup_body) return res.status(400).json({ error: "no followup draft to save" });

    const { google } = await import("googleapis");
    const { getAuthenticatedClient } = await import("../../tools/gmail/auth.js");
    const auth = getAuthenticatedClient();
    if (!auth) return res.status(503).json({ error: "Gmail not connected" });

    const gmail = google.gmail({ version: "v1", auth });

    const toMatch = email.from_addr.match(/<([^>]+)>/);
    const to = toMatch ? toMatch[1] : email.from_addr.trim();
    const subject = email.followup_subject || `Re: ${email.subject || ""}`;

    const headerLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      ...(email.gmail_message_id ? [
        `In-Reply-To: <${email.gmail_message_id}>`,
        `References: <${email.gmail_message_id}>`,
      ] : []),
      "",
      email.followup_body,
    ];
    const raw = Buffer.from(headerLines.join("\r\n")).toString("base64url");

    const result = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw,
          ...(email.gmail_thread_id ? { threadId: email.gmail_thread_id } : {}),
        },
      },
    });

    res.json({ ok: true, draftId: result.data.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

// Derive a clean company name from the sender's display name or email domain
function extractCompany(fromAddr: string): string {
  // Try display name first: "Olivier Bernard <o@horus-consulting.com>" → "Olivier Bernard"
  // But we want the company, not the person. Use domain instead.
  const emailMatch = fromAddr.match(/<([^>]+)>/) ?? fromAddr.match(/(\S+@\S+)/);
  if (emailMatch) {
    const domain = emailMatch[1].split('@')[1] ?? '';
    // Strip TLD and common suffixes, capitalize words
    return domain
      .replace(/\.(com|fr|io|co|net|org|ai|eu|de|uk|es)(\.[a-z]{2})?$/i, '')
      .split(/[-.]/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .trim() || 'Unknown Company';
  }
  return 'Unknown Company';
}

export function createJobFromEmail(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  try {
    const email = db.prepare(`SELECT * FROM job_emails WHERE id = ?`).get(id) as any;
    if (!email) return res.status(404).json({ error: "email not found" });
    if (email.linked_job_id) return res.status(400).json({ error: "email already linked to a job" });

    const company = extractCompany(email.from_addr);
    // Map email stage to pipeline status
    const stageMap: Record<string, string> = {
      interview: 'interview', offer: 'offer', rejection: 'rejected',
      test: 'applied', acknowledgment: 'applied', pending: 'applied', 'follow-up': 'applied',
    };
    const pipelineStatus = stageMap[email.stage ?? ''] ?? 'applied';
    const jobId = `email:${company.toLowerCase().replace(/\s+/g, '-')}:${Date.now()}`;

    db.prepare(
      `INSERT OR IGNORE INTO job_postings (id, source, title, company, location, url, pipeline_status, applied_at)
       VALUES (?, 'email', ?, ?, '', '', ?, datetime('now'))`
    ).run(jobId, email.subject ?? company, company, pipelineStatus);

    db.prepare(`UPDATE job_emails SET linked_job_id = ? WHERE id = ?`).run(jobId, id);

    res.json({ ok: true, jobId, company, pipelineStatus });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
