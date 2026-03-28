import type { Request, Response } from "express";
import type { DialogueRow } from "../../types/db-rows.js";
import { db } from "../../memory/db.js";
import { runAgentLoop } from "../../agent/agent.js";

function numParam(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function listDialogues(_req: Request, res: Response) {
  const rows = db.prepare(
    `SELECT id, title, model, created_at, updated_at
     FROM dashboard_dialogues
     ORDER BY updated_at DESC, id DESC
     LIMIT 100`,
  ).all();
  res.json(rows);
}

export function createDialogue(req: Request, res: Response) {
  const title = String(req.body?.title ?? "New dialogue").trim() || "New dialogue";
  const model = String(req.body?.model ?? "google/gemini-2.0-flash-001").trim() || "google/gemini-2.0-flash-001";
  const result = db.prepare(
    `INSERT INTO dashboard_dialogues (title, model) VALUES (?, ?)`,
  ).run(title, model);
  res.json({ id: result.lastInsertRowid });
}

export function patchDialogue(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const title = req.body?.title !== undefined ? String(req.body.title).trim() : undefined;
  const model = req.body?.model !== undefined ? String(req.body.model).trim() : undefined;

  if (title === undefined && model === undefined) return res.json({ ok: true });

  const sets: string[] = ["updated_at = datetime('now')"];
  const params: any[] = [];
  if (title !== undefined) { sets.push("title = ?"); params.push(title || "Dialogue"); }
  if (model !== undefined) { sets.push("model = ?"); params.push(model); }
  params.push(id);

  const sql = `UPDATE dashboard_dialogues SET ${sets.join(", ")} WHERE id = ?`;
  const r = db.prepare(sql).run(...params);
  res.json({ ok: r.changes > 0 });
}

export function deleteDialogue(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  db.prepare(`DELETE FROM conversations WHERE dialogue_id = ?`).run(id);
  const r = db.prepare(`DELETE FROM dashboard_dialogues WHERE id = ?`).run(id);
  res.json({ ok: r.changes > 0 });
}

export function listDialogueMessages(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 300) : 100;

  const rows = db.prepare(
    `SELECT id, role, content, tool_calls, tool_call_id, created_at
     FROM conversations
     WHERE dialogue_id IS ?
     ORDER BY id DESC
     LIMIT ?`,
  ).all(id, limit) as any[];

  res.json(rows.reverse());
}

export async function sendDialogueMessage(req: Request, res: Response) {
  const id = numParam(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const message = String(req.body?.message ?? "").trim();
  if (!message) return res.status(400).json({ error: "message is required" });

  const dlg = db.prepare(`SELECT id, model FROM dashboard_dialogues WHERE id = ?`).get(id) as Pick<DialogueRow, "id" | "model"> | undefined;
  if (!dlg) return res.status(404).json({ error: "dialogue not found" });

  // Update dialogue updated_at immediately
  db.prepare(`UPDATE dashboard_dialogues SET updated_at = datetime('now') WHERE id = ?`).run(id);

  try {
    const result = await runAgentLoop(message, { forceModel: dlg.model, dialogueId: id });
    db.prepare(`UPDATE dashboard_dialogues SET updated_at = datetime('now') WHERE id = ?`).run(id);

    // Fetch the last saved user + assistant messages for this dialogue so the
    // frontend can append them optimistically without a full refetch.
    const lastMsgs = db.prepare(
      `SELECT id, role, content, created_at FROM conversations WHERE dialogue_id = ? ORDER BY id DESC LIMIT 10`,
    ).all(id) as any[];
    const assistantMessage = lastMsgs.find((m: any) => m.role === "assistant") ?? null;
    const userMessage     = lastMsgs.find((m: any) => m.role === "user")      ?? null;

    const text = typeof result === "string" ? result : result.text;
    const reasoning = typeof result === "string" ? undefined : result.reasoning;
    res.json({ text, reasoning, userMessage, assistantMessage });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

