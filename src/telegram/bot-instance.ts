import { Bot } from "grammy";
import { config } from "../config.js";

// ── Shared bot instance ───────────────────────────────
// Exported so both telegram.ts (message handlers) and
// confirmation.ts (inline keyboard callbacks) can share one Bot object.
// Use a dummy token when Telegram is disabled so the Bot constructor doesn't throw.
// The bot is never started/polled when disabled, so the token is irrelevant.
export const bot = new Bot(config.telegramBotToken || "DISABLED:0000000000:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

bot.catch((err) => {
  console.error("❌ Unhandled bot error:", err.message, err.error);
});
