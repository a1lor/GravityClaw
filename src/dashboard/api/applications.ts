import type { Request, Response } from "express";
import { db } from "../../memory/db.js";

function strParam(v: unknown): string {
  return String(v ?? "").trim();
}

export function listApplications(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 500) : 200;

  try {
    const where = status ? "WHERE pipeline_status = ?" : "";
    const rows = db
      .prepare(
        `SELECT id, company, title as position, pipeline_status as status, outcome, found_at as last_update, url, application_folder, cover_letter_path
         FROM job_postings
         ${where}
         ORDER BY found_at DESC
         LIMIT ?`,
      )
      .all(...(status ? [status, limit] : [limit]));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function getApplication(req: Request, res: Response) {
  const id = decodeURIComponent(strParam(req.params.id));
  if (!id) return res.status(400).json({ error: "invalid id" });
  try {
    const row = db.prepare(`SELECT * FROM job_postings WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function patchApplication(req: Request, res: Response) {
  const id = decodeURIComponent(strParam(req.params.id));
  if (!id) return res.status(400).json({ error: "invalid id" });
  const pipeline_status = strParam(req.body?.pipeline_status);
  const outcome = strParam(req.body?.outcome);
  try {
    const cur = db.prepare(`SELECT id FROM job_postings WHERE id = ?`).get(id);
    if (!cur) return res.status(404).json({ error: "not found" });

    if (pipeline_status) db.prepare(`UPDATE job_postings SET pipeline_status = ? WHERE id = ?`).run(pipeline_status, id);
    if (outcome || outcome === "") db.prepare(`UPDATE job_postings SET outcome = ? WHERE id = ?`).run(outcome, id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

