// ── Gravity Claw — Entry Point ───────────────────────
// Validates config → starts Telegram bot → runs agent loop on incoming messages.
// Starts Telegram bot (long-polling) + Express dashboard on port 3200.

import { config } from "./config.js";
import { initLogger } from "./logger.js";
import { startBot, stopBot } from "./telegram/telegram.js";
import { startHeartbeat, sendHeartbeat } from "./heartbeat/heartbeat.js";
import { startDashboard } from "./dashboard/server.js";
import { initMcpServers } from "./mcp/bridge.js";

// ── Banner ───────────────────────────────────────────
initLogger();

console.log(`
  ╔══════════════════════════════════════╗
  ║     🪐 Gravity Claw v2.0.0         ║
  ║     Lean • Secure • Local-first     ║
  ╚══════════════════════════════════════╝
`);

// ── Start ────────────────────────────────────────────
// Railway deployment uses persistent volumes — no seeding required
// Data persists at /app/data (volume mount): memory.db, gmail-tokens.json, notes/, cv/

if (!config.disableTelegram) startBot();
if (!config.disableHeartbeat) startHeartbeat();
startDashboard();

setTimeout(async () => {
  // ── Morning briefing (if not already sent today) ─────
  try {
    if (!config.disableHeartbeat) await sendHeartbeat();

    // Also trigger memory evolution once a day alongside the briefing
    const { evolveMemories } = await import("./memory/evolve.js");
    if (!config.disableHeartbeat) await evolveMemories();
  } catch (e) {
    console.error("❌ Startup routine failed:", e);
  }
}, 5_000);

// MCP servers connect in background — non-blocking
initMcpServers().catch((e) => console.warn("⚠️ MCP init failed:", e));

// ── Clean shutdown ───────────────────────────────────
function shutdown(signal: string): void {
  console.log(`\n🛑 Received ${signal} — shutting down…`);
  if (!config.disableTelegram) stopBot();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
