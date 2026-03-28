import type { Context } from "grammy";
import { bot } from "./bot-instance.js";

export function agentText(r: string | { text: string }): string {
  return typeof r === "string" ? r : r.text;
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function splitMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx <= 0) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }
  return chunks;
}

export async function editOrFallback(
  ctx: Context,
  chatId: number,
  msgId: number,
  text: string,
  parseMode: "Markdown" | "HTML" = "Markdown",
  msgTracker: { add: (chatId: number, msgId: number) => void },
  trackedReply: (ctx: Context, chatId: number, text: string, opts?: any) => Promise<void>,
): Promise<void> {
  if (text.length <= 4096) {
    try {
      await bot.api.editMessageText(chatId, msgId, text, { parse_mode: parseMode });
      msgTracker.add(chatId, msgId);
      return;
    } catch { /* fall through to delete+reply */ }
  }
  try { await bot.api.deleteMessage(chatId, msgId); } catch { /* ignore */ }
  await trackedReply(ctx, chatId, text, { parse_mode: parseMode });
}
