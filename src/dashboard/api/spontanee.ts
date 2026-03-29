import type { Request, Response } from "express";
import fs from "fs";
import { db } from "../../memory/db.js";
import { createTask, runTask } from "../tasks.js";
import { generateSpontaneousEmail, updateTargetStatus } from "../../tools/jobs/spontanee.js";
import { sendEmail } from "../../tools/gmail/sender.js";
import { emitEvent } from "../../events/emitter.js";
import { buildProfileContext, getAllProfile } from "../../memory/profile.js";
import { chat } from "../../llm/llm.js";

const MAX_LIMIT = 500;

function numParam(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function isValidHrEmail(email: string): boolean {
  // Basic validation per Track 3 spec.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function discoverHrEmailForCompany(company: string, industryHint = ""): Promise<string> {
  const profileCtx = buildProfileContext();

  const prompt =
    `You are an expert recruiting assistant. ` +
    `Guess the most likely HR / hiring contact email for the company "${company}".\n\n` +
    `Company industry hint (may be empty): ${industryHint || "(none)"}\n\n` +
    `Candidate context:\n${profileCtx || "(no extra context)"}\n\n` +
    `Return ONLY valid JSON in the form: {"hr_email":"string","reason":"string"}.\n` +
    `If you're not confident, return {"hr_email":"","reason":"..."}.\n` +
    `Email MUST look like a real address (we will validate with a basic regex).`;

  try {
    const { message } = await chat([{ role: "user", content: prompt }], undefined, "", 1, "openai/gpt-4o", true);
    const raw = message.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return "";
    const parsed = JSON.parse(match[0]) as any;
    const hrEmail = String(parsed?.hr_email ?? "").trim();
    return isValidHrEmail(hrEmail) ? hrEmail : "";
  } catch (err) {
    console.warn("[spontanee] HR email discovery failed:", err);
    return "";
  }
}

export function listTargets(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "all";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT) : 200;

  try {
    const base = `SELECT * FROM spontaneous_targets `;
    const sql =
      status === "all"
        ? base + `ORDER BY created_at DESC LIMIT ?`
        : base + `WHERE status = ? ORDER BY created_at DESC LIMIT ?`;
    const rows = status === "all"
      ? db.prepare(sql).all(limit)
      : db.prepare(sql).all(status, limit);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function getTarget(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  try {
    const row = db.prepare(`SELECT * FROM spontaneous_targets WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function patchTarget(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const body = req.body ?? {};
  const status = typeof body.status === "string" ? body.status.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes : null;

  try {
    if (status) {
      updateTargetStatus(id, status, notes ?? "");
    }

    const extraSets: string[] = [];
    const extraVals: any[] = [];
    if (notes !== null && !status) {
      extraSets.push("notes = ?");
      extraVals.push(notes);
    }
    if (typeof body.email_subject === "string") {
      extraSets.push("email_subject = ?");
      extraVals.push(body.email_subject);
    }
    if (typeof body.sent_letter === "string") {
      extraSets.push("sent_letter = ?");
      extraVals.push(body.sent_letter);
    }
    if (extraSets.length > 0) {
      extraVals.push(id);
      db.prepare(`UPDATE spontaneous_targets SET ${extraSets.join(", ")} WHERE id = ?`).run(...extraVals);
    }

    if (!status && extraSets.length === 0) return res.status(400).json({ error: "nothing to update" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function getStats(_req: Request, res: Response) {
  try {
    const rows = db.prepare(`SELECT status, COUNT(*) as cnt FROM spontaneous_targets GROUP BY status`).all() as any[];
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[String(r.status)] = Number(r.cnt) || 0;
    const sent = db.prepare(`SELECT COUNT(*) as cnt FROM spontaneous_targets WHERE status = 'sent'`).get() as any;
    const replied = db.prepare(`SELECT COUNT(*) as cnt FROM spontaneous_targets WHERE reply_at IS NOT NULL`).get() as any;
    const daily = db.prepare(`SELECT COUNT(*) as cnt FROM spontaneous_targets WHERE date(sent_at) = date('now')`).get() as any;
    res.json({
      byStatus,
      sent: Number(sent?.cnt) || 0,
      replied: Number(replied?.cnt) || 0,
      sentToday: Number(daily?.cnt) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function addTarget(req: Request, res: Response) {
  const body = req.body ?? {};
  const company = String(body?.company ?? "").trim();
  const industry = String(body?.industry ?? "").trim();
  const hrEmailRaw = String(body?.hr_email ?? body?.hrEmail ?? "").trim();

  if (!company) return res.status(400).json({ error: "company required" });

  let hr_email = hrEmailRaw;
  if (!hr_email || !isValidHrEmail(hr_email)) {
    // For pipeline-driven adds, the frontend may not provide an HR email.
    // Attempt discovery server-side; if it fails, we still create a target
    // (hr_email can be empty string, allowing the user to fill later).
    hr_email = await discoverHrEmailForCompany(company, industry);
  }

  // Ensure we never store an invalid email format.
  if (!hr_email) hr_email = "";

  try {
    const added = addTargetRow(company, hr_email, industry);
    res.json({ ok: true, added });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

function addTargetRow(company: string, hrEmail: string, industry = ""): boolean {
  // Cold outreach assumes 1 target row per company.
  // If a company already exists (e.g. previously unknown HR email), update the
  // existing row instead of inserting a second record.
  const existing = db
    .prepare(`SELECT id, hr_email, industry, status FROM spontaneous_targets WHERE company = ? ORDER BY id DESC LIMIT 1`)
    .get(company) as any;

  if (existing) {
    const sets: string[] = [];
    const vals: any[] = [];

    // Only overwrite an unknown HR email when we finally discover one.
    if ((existing.hr_email ?? "") === "" && hrEmail) {
      sets.push("hr_email = ?");
      vals.push(hrEmail);
    }

    // If industry was previously empty, fill it from the new request.
    if (industry && !(existing.industry ?? "")) {
      sets.push("industry = ?");
      vals.push(industry);
    }

    // Keep notes/status stable. We still return `true` because the user
    // intent (having the company in outreach) is satisfied.
    if (sets.length > 0) {
      vals.push(existing.id);
      db.prepare(`UPDATE spontaneous_targets SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    }

    return true;
  }

  const stmtInsert = db.prepare(
    `INSERT OR IGNORE INTO spontaneous_targets (company, hr_email, industry) VALUES (?, ?, ?)`,
  );
  const result = stmtInsert.run(company, hrEmail, industry);
  return result.changes > 0;
}

export async function discoverTargets(req: Request, res: Response) {
  const body = req.body ?? {};
  const countRaw = Number(body?.count ?? 10);
  const count = Number.isFinite(countRaw) ? Math.min(Math.max(1, Math.floor(countRaw)), 20) : 10;
  const industryHint = String(body?.industry ?? "").trim();

  const profileCtx = buildProfileContext();
  const fullProfile = getAllProfile();
  const name = fullProfile["name"] || "the candidate";

  const prompt =
    `You are an expert company discovery assistant. ` +
    `Suggest companies relevant for ${name} based on the candidate context and the optional industry hint.\n\n` +
    `Industry hint (may be empty): ${industryHint || "(none)"}\n\n` +
    `Candidate context:\n${profileCtx || "(no extra context)"}\n\n` +
    `Return ONLY a JSON array of exactly ${count} objects.\n` +
    `Each object must have exactly these keys:\n` +
    `- company (string)\n` +
    `- hr_email (string) - return "" if unknown\n` +
    `- industry (string)\n` +
    `- reason (string) - short, 1 sentence\n\n` +
    `Constraints:\n` +
    `- hr_email must be either a valid email address or an empty string.\n` +
    `- Do not include placeholders like "hr@company.com". Use real-looking emails.\n` +
    `- Do not include any extra text besides the JSON array.`;

  try {
    const { message } = await chat([{ role: "user", content: prompt }], undefined, "", 1, "openai/gpt-4o", true);
    const raw = message.content ?? "";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.json([]);

    const parsed = JSON.parse(jsonMatch[0]) as any[];
    const suggestions = Array.isArray(parsed) ? parsed : [];

    const validated = suggestions
      .map((s: any) => {
        const company = String(s?.company ?? "").trim();
        const industry = String(s?.industry ?? "").trim();
        const reason = String(s?.reason ?? "").trim();
        const hrEmail = String(s?.hr_email ?? "").trim();

        return {
          company,
          hr_email: isValidHrEmail(hrEmail) ? hrEmail : "",
          industry,
          reason,
        };
      })
      .filter((s: any) => s.company);

    res.json(validated);
  } catch (err) {
    console.warn("[spontanee] discoverTargets failed:", err);
    res.json([]);
  }
}

export function generateForTarget(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const t = createTask(`Generate outreach draft for target ${id}`);
  runTask(t.id, async ({ isCancelled, setMessage, setProgress }) => {
    setMessage("Loading target…");
    setProgress(5);
    const target = db.prepare(`SELECT * FROM spontaneous_targets WHERE id = ?`).get(id) as any;
    if (!target) throw new Error("Target not found");
    if (isCancelled()) return;
    setMessage("Generating email with LLM…");
    setProgress(40);
    const email = await generateSpontaneousEmail(target);
    if (isCancelled()) return;
    setMessage("Saving draft…");
    setProgress(85);
    updateTargetStatus(id, "draft", target.notes || "", email.body, email.subject);
    setMessage("Draft saved");
    setProgress(100);
  });

  res.json({ taskId: t.id });
}

/** Pick the best CV file for a given detected language ('fr' | 'en' | ''). */
function pickCvPath(language: string): string | null {
  const lang = (language || "").toLowerCase().startsWith("en") ? "en" : "fr";
  // Try exact match first, then general, then any
  const row = db.prepare(
    `SELECT file_path FROM cv_library
     WHERE file_path IS NOT NULL AND file_path != ''
     ORDER BY
       CASE WHEN language = ? THEN 0
            WHEN job_type = 'general' THEN 1
            ELSE 2 END,
       updated_at DESC
     LIMIT 1`,
  ).get(lang) as any;
  if (row?.file_path && fs.existsSync(row.file_path)) return row.file_path;
  return null;
}

export function sendOutreach(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const t = createTask(`Send outreach email for target ${id}`);

  runTask(t.id, async ({ isCancelled, setMessage, setProgress }) => {
    setMessage("Loading target…");
    setProgress(5);
    const target = db.prepare(`SELECT * FROM spontaneous_targets WHERE id = ?`).get(id) as any;
    if (!target) throw new Error("Target not found");
    const emailSubject = String(target.email_subject ?? "").trim();
    const sentLetter = String(target.sent_letter ?? "").trim();
    const hrEmail = String(target.hr_email ?? "").trim();

    if (!emailSubject || !sentLetter) throw new Error("No draft found — generate a draft first");
    if (!hrEmail || !isValidHrEmail(hrEmail)) throw new Error("Invalid HR email — cannot send");
    if (target.status === "sent" || target.status === "replied") throw new Error("Already sent");
    if (isCancelled()) return;

    // Detect language from draft body
    const isFrench = /[àâäéèêëîïôùûüç]/i.test(sentLetter);
    const cvPath = pickCvPath(isFrench ? "fr" : "en");

    setMessage(cvPath ? "Sending email with CV attachment…" : "Sending email (no CV found)…");
    setProgress(70);
    await sendEmail(
      hrEmail,
      emailSubject,
      sentLetter,
      undefined,
      cvPath ?? undefined,
    );
    if (isCancelled()) return;

    setMessage("Updating status…");
    setProgress(90);
    updateTargetStatus(id, "sent", target.notes || "");
    db.prepare(`UPDATE spontaneous_targets SET sent_at = datetime('now') WHERE id = ?`).run(id);
    emitEvent("outreach_sent", { company: target.company });
    setMessage("Sent ✓");
    setProgress(100);
  });

  res.json({ taskId: t.id });
}

async function batchGenerateCore(
  limit: number,
  helpers?: { isCancelled?: () => boolean; setMessage?: (m: string) => void; setProgress?: (p: number) => void },
): Promise<{ processed: number; total: number }> {
  const isCancelled = helpers?.isCancelled ?? (() => false);

  const targets = db
    .prepare(
      `SELECT * FROM spontaneous_targets WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
    )
    .all(limit) as any[];

  let done = 0;
  for (const target of targets) {
    if (isCancelled()) break;
    helpers?.setMessage?.(`Generating (${done + 1}/${targets.length}) ${target.company}…`);
    helpers?.setProgress?.(Math.round((done / Math.max(1, targets.length)) * 100));
    const email = await generateSpontaneousEmail(target);
    if (isCancelled()) break;
    updateTargetStatus(target.id, "draft", target.notes || "", email.body, email.subject);
    done++;
    helpers?.setProgress?.(Math.round((done / Math.max(1, targets.length)) * 100));
  }

  helpers?.setMessage?.(`Drafts generated: ${done}`);
  helpers?.setProgress?.(100);
  return { processed: done, total: targets.length };
}

// Used by Track 1 dashboard action triggers.
export function startBatchInternal(limit: number): Promise<{ processed: number; total: number }> {
  return batchGenerateCore(limit);
}

export function startBatch(req: Request, res: Response) {
  const limit = Math.min(Math.max(1, Number(req.body?.limit ?? 5) || 5), 20);
  const t = createTask(`Generate ${limit} spontanee drafts`);

  runTask(t.id, async ({ isCancelled, setMessage, setProgress }) => {
    setMessage("Selecting pending targets…");
    setProgress(5);
    await batchGenerateCore(limit, { isCancelled, setMessage, setProgress });
  });

  res.json({ taskId: t.id });
}

