import type { Request, Response } from "express";
import { db } from "../../memory/db.js";

export interface CuratedModel {
  id: string;
  label: string;
}

const DEFAULT_MODELS: CuratedModel[] = [
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
  { id: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B" },
  { id: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku" },
  { id: "google/gemini-2.5-pro-exp-03-25:free", label: "Gemini 2.5 Pro" },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3" },
];

export function listModels(_req: Request, res: Response) {
  const raw = (process.env.DASHBOARD_MODELS_JSON ?? "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return res.json(parsed);
    } catch {
      // fall through
    }
  }
  // If not set in env, allow dashboard settings override (stored in daily_cache).
  try {
    const row = db.prepare(`SELECT content FROM daily_cache WHERE category = 'dashboard:settings'`).get() as any;
    const parsed = row?.content ? JSON.parse(String(row.content)) : null;
    if (parsed?.models && Array.isArray(parsed.models) && parsed.models.length > 0) return res.json(parsed.models);
  } catch {
    // ignore
  }
  res.json(DEFAULT_MODELS);
}

