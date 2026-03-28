import type { Request, Response } from "express";
import { db } from "../../memory/db.js";
import { createTask, runTask } from "../tasks.js";
import { scrapeJobByUrl } from "../../tools/jobs/apply.js";
import { chat } from "../../llm/llm.js";

export function addJobFromUrl(req: Request, res: Response) {
  const url = String(req.body?.url ?? "").trim();
  if (!url) return res.status(400).json({ error: "url required" });

  const existing = db.prepare(`SELECT id FROM job_postings WHERE url = ?`).get(url) as any;
  if (existing) return res.json({ jobId: existing.id, taskId: null, message: "Job already tracked" });

  const t = createTask(`Add & score job from ${url}`);

  runTask(t.id, async ({ isCancelled, setMessage }) => {
    setMessage("Scraping job page…");
    const job = await scrapeJobByUrl(url);
    if (isCancelled()) return;

    const title = job.title || "Unknown Title";
    const company = job.company || new URL(url).hostname.replace("www.", "").split(".")[0];
    const location = job.location || "";
    const description = (job.description || "").slice(0, 8000);

    setMessage(`Saving: ${title} @ ${company}`);
    const id = `url_${Date.now()}`;
    db.prepare(
      `INSERT OR IGNORE INTO job_postings (id, title, company, location, url, description, source, pipeline_status, found_at)
       VALUES (?, ?, ?, ?, ?, ?, 'dashboard', 'new', datetime('now'))`,
    ).run(id, title, company, location, url, description);

    if (isCancelled()) return;
    setMessage("Scoring match…");

    const profileRows = db.prepare(`SELECT key, value FROM profile`).all() as any[];
    const profileText = profileRows
      .filter((r) => r.key && r.value)
      .slice(0, 40)
      .map((r) => `${r.key}: ${String(r.value).slice(0, 500)}`)
      .join("\n");

    const prompt =
      `You are helping score how good a job is for the candidate.\n` +
      `Return JSON ONLY: {"score": <0-100 integer>, "reasons": ["...", "...", "..."]}.\n` +
      `Scoring rubric: 0=terrible, 50=ok, 70=good, 85=great, 95=perfect.\n\n` +
      `Candidate profile:\n${profileText || "(empty)"}\n\n` +
      `Job:\nTitle: ${title}\nCompany: ${company}\nLocation: ${location}\nURL: ${url}\n\n` +
      `Description:\n${description.slice(0, 4000)}\n\nNow output the JSON.`;

    const { message } = await chat([{ role: "user", content: prompt }], undefined, "", 1, "meta-llama/llama-3.1-8b-instruct", true);
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
      reasons = [raw.slice(0, 300)];
    }

    db.prepare(`UPDATE job_postings SET job_score = ?, job_score_reason = ?, job_scored_at = datetime('now') WHERE id = ?`)
      .run(score, reasons.join("\n"), id);
    setMessage(`Done — ${score}% match`);
  });

  res.json({ taskId: t.id });
}
