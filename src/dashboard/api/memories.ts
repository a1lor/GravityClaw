import type { Request, Response } from "express";
import {
  listMemories,
  searchMemories,
  saveMemory,
  updateMemory,
  deleteMemory,
} from "../../memory/memories.js";

function numParam(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function getMemories(req: Request, res: Response) {
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 500) : 100;
  res.json(listMemories(limit));
}

export function searchMemory(req: Request, res: Response) {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) return res.json([]);
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 200) : 50;
  res.json(searchMemories(q, limit));
}

export function createMemory(req: Request, res: Response) {
  const content = String(req.body?.content ?? "").trim();
  const tags = String(req.body?.tags ?? "").trim();
  const category = String(req.body?.category ?? "general").trim() || "general";

  if (!content) return res.status(400).json({ error: "content is required" });
  const id = saveMemory(content, category, tags);
  res.json({ id });
}

export function patchMemory(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const content = String(req.body?.content ?? "").trim();
  const tags = String(req.body?.tags ?? "").trim();
  const category = String(req.body?.category ?? "general").trim() || "general";

  if (!content) return res.status(400).json({ error: "content is required" });
  updateMemory(id, content, category, tags);
  res.json({ ok: true });
}

export function removeMemory(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });
  const ok = deleteMemory(id);
  res.json({ ok });
}

