import type { Request, Response } from "express";
import fs from "fs";
import { db } from "../../memory/db.js";
import { createTask, runTask } from "../tasks.js";
import { generateSpontaneousEmail, updateTargetStatus } from "../../tools/jobs/spontanee.js";
import { sendEmail } from "../../tools/gmail/sender.js";

const MAX_LIMIT = 500;

function numParam(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
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

export function generateForTarget(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const t = createTask(`Generate outreach draft for target ${id}`);
  runTask(t.id, async ({ isCancelled, setMessage }) => {
    setMessage("Loading target…");
    const target = db.prepare(`SELECT * FROM spontaneous_targets WHERE id = ?`).get(id) as any;
    if (!target) throw new Error("Target not found");
    if (isCancelled()) return;
    setMessage("Generating email with LLM…");
    const email = await generateSpontaneousEmail(target);
    if (isCancelled()) return;
    setMessage("Saving draft…");
    updateTargetStatus(id, "draft", target.notes || "", email.body, email.subject);
    setMessage("Draft saved");
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

  runTask(t.id, async ({ isCancelled, setMessage }) => {
    setMessage("Loading target…");
    const target = db.prepare(`SELECT * FROM spontaneous_targets WHERE id = ?`).get(id) as any;
    if (!target) throw new Error("Target not found");
    if (!target.email_subject || !target.sent_letter) throw new Error("No draft found — generate a draft first");
    if (target.status === "sent" || target.status === "replied") throw new Error("Already sent");
    if (isCancelled()) return;

    // Detect language from draft body
    const isFrench = /[àâäéèêëîïôùûüç]/i.test(String(target.sent_letter));
    const cvPath = pickCvPath(isFrench ? "fr" : "en");

    setMessage(cvPath ? "Sending email with CV attachment…" : "Sending email (no CV found)…");
    await sendEmail(
      String(target.hr_email),
      String(target.email_subject),
      String(target.sent_letter),
      undefined,
      cvPath ?? undefined,
    );
    if (isCancelled()) return;

    setMessage("Updating status…");
    updateTargetStatus(id, "sent", target.notes || "");
    db.prepare(`UPDATE spontaneous_targets SET sent_at = datetime('now') WHERE id = ?`).run(id);
    setMessage("Sent ✓");
  });

  res.json({ taskId: t.id });
}

export function startBatch(req: Request, res: Response) {
  const limit = Math.min(Math.max(1, Number(req.body?.limit ?? 5) || 5), 20);
  const t = createTask(`Generate ${limit} spontanee drafts`);

  runTask(t.id, async ({ isCancelled, setMessage }) => {
    setMessage("Selecting pending targets…");
    const targets = db.prepare(`SELECT * FROM spontaneous_targets WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`).all(limit) as any[];
    let done = 0;
    for (const target of targets) {
      if (isCancelled()) return;
      setMessage(`Generating (${done + 1}/${targets.length}) ${target.company}…`);
      const email = await generateSpontaneousEmail(target);
      if (isCancelled()) return;
      updateTargetStatus(target.id, "draft", target.notes || "", email.body, email.subject);
      done++;
    }
    setMessage(`Drafts generated: ${done}`);
  });

  res.json({ taskId: t.id });
}

