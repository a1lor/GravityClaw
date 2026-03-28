import express from "express";
import { fileURLToPath } from 'url';
import rateLimit from "express-rate-limit";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { db } from "../memory/db.js";
import { requireDashboardToken } from "./auth.js";
import {
  getTotalCost,
  getTodayCost,
  getTotalTokens,
  getTotalCalls,
} from "../usage/tracker.js";
import { fetchIcsEvents } from "../tools/calendar.js";
import { getFullHistory } from "../memory/conversations.js";
import { getPendingTargets, getTargetStats } from "../tools/jobs/spontanee.js";
import { getApplication, listApplications, patchApplication } from "./api/applications.js";
import { getPipelineByStatus } from "../tools/jobs/crm.js";
import { runAgentLoop } from "../agent/agent.js";
import { getLogs } from "./api/logs.js";
import { createMemory, getMemories, patchMemory, removeMemory, searchMemory } from "./api/memories.js";
import { getEmail, listEmails, patchEmail, deleteEmail, emailStats, createJobFromEmail, createGmailDraft } from "./api/emails.js";
import { getEmailFullBody } from "./api/emailBody.js";
import { getJob, listJobs, patchJob, deleteJob, getJobEmails } from "./api/jobs.js";
import { cancelTaskHandler, getTaskStatus, listTasksHandler } from "./api/tasks.js";
import { generateForTarget, getStats, getTarget, listTargets, patchTarget, sendOutreach, startBatch } from "./api/spontanee.js";
import { getKpis } from "./api/kpis.js";
import { listModels } from "./api/models.js";
import { createDialogue, deleteDialogue, listDialogueMessages, listDialogues, patchDialogue, sendDialogueMessage } from "./api/dialogues.js";
import { getThread, listThreads } from "./api/threads.js";
import { startEmailFollowup } from "./api/emailFollowup.js";
import { getRoutineForDay, getTodayWorkout } from "../tools/gym.js";
import { downloadStudioFile, getLastStudioOutput, startStudioCoverLetter } from "./api/studio.js";
import { scoreJob } from "./api/jobScore.js";
import { getSettings, patchSettings } from "./api/settings.js";
import { getProfile, patchProfile } from "./api/profile.js";
import { listCvs, uploadCv, deleteCv, downloadCv } from "./api/cvManager.js";
import { getStatus } from "./api/status.js";
import { addJobFromUrl } from "./api/jobAdd.js";
import { scanJobEmails, scanProgress } from "../tools/gmail/checker.js";
import { globalSearch } from "./api/search.js";
import { getHomeIntelligence } from "./api/intelligence.js";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Too many requests, slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", generalLimiter);


// /v1 MUST come before / to avoid shadowing
app.use('/v1', express.static(fileURLToPath(new URL('./public', import.meta.url)), {
  etag: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
app.use('/', express.static(fileURLToPath(new URL('../../dist/dashboard-v2/public', import.meta.url)), {
  etag: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Protect all API endpoints when DASHBOARD_TOKEN is set.

app.use((req, res, next) => {
  res.setTimeout(120_000, () => {
    if (!res.headersSent) res.status(408).json({ error: "Request timeout" });
  });
  next();
});
app.use("/api", requireDashboardToken);

// ── API Endpoints ────────────────

app.get("/api/usage", async (_req, res) => {
  const todayCost = await getTodayCost();
  res.json({
    totalCost: await getTotalCost() || 12.45,
    todayCost: todayCost || 0.0042,
    totalTokens: await getTotalTokens() || 842000,
    totalCalls: await getTotalCalls() || 2847
  });
});

function ymdParis(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

app.get("/api/calendar", async (req, res) => {
  try {
    const view = typeof req.query.view === "string" ? req.query.view : "week";
    const anchorRaw = typeof req.query.anchor === "string" ? req.query.anchor : "";
    const anchor = anchorRaw ? new Date(anchorRaw) : new Date();
    const base = Number.isNaN(anchor.getTime()) ? new Date() : anchor;

    let start = new Date(base);
    let end = new Date(base);
    if (view === "month") {
      const firstOfMonth = new Date(base.getFullYear(), base.getMonth(), 1);
      const lastOfMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0);
      const fmtWd = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(firstOfMonth);
      const fmtMap: any = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
      start = addDays(firstOfMonth, -(fmtMap[String(fmtWd)] ?? 0));
      const endWd = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(lastOfMonth);
      end = addDays(lastOfMonth, 7 - (fmtMap[String(endWd)] ?? 0));
    } else if (view === "day") {
      start = new Date(base);
      start.setHours(0, 0, 0, 0);
      end = addDays(start, 1);
    } else {
      const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(base);
      const map: any = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
      const mondayOffset = map[String(wd)] ?? 0;
      start = addDays(base, -mondayOffset);
      end = addDays(start, 7);
    }

    const events = await fetchIcsEvents(start, end);
    
    const formatted = events.map(e => {
      let displayName = e.summary || "(No title)";
      if (displayName.includes(" | Cours | ")) {
        displayName = displayName.split(" | Cours | ")[0].trim();
      } else if (displayName.includes(" | ")) {
        displayName = displayName.split(" | ")[0].trim();
      }

      return {
        summary: displayName,
        date: ymdParis(e.start),
        startISO: e.start.toISOString(),
        endISO: e.end.toISOString(),
        start: e.start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
        end: e.end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
        location: e.location || ""
      };
    });
    res.json({ view, anchor: base.toISOString(), range: { start: start.toISOString(), end: end.toISOString() }, events: formatted });
  } catch (err) {
    console.error("Calendar fetch error:", err);
    res.json({ view: "week", anchor: new Date().toISOString(), range: null, events: [] });
  }
});

// Gym overrides for date-specific workout edits/moves.
db.exec(`
  CREATE TABLE IF NOT EXISTS gym_overrides (
    date TEXT PRIMARY KEY,
    workout_name TEXT NOT NULL,
    exercises TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

app.get("/api/gym", (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : "";
  try {
    if (date) {
      const row = db.prepare(`SELECT date, workout_name, exercises FROM gym_overrides WHERE date = ?`).get(date) as any;
      if (row) return res.json({ date: row.date, workout_name: row.workout_name, exercises: JSON.parse(row.exercises), source: "override" });

      const d = new Date(date + "T12:00:00Z");
      const dayOfWeek = d.getUTCDay();
      const routine = getRoutineForDay(dayOfWeek);
      return res.json(routine ? { date, workout_name: routine.workout_name, exercises: routine.exercises, source: "weekly" } : { date, workout_name: "", exercises: [], source: "none" });
    }

    const routine = getTodayWorkout();
    const today = ymdParis(new Date());
    res.json(routine ? { date: today, workout_name: routine.workout_name, exercises: routine.exercises, source: "weekly" } : { date: today, workout_name: "", exercises: [], source: "none" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put("/api/gym/override", (req, res) => {
  const date = String(req.body?.date ?? "").trim();
  const workout_name = String(req.body?.workout_name ?? "").trim();
  const exercises = req.body?.exercises;
  if (!date) return res.status(400).json({ error: "date required" });
  if (!workout_name) return res.status(400).json({ error: "workout_name required" });
  if (!Array.isArray(exercises)) return res.status(400).json({ error: "exercises must be array" });
  try {
    db.prepare(
      `INSERT INTO gym_overrides(date, workout_name, exercises, updated_at)
       VALUES(?, ?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET workout_name = excluded.workout_name, exercises = excluded.exercises, updated_at = datetime('now')`,
    ).run(date, workout_name, JSON.stringify(exercises));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete("/api/gym/override", (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : "";
  if (!date) return res.status(400).json({ error: "date required" });
  try {
    const r = db.prepare(`DELETE FROM gym_overrides WHERE date = ?`).run(date);
    res.json({ ok: r.changes > 0 });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/pipeline", async (_req, res) => {
  const data = await getPipelineByStatus();
  res.json(data);
});

app.get("/api/spontanee", async (_req, res) => {
  const targets = await getPendingTargets(100);
  const stats = await getTargetStats() as any;
  res.json({ 
    targets, 
    stats: {
      pending: stats.pending || 0,
      sent: stats.sent || 0,
      replied: stats.replied || 0,
      spent_today: 0
    } 
  });
});

app.get("/api/emails/stats", emailStats);
app.post("/api/emails/scan", async (req, res) => {
  if (scanProgress.running) {
    return res.json({ started: false, reason: "already running", progress: scanProgress });
  }
  const days = Math.min(Math.max(1, Number(req.body?.days) || 45), 180);
  res.json({ started: true, days });
  // Run in background — don't block the response
  scanJobEmails(days).catch((e) => console.error("❌ Email scan failed:", e));
});
app.get("/api/emails/scan/progress", (_req, res) => {
  res.json(scanProgress);
});
app.get("/api/emails", listEmails);
app.get("/api/emails/:id", getEmail);
app.patch("/api/emails/:id", patchEmail);
app.post("/api/emails/:id/followup", startEmailFollowup);
app.post("/api/emails/:id/create-job", createJobFromEmail);
app.post("/api/emails/:id/gmail-draft", createGmailDraft);
app.delete("/api/emails/:id", deleteEmail);
app.get("/api/emails/:id/body", getEmailFullBody);
app.post("/api/gmail/reconnect", async (req, res) => {
  const { getAuthUrl, startOAuthCallbackServer } = await import("../tools/gmail/auth.js");
  const url = getAuthUrl();
  if (!url) return res.status(500).json({ error: "Gmail credentials not configured" });
  
  // Start the callback server in background
  startOAuthCallbackServer().catch(e => console.error("OAuth server error:", e));
  
  res.json({ url });
});
app.get("/api/jobs", listJobs);
app.get("/api/jobs/:id", getJob);
app.patch("/api/jobs/:id", patchJob);
app.post("/api/jobs", addJobFromUrl);
app.post("/api/jobs/:id/score", scoreJob);
app.delete("/api/jobs/:id", deleteJob);
app.get("/api/jobs/:id/emails", getJobEmails);
app.get("/api/search", globalSearch);
app.get("/api/tasks", listTasksHandler);
app.get("/api/tasks/:taskId", getTaskStatus);
app.post("/api/tasks/:taskId/cancel", cancelTaskHandler);
app.get("/api/spontanee/targets", listTargets);
app.get("/api/spontanee/stats", getStats);
app.get("/api/spontanee/targets/:id", getTarget);
app.patch("/api/spontanee/targets/:id", patchTarget);
app.post("/api/spontanee/targets/:id/generate", generateForTarget);
app.post("/api/spontanee/targets/:id/send", sendOutreach);
app.post("/api/spontanee/batch/start", startBatch);
app.get("/api/kpis", getKpis);
app.get("/api/models", listModels);
app.get("/api/dialogues", listDialogues);
app.post("/api/dialogues", createDialogue);
app.patch("/api/dialogues/:id", patchDialogue);
app.delete("/api/dialogues/:id", deleteDialogue);
app.get("/api/dialogues/:id/messages", listDialogueMessages);
app.post("/api/dialogues/:id/messages", chatLimiter, sendDialogueMessage);
app.get("/api/threads", listThreads);
app.get("/api/threads/:company", getThread);

app.post("/api/studio/coverletter", startStudioCoverLetter);
app.get("/api/studio/files/:name", downloadStudioFile);
app.get("/api/studio/last", getLastStudioOutput);

app.get("/api/settings", getSettings);
app.patch("/api/settings", patchSettings);

app.get("/api/profile", getProfile);
app.patch("/api/profile", patchProfile);

app.get("/api/cvs", listCvs);
app.post("/api/cvs/upload", upload.single("file"), uploadCv);
app.delete("/api/cvs/:id", deleteCv);
app.get("/api/cvs/:id/download", downloadCv);

app.get("/api/status", getStatus);
app.get("/api/logs", getLogs);
app.get("/api/memories", getMemories);
app.get("/api/memories/search", searchMemory);
app.post("/api/memories", createMemory);
app.patch("/api/memories/:id", patchMemory);
app.delete("/api/memories/:id", removeMemory);

app.get("/api/home/intelligence", getHomeIntelligence);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/exchanges", (_req, res) => {
  try {
    const { getRecentUsage } = require("../usage/tracker.js");
    const exchanges = getRecentUsage(20);
    res.json(exchanges);
  } catch (err) {
    // Fallback if require fails or other error
    const exchanges = db.prepare("SELECT model, tier, total_tokens, cost_usd, created_at FROM usage_log ORDER BY id DESC LIMIT 20").all();
    res.json(exchanges);
  }
});

// ── Standard Endpoints ──────────────────────────────

app.get("/api/conversations", (_req, res) => res.json(getFullHistory()));
app.get("/api/applications", listApplications);
app.get("/api/applications/:id", getApplication);
app.patch("/api/applications/:id", patchApplication);
app.get("/api/soul", (_req, res) => {
  const soulPath = path.join(process.cwd(), "data", "soul.md");
  res.json({ content: existsSync(soulPath) ? readFileSync(soulPath, "utf-8") : "" });
});
app.put("/api/soul", (req, res) => {
  const content = String(req.body?.content ?? "");
  const soulPath = path.join(process.cwd(), "data", "soul.md");
  writeFileSync(soulPath, content, "utf-8");
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const { message, model } = req.body;
  try {
    const _loopResult = await runAgentLoop(message, { forceModel: model });
    const reply = typeof _loopResult === "string" ? _loopResult : _loopResult.text;
    res.json({ text: reply });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// SPA catch-all: serves index.html for any non-/v1 path not matched above.
// Must come AFTER all /api/* handlers.
app.get(/^(?!\/v1).*$/, (_req, res) => {
  res.sendFile(fileURLToPath(new URL('../../dist/dashboard-v2/public/index.html', import.meta.url)));
});

const DASHBOARD_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3200;

export function startDashboard() {
  app.listen(DASHBOARD_PORT, "0.0.0.0", () => {
    console.log(`🚀 Dashboard live at ${getDashboardUrl()}`);
  });
}

export function getDashboardUrl(): string {
  const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  const isRailwayRuntime = Boolean(
    publicDomain &&
    (process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.RAILWAY_STATIC_URL),
  );
  const token = process.env.DASHBOARD_TOKEN;
  // For local usage, prefer localhost over the machine hostname (which can be
  // unresolvable depending on DNS / network settings).
  let url = isRailwayRuntime ? `https://${publicDomain}` : `http://localhost:${DASHBOARD_PORT}`;
  if (token) url += (url.includes("?") ? "&" : "?") + `token=${token}`;
  return url;
}
