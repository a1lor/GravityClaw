import type { Request, Response } from "express";
import type { CvLibraryRow } from "../../types/db-rows.js";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { db } from "../../memory/db.js";
import { setProfileValue } from "../../memory/profile.js";
import { analyzeCvOnce } from "../../tools/jobs/cv-analyzer.js";

const require = createRequire(import.meta.url);
const PDFParse = require("pdf-parse");

const CV_DIR = path.join(process.cwd(), "data", "cvs");
const MAX_CV_BYTES = 5 * 1024 * 1024;

function ensureDir(): void {
  fs.mkdirSync(CV_DIR, { recursive: true });
}

function sanitizeFilename(input: string, fallback: string, maxLen = 80): string {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return fallback;
  // Prevent path traversal + weird control chars.
  const cleaned = trimmed
    .replace(/[/\\]/g, "_")
    .replace(/[\0\r\n\t]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
  return cleaned || fallback;
}

function normalizeCvJobType(jobType: string): "alternance" | "stage" | "cdi" | "general" {
  const j = String(jobType ?? "").trim().toLowerCase();
  if (j === "alternance") return "alternance";
  if (j === "stage") return "stage";
  if (j === "cdi") return "cdi";
  return "general";
}

function normalizeCvLanguage(language: string): "fr" | "en" {
  const l = String(language ?? "").trim().toLowerCase();
  return l.startsWith("en") ? "en" : "fr";
}

function normalizePdfExtension(originalName: string): string {
  const ext = path.extname(String(originalName ?? "")).toLowerCase();
  // We expect PDFs; force extension to ".pdf" to keep filenames predictable.
  return ext === ".pdf" ? ".pdf" : ".pdf";
}

export function listCvs(_req: Request, res: Response) {
  const rows = db.prepare(`SELECT * FROM cv_library ORDER BY job_type, language`).all();
  res.json(rows);
}

export async function uploadCv(req: Request, res: Response) {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  if (typeof file.size === "number" && file.size > MAX_CV_BYTES) {
    return res.status(413).json({ error: "CV too large (max 5MB)" });
  }

  const jobType = normalizeCvJobType(String(req.body?.job_type ?? "general"));
  const language = normalizeCvLanguage(String(req.body?.language ?? "fr"));
  const label = sanitizeFilename(String(req.body?.label ?? file.originalname ?? "CV"), "CV");

  ensureDir();

  const safeName = `cv_${jobType}_${language}_${Date.now()}${normalizePdfExtension(file.originalname)}`;
  const destPath = path.join(CV_DIR, safeName);
  fs.writeFileSync(destPath, file.buffer);

  let extractedText: string | null = null;
  try {
    if (String(file.originalname ?? "").toLowerCase().endsWith(".pdf")) {
      const data = await PDFParse(file.buffer);
      const t = String(data?.text ?? "").trim();
      extractedText = t ? t : null;
    }
  } catch (err) {
    console.warn("[cv-upload] PDF text extraction failed:", err);
  }

  const existing = db
    .prepare(`SELECT id, file_path FROM cv_library WHERE job_type = ? AND language = ?`)
    .get(jobType, language) as any;

  if (existing) {
    try { fs.unlinkSync(existing.file_path); } catch { /* ok */ }
    db.prepare(
      `UPDATE cv_library
       SET file_path = ?, file_name = ?, extracted_text = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(destPath, label, extractedText, existing.id);
  } else {
    db.prepare(
      `INSERT INTO cv_library (job_type, language, file_path, file_name, extracted_text)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(jobType, language, destPath, label, extractedText);
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
