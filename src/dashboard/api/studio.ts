import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import os from "os";
import PDFDocument from "pdfkit";
import { createTask, runTask } from "../tasks.js";
import { generateCoverLetter, scrapeJobByUrl } from "../../tools/jobs/apply.js";
import { db } from "../../memory/db.js";

function safeName(s: string): string {
  return String(s || "file")
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function isRailway(): boolean {
  return Boolean(process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_PUBLIC_DOMAIN);
}

function exportRoot(): string {
  if (isRailway()) return path.join(process.cwd(), "data", "studio");
  return "/Users/davidlitvak/Desktop/Aivancity/3_Annee/Alternance";
}

function writePdf(filePath: string, title: string, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 54 });
    const out = fs.createWriteStream(filePath);
    out.on("finish", () => resolve());
    out.on("error", reject);
    doc.on("error", reject);

    doc.fontSize(15).text(title, { underline: true });
    doc.moveDown(1);
    doc.fontSize(11).text(body, { lineGap: 4 });
    doc.end();
    doc.pipe(out);
  });
}

export function startStudioCoverLetter(req: Request, res: Response) {
  const url = String(req.body?.url ?? "").trim();
  const manualText = String(req.body?.text ?? "").trim();
  if (!url && !manualText) return res.status(400).json({ error: "url or text required" });

  const t = createTask(manualText ? "Sync cover letter to Desktop" : `Generate cover letter for ${url}`);

  runTask(t.id, async ({ isCancelled, setMessage, setProgress }) => {
    let letter: string;
    let title = "Cover Letter";
    let company = "Manual";

    setProgress(10); // Starting
    if (manualText) {
      letter = manualText;
      setMessage("Preparing edited letter…");
    } else {
      setMessage("Scraping job…");
      setProgress(20);
      const job = await scrapeJobByUrl(url);
      if (isCancelled()) return;
      setProgress(40);

      setMessage("Generating cover letter…");
      const language = job.description && job.description.match(/[éèêëàâùûüçîïôœæ]/i) ? "fr" : "en";
      letter = await generateCoverLetter(job.title, job.company, job.description, language as any);
      if (isCancelled()) return;
      setProgress(90);
      title = job.title;
      company = job.company;
    }

    setMessage("Saving files…");
    const root = exportRoot();
    const folder = path.join(root, "cover-letters");
    fs.mkdirSync(folder, { recursive: true });

    const base = `${safeName(company)} - ${safeName(title)} - ${new Date().toISOString().slice(0, 10)}`;
    const txtName = `${base}.txt`;
    const pdfName = `${base}.pdf`;
    const txtPath = path.join(folder, txtName);
    const pdfPath = path.join(folder, pdfName);

    fs.writeFileSync(txtPath, letter, "utf-8");
    await writePdf(pdfPath, `${title} — ${company}`, letter);

    const payload = JSON.stringify({
      job: { title, company, url },
      text: letter,
      files: [{ kind: "txt", name: txtName }, { kind: "pdf", name: pdfName }]
    });
    try {
      db.prepare(`INSERT OR REPLACE INTO daily_cache (category, content, updated_at) VALUES ('studio:last', ?, date('now'))`).run(payload);
    } catch { /* ok */ }

    setProgress(100);
    setMessage(`Done — ${pdfName}`);
  });

  res.json({ taskId: t.id });
}

export function downloadStudioFile(req: Request, res: Response) {
  const name = String(req.params.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "name required" });
  const root = path.join(exportRoot(), "cover-letters");
  const full = path.join(root, name);
  if (!full.startsWith(root)) return res.status(400).json({ error: "invalid path" });
  if (!fs.existsSync(full)) return res.status(404).json({ error: "not found" });
  res.download(full);
}

export function getLastStudioOutput(_req: Request, res: Response) {
  try {
    const row = db.prepare(`SELECT content, updated_at FROM daily_cache WHERE category = 'studio:last'`).get() as any;
    if (!row) return res.json(null);
    const parsed = JSON.parse(String(row.content || "null"));
    res.json({ ...parsed, updated_at: row.updated_at });
  } catch {
    res.json(null);
  }
}
