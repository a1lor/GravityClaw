import type { Request, Response } from "express";
import { cancelTask, getTask, listTasks } from "../tasks.js";

export function listTasksHandler(_req: Request, res: Response) {
  res.json(listTasks());
}

export function getTaskStatus(req: Request, res: Response) {
  const id = String(req.params.taskId ?? "").trim();
  if (!id) return res.status(400).json({ error: "invalid taskId" });
  const t = getTask(id);
  if (!t) return res.status(404).json({ error: "not found" });
  res.json(t);
}

export function cancelTaskHandler(req: Request, res: Response) {
  const id = String(req.params.taskId ?? "").trim();
  if (!id) return res.status(400).json({ error: "invalid taskId" });
  const ok = cancelTask(id);
  res.json({ ok });
}

