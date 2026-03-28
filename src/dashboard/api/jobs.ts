import type { Request, Response } from "express";
import { db } from "../../memory/db.js";
import { updatePipelineStatus } from "../../tools/jobs/tracker.js";

const ALLOWED_STATUS = new Set(["new", "saved", "applied", "interview", "offer", "rejected"]);

export function listJobs(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "all";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 500) : 200;

  try {
    if (status !== "all" && !ALLOWED_STATUS.has(status)) {
      return res.status(400).json({ error: "invalid status" });
    }

    const base =
      `SELECT id, source, title, company, location, url, found_at, applied_at, pipeline_status, job_type, outcome, followup_at, followup_sent_at, job_score, job_score_reason, job_scored_at ` +
      `FROM job_postings `;

    const sql =
      status === "all"
        ? base + `ORDER BY found_at DESC LIMIT ?`
        : base + `WHERE pipeline_status = ? ORDER BY found_at DESC LIMIT ?`;

    const rows = status === "all"
      ? db.prepare(sql).all(limit)
      : db.prepare(sql).all(status, limit);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function getJob(req: Request, res: Response) {
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "invalid id" });

  try {
    const row = db.prepare(`SELECT * FROM job_postings WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function patchJob(req: Request, res: Response) {
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "invalid id" });

  const pipeline_status = String(req.body?.pipeline_status ?? "").trim();
  if (pipeline_status && !ALLOWED_STATUS.has(pipeline_status)) {
    return res.status(400).json({ error: "invalid pipeline_status" });
  }

  try {
    if (pipeline_status) updatePipelineStatus(id, pipeline_status);

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (typeof req.body?.title === "string" && req.body.title.trim()) {
      sets.push("title = ?"); vals.push(req.body.title.trim());
    }
    if (typeof req.body?.company === "string" && req.body.company.trim()) {
      sets.push("company = ?"); vals.push(req.body.company.trim());
    }
    if (sets.length > 0) {
      vals.push(id);
      db.prepare(`UPDATE job_postings SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function deleteJob(req: Request, res: Response) {
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "invalid id" });
  try {
    db.prepare(`UPDATE job_emails SET linked_job_id = NULL WHERE linked_job_id = ?`).run(id);
    const result = db.prepare(`DELETE FROM job_postings WHERE id = ?`).run(id);
    if (result.changes === 0) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function getJobEmails(req: Request, res: Response) {
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "invalid id" });
  try {
    const rows = db.prepare(
      `SELECT id, from_addr, subject, snippet, status, stage, action_needed, email_date, created_at
       FROM job_emails WHERE linked_job_id = ? ORDER BY created_at DESC LIMIT 20`
    ).all(id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

