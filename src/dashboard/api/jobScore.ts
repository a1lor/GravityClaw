import type { Request, Response } from "express";
import fs from "fs";
import { createRequire } from "module";
import { db } from "../../memory/db.js";
import { createTask, runTask } from "../tasks.js";
import { scrapeJobByUrl } from "../../tools/jobs/apply.js";
import { chat } from "../../llm/llm.js";

/** Extract plain text from a CV file (PDF or txt). Returns empty string on failure. */
async function extractCvText(): Promise<string> {
  try {
    const row = db.prepare(
      `SELECT file_path FROM cv_library ORDER BY CASE WHEN job_type = 'general' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`
    ).get() as any;
    if (!row?.file_path || !fs.existsSync(row.file_path)) return "";
    const buf = fs.readFileSync(row.file_path);
    if (row.file_path.toLowerCase().endsWith(".pdf")) {
      const req2 = createRequire(import.meta.url);
      const PDFParse = req2("pdf-parse");
      const data = await PDFParse(buf);
      return String(data.text ?? "").slice(0, 8000);
    }
    return buf.toString("utf-8").slice(0, 8000);
  } catch {
    return "";
  }
}

export function scoreJob(req: Request, res: Response) {
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "invalid id" });

  const row = db.prepare(`SELECT id, title, company, location, url FROM job_postings WHERE id = ?`).get(id) as any;
  if (!row) return res.status(404).json({ error: "not found" });

  const t = createTask(`Score job ${id}`);

  runTask(t.id, async ({ isCancelled, setMessage }) => {
    setMessage("Fetching job description…");
    const [job, cvText] = await Promise.all([
      row.url ? scrapeJobByUrl(String(row.url)) : null,
      extractCvText(),
    ]);
    if (isCancelled()) return;

    const profileRows = db.prepare(`SELECT key, value FROM profile`).all() as any[];
    const profileText = profileRows
      .filter((r) => r.key && r.value)
      .slice(0, 40)
      .map((r) => `${r.key}: ${String(r.value).slice(0, 500)}`)
      .join("\n");

    const prompt =
      `You are helping score how good a job is for the candidate.\n` +
      `Return JSON ONLY: {"score": <0-100 integer>, "reasons": ["...", "...", "..."]}.\n` +
      `Scoring rubric: 0=terrible, 50=ok, 70=good, 85=great, 95=perfect.\n` +
      `Prefer clarity and realism. If missing info, be conservative.\n\n` +
      (cvText ? `Candidate CV:\n${cvText}\n\n` : "") +
      `Candidate profile:\n${profileText || "(empty)"}\n\n` +
      `Job:\nTitle: ${row.title}\nCompany: ${row.company}\nLocation: ${row.location}\nURL: ${row.url}\n\n` +
      (job ? `Description:\n${String(job.description || "").slice(0, 4000)}\n\n` : "") +
      `Now output the JSON.`;

    setMessage("Scoring…");
    const { message } = await chat([{ role: "user", content: prompt }], undefined, "", 1, "google/gemini-2.0-flash-001", true);
    const raw = String(message.content ?? "");

    let score = 50;
    let reasons: string[] = [];
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const parsed = JSON.parse(start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw);
      score = Math.max(0, Math.min(100, Math.floor(Number(parsed.score))));
      reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map((x: any) => String(x)).slice(0, 3) : [];
    } catch {
      // fallback
      reasons = [raw.slice(0, 300)];
    }

    if (isCancelled()) return;
    db.prepare(`UPDATE job_postings SET job_score = ?, job_score_reason = ?, job_scored_at = datetime('now') WHERE id = ?`)
      .run(score, reasons.join("\n"), id);
    setMessage(`Done — ${score}`);
  });

  res.json({ taskId: t.id });
}

