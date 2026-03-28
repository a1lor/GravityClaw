import type { Request, Response } from "express";
import { db } from "../../memory/db.js";

const CATEGORY = "dashboard:settings";

function readSettings(): any {
  try {
    const row = db.prepare(`SELECT content FROM daily_cache WHERE category = ?`).get(CATEGORY) as any;
    if (!row?.content) return {};
    return JSON.parse(String(row.content));
  } catch {
    return {};
  }
}

function writeSettings(settings: any): void {
  db.prepare(`INSERT OR REPLACE INTO daily_cache (category, content, updated_at) VALUES (?, ?, date('now'))`)
    .run(CATEGORY, JSON.stringify(settings ?? {}));
}

export function getSettings(_req: Request, res: Response) {
  res.json(readSettings());
}

export function patchSettings(req: Request, res: Response) {
  const cur = readSettings();
  const next = { ...cur, ...(req.body && typeof req.body === "object" ? req.body : {}) };
  try {
    writeSettings(next);
    res.json({ ok: true, settings: next });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

