import type { Request, Response } from "express";
import type { CvLibraryRow } from "../../types/db-rows.js";
import fs from "fs";
import path from "path";
import { db } from "../../memory/db.js";
import { setProfileValue } from "../../memory/profile.js";
import { analyzeCvOnce } from "../../tools/jobs/cv-analyzer.js";

const CV_DIR = path.join(process.cwd(), "data", "cvs");

function ensureDir(): void {
  fs.mkdirSync(CV_DIR, { recursive: true });
}

export function listCvs(_req: Request, res: Response) {
  const rows = db.prepare(`SELECT * FROM cv_library ORDER BY job_type, language`).all();
  res.json(rows);
}

export function uploadCv(req: Request, res: Response) {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const jobType = String(req.body?.job_type ?? "general").trim();
  const language = String(req.body?.language ?? "fr").trim();
  const label = String(req.body?.label ?? file.originalname ?? "CV").trim();

  ensureDir();

  const safeName = `cv_${jobType}_${language}_${Date.now()}${path.extname(file.originalname)}`;
  const destPath = path.join(CV_DIR, safeName);
  fs.writeFileSync(destPath, file.buffer);

  const existing = db
    .prepare(`SELECT id, file_path FROM cv_library WHERE job_type = ? AND language = ?`)
    .get(jobType, language) as any;

  if (existing) {
    try { fs.unlinkSync(existing.file_path); } catch { /* ok */ }
    db.prepare(
      `UPDATE cv_library SET file_path = ?, file_name = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(destPath, label, existing.id);
  } else {
    db.prepare(
      `INSERT INTO cv_library (job_type, language, file_path, file_name) VALUES (?, ?, ?, ?)`,
    ).run(jobType, language, destPath, label);
  }

  res.json({ ok: true, cvs: db.prepare(`SELECT * FROM cv_library ORDER BY job_type, language`).all() });

  // Fire-and-forget: update cv_path, clear extraction guard, re-extract profile
  console.log(`[cv-upload] Triggering profile re-extraction from ${destPath}`);
  setProfileValue("cv_path", destPath);
  setProfileValue("cv_profile_extracted", "");
  analyzeCvOnce().catch((err) => console.warn("[cv-upload] Profile re-extraction failed:", err));
}

export function deleteCv(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const row = db.prepare(`SELECT file_path FROM cv_library WHERE id = ?`).get(id) as any;
  if (row) {
    try { fs.unlinkSync(row.file_path); } catch { /* ok */ }
    db.prepare(`DELETE FROM cv_library WHERE id = ?`).run(id);
  }
  res.json({ ok: true });
}

export function downloadCv(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const row = db.prepare(`SELECT file_path, file_name FROM cv_library WHERE id = ?`).get(id) as any;
  if (!row || !fs.existsSync(row.file_path)) return res.status(404).json({ error: "not found" });
  res.download(row.file_path, row.file_name);
}
