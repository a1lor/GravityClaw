import type { Request, Response } from "express";
import { db } from "../../memory/db.js";

const MAX_LIMIT = 200;
const ALLOWED_LEVELS = new Set(["log", "warn", "err"]);

export function getLogs(req: Request, res: Response) {
  const level = typeof req.query.level === "string" ? req.query.level.trim() : "";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT) : 50;

  const where: string[] = [];
  const params: any[] = [];

  if (level && ALLOWED_LEVELS.has(level)) {
    where.push("t = ?");
    params.push(level);
  }
  if (q) {
    where.push("l LIKE ?");
    params.push(`%${q}%`);
  }

  const sql =
    `SELECT id, t as level, l as message, created_at ` +
    `FROM logs ` +
    (where.length ? `WHERE ${where.join(" AND ")} ` : "") +
    `ORDER BY created_at DESC ` +
    `LIMIT ?`;

  try {
    const rows = db.prepare(sql).all(...params, limit);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

