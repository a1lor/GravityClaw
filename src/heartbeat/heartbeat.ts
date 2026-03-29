import cron from "node-cron";
import { bot } from "../telegram/bot-instance.js";
import { config } from "../config.js";
import { dashboardButton } from "../telegram/keyboards.js";
import { getAINewsBriefing } from "../tools/news.js";
import { analyzeCvOnce } from "../tools/jobs/cv-analyzer.js";
import { getRankedJobsBriefing } from "../tools/jobs/fetcher.js";
import { checkJobEmails, scanJobEmails, checkOutreachReplies, isGmailReady } from "../tools/gmail/checker.js";
import { getProfileValue } from "../memory/profile.js";
import { getPipelineCounts } from "../tools/jobs/tracker.js";
import { emitEvent } from "../events/emitter.js";

const HEARTBEAT_CRON = "0 8 * * *";
const EMAIL_SCAN_CRON = "1 8 * * *";   // 08:01 daily — scan last 24h of Gmail
const WEEKLY_CRON = "0 18 * * 0";
const REMINDER_CRON = "* * * * *";

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Time-aware greeting ──────────────────────────────
function buildGreeting(): string {
    const name = getProfileValue("name") || "there";
    const tz = getProfileValue("timezone") || "Europe/Paris";
    const now = new Date();

    let localHour: number;
    try {
        localHour = parseInt(now.toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: tz }), 10);
    } catch {
        localHour = now.getHours();
    }

    const greet = localHour < 12 ? "Good morning" : localHour < 18 ? "Good afternoon" : "Good evening";

    let dateStr: string;
    try {
        dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
    } catch {
        dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    }

    return `<b>${greet}, ${esc(name)}.</b>          ${dateStr}`;
}

// ── Section: Today (calendar + gym) ──────────────────
async function buildTodaySection(): Promise<string> {
    const parts: string[] = [];

    // Calendar
    try {
        const { getTodayEvents } = await import("../tools/calendar.js");
        const cal = await getTodayEvents();
        const lines = cal
            .replace(/📅\s*Today's schedule[^:]*:\s*/i, "")
            .replace(/No events today\.?/i, "")
            .trim();
        if (lines) {
            parts.push(lines);
        } else {
            parts.push("<i>No events today.</i>");
        }
    } catch {
        parts.push("<i>Calendar unavailable.</i>");
    }

    // Gym
    try {
        const { getTodayWorkout, formatRoutine } = await import("../tools/gym.js");
        const workout = getTodayWorkout();
        if (workout) {
            const formatted = formatRoutine(workout)
                .replace(/\*\*/g, "")
                .replace(/💪\s*/, "")
                .trim();
            parts.push(`💪 ${esc(formatted.split("\n")[0] || workout.workout_name)}`);
        } else {
            parts.push("💪 <i>Rest day</i>");
        }
    } catch {
        parts.push("💪 <i>Gym unavailable.</i>");
    }

    return `<b>── TODAY ──</b>\n${parts.join("\n")}`;
}

// ── Section: Pipeline snapshot ────────────────────────
function buildPipelineSection(): string {
    const p = getPipelineCounts();
    const total = Object.values(p).reduce((a, b) => a + b, 0);
    if (total === 0) return `<b>── PIPELINE ──</b>\n<i>No jobs tracked yet.</i>`;

    const parts: string[] = [];
    if (p.new) parts.push(`${p.new} new`);
    if (p.applied) parts.push(`${p.applied} applied`);
    if (p.interview) parts.push(`${p.interview} interview`);
    if (p.offer) parts.push(`${p.offer} offer`);
    if (p.rejected) parts.push(`${p.rejected} rejected`);

    return `<b>── PIPELINE ──</b>\n${parts.join(" · ")}`;
}

// ── Section: Follow-ups due ──────────────────────────
async function buildFollowupsSection(): Promise<string> {
    try {
        const { db } = await import("../memory/db.js");
        const due = db.prepare(`
            SELECT title, company FROM job_postings
            WHERE followup_at <= datetime('now')
              AND followup_sent_at IS NULL
              AND pipeline_status = 'applied'
        `).all() as { title: string; company: string }[];

        if (due.length === 0) return "";

        const lines = due.map(j => `  • <b>${esc(j.title)}</b> @ ${esc(j.company)}`).join("\n");
        db.prepare(`
            UPDATE job_postings SET followup_sent_at = datetime('now')
            WHERE followup_at <= datetime('now')
              AND followup_sent_at IS NULL
              AND pipeline_status = 'applied'
        `).run();

        return `<b>── FOLLOW-UPS ──</b>\n${due.length} overdue:\n${lines}`;
    } catch {
        return "";
    }
}

// ── Section: Emails ──────────────────────────────────
async function buildEmailsSection(): Promise<string> {
    if (!isGmailReady()) return "";

    try {
        const emails = await checkJobEmails();
        if (emails.length === 0) return `<b>── EMAILS ──</b>\n<i>No new job emails in the last 24h.</i>`;

        const { updateApplicationStatus } = await import("../tools/jobs/applications.js");

        const pos = emails.filter(e => e.status === "positive").length;
        const neg = emails.filter(e => e.status === "negative").length;

        const summary = `${emails.length} new email${emails.length > 1 ? "s" : ""}` +
            (pos ? ` (${pos} positive)` : "") +
            (neg ? ` (${neg} rejection${neg > 1 ? "s" : ""})` : "");

        const lines = emails.slice(0, 5).map(e => {
            const company = e.from.split("<")[0].trim().replace(/["']/g, "");
            const status = e.status === "positive" ? "Interview" :
                e.status === "negative" ? "Rejected" : "Updated";
            updateApplicationStatus(company, "Unknown (detected)", status, e.snippet);
            return `  ${status} — ${esc(company)}`;
        }).join("\n");

        return `<b>── EMAILS ──</b>\n${summary}\n${lines}`;
    } catch (err) {
        console.error("❌ Gmail briefing failed:", err);
        return "";
    }
}

// ── Section: Outreach ────────────────────────────────
async function buildOutreachSection(): Promise<string> {
    try {
        const { getPendingTargets } = await import("../tools/jobs/spontanee.js");
        const pending = getPendingTargets(100);
        if (pending.length === 0) return "";
        return `<b>── OUTREACH ──</b>\n${pending.length} compan${pending.length === 1 ? "y" : "ies"} pending`;
    } catch {
        return "";
    }
}

// ── Section: Daily Focus (LLM) ───────────────────────
async function buildDailyFocus(context: string): Promise<string> {
    const name = getProfileValue("name") || "User";
    try {
        const { chat } = await import("../llm/llm.js");
        const { message } = await chat([{
            role: "user",
            content:
                `You are Gravity Claw, ${name}'s AI career agent.\n` +
                `Based on today's briefing data below, write exactly 2 short sentences of actionable advice for today. ` +
                `Be specific — reference actual companies, interviews, or tasks from the data. ` +
                `Address ${name} directly.\n\n` +
                `TODAY'S DATA:\n${context}\n\n` +
                `IMPORTANT: Output raw Telegram HTML only. Use <b> and <i>. No markdown. No code fences. No prefix.`,
        }]);
        const focus = (message.content ?? "").trim();
        if (!focus) return "";
        return `<b>── FOCUS ──</b>\n${focus}`;
    } catch (err) {
        console.error("❌ Daily focus failed:", err);
        return "";
    }
}

// ── Send one Telegram message, splitting if >4000 chars ──
async function sendPart(chatId: number, text: string): Promise<void> {
    const MAX = 4000;
    if (text.length <= MAX) {
        await bot.api.sendMessage(chatId, text, {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
        });
        return;
    }
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > MAX) {
        const cut = remaining.lastIndexOf("\n\n", MAX);
        const idx = cut > 0 ? cut : MAX;
        chunks.push(remaining.slice(0, idx).trim());
        remaining = remaining.slice(idx).trim();
    }
    if (remaining) chunks.push(remaining);
    for (const chunk of chunks) {
        await bot.api.sendMessage(chatId, chunk, {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
        });
    }
}

// ── Core briefing builder ────────────────────────────
async function buildBriefing(includeNews: boolean): Promise<string[]> {
    await analyzeCvOnce();

    const greeting = buildGreeting();

    // Parallel fetch: all independent sections
    const [todaySection, emailsSection, outreachSection, followupsSection, jobsContent, newsContent] =
        await Promise.all([
            buildTodaySection().catch(() => ""),
            buildEmailsSection().catch(() => ""),
            buildOutreachSection().catch(() => ""),
            buildFollowupsSection().catch(() => ""),
            getRankedJobsBriefing().catch((e) => {
                console.error("❌ Jobs briefing failed:", e);
                return "";
            }),
            includeNews
                ? getAINewsBriefing().then(t => t.replace(/<br\s*\/?>/gi, "\n")).catch((e) => {
                    console.error("❌ News briefing failed:", e);
                    return "";
                })
                : Promise.resolve(""),
        ]);

    const pipelineSection = buildPipelineSection();

    // Build context summary for the LLM focus section
    const contextParts = [todaySection, pipelineSection, emailsSection, followupsSection, jobsContent].filter(Boolean);
    const focusSection = await buildDailyFocus(contextParts.join("\n")).catch(() => "");

    // Assemble the briefing as message parts (each sent separately)
    const part1Pieces = [greeting, "", todaySection, "", pipelineSection];
    if (followupsSection) part1Pieces.push("", followupsSection);
    if (emailsSection) part1Pieces.push("", emailsSection);
    if (outreachSection) part1Pieces.push("", outreachSection);

    const parts: string[] = [part1Pieces.filter(s => s !== undefined).join("\n")];

    if (includeNews && newsContent) {
        parts.push(`<b>── HEADLINES ──</b>\n${newsContent.replace(/^📰.*\n\n?/i, "").trim()}`);
    }

    if (jobsContent) {
        const cleanJobs = jobsContent.replace(/^💼.*\n\n?/i, "").trim();
        parts.push(`<b>── TOP JOBS ──</b>\n${cleanJobs}`);
    }

    if (focusSection) parts.push(focusSection);

    return parts.filter(Boolean);
}

// ── Send heartbeat (scheduled, with news) ────────────
// ── Auto-ice stale applications (2.5 weeks no response) ──
function autoIceStaleApplications(db: import("better-sqlite3").Database): number {
    try {
        const r = db.prepare(`
            UPDATE job_postings
            SET pipeline_status = 'iced'
            WHERE pipeline_status = 'applied'
              AND applied_at IS NOT NULL
              AND applied_at < datetime('now', '-17 days')
        `).run();
        if (r.changes > 0) console.log(`🧊 Auto-iced ${r.changes} stale application(s) (>2.5 weeks no response)`);
        return r.changes;
    } catch (e) {
        console.error("❌ Auto-ice failed:", e);
        return 0;
    }
}

export async function sendHeartbeat(): Promise<void> {
    const chatId = config.allowedUserIds[0];
    if (!chatId) {
        console.warn("⚠️ Heartbeat: no allowed user ID configured.");
        return;
    }

    try {
        const { db } = await import("../memory/db.js");
        autoIceStaleApplications(db);
        const today = new Date().toISOString().slice(0, 10);

        const row = db.prepare("SELECT content FROM daily_cache WHERE category = 'startup_briefing_date'").get() as { content: string } | undefined;
        if (row?.content === today) {
            console.log("💓 Briefing already sent today — skipping.");
            return;
        }

        console.log("💓 Generating morning briefing…");
        const parts = await buildBriefing(true);

        for (const part of parts) {
            if (part.trim()) await sendPart(chatId, part);
        }

        // Track 1: broadcast that the morning briefing is delivered.
        emitEvent("briefing_sent", null);

        // Send a dashboard button so the morning briefing is one tap from the full UI
        const btn = dashboardButton(config.webappUrl, "/", config.dashboardToken);
        if (btn) {
            await bot.api.sendMessage(chatId, "📊 <i>Full pipeline, inbox, and calendar →</i>", {
                parse_mode: "HTML",
                reply_markup: btn,
            });
        }

        db.prepare("INSERT OR REPLACE INTO daily_cache (category, content) VALUES ('startup_briefing_date', ?)").run(today);
        console.log(`💓 Morning briefing sent to [${chatId}]`);
    } catch (error) {
        console.error("❌ Heartbeat error:", error);
        try {
            await bot.api.sendMessage(chatId, "⚠️ Morning briefing failed to generate. Check the logs.");
        } catch { /* ignore */ }
    }
}

// ── Send heartbeat without news (manual) ─────────────
export async function sendHeartbeatNoNews(): Promise<void> {
    const chatId = config.allowedUserIds[0];
    if (!chatId) {
        console.warn("⚠️ Heartbeat: no allowed user ID configured.");
        return;
    }

    try {
        console.log("💓 Generating briefing (no news)…");
        const parts = await buildBriefing(false);

        for (const part of parts) {
            if (part.trim()) await sendPart(chatId, part);
        }

        // Track 1: broadcast that the morning briefing is delivered.
        emitEvent("briefing_sent", null);

        console.log(`💓 Briefing (no news) sent to [${chatId}]`);
    } catch (error) {
        console.error("❌ Heartbeat error:", error);
        try {
            await bot.api.sendMessage(chatId, "⚠️ Morning briefing failed to generate. Check the logs.");
        } catch { /* ignore */ }
    }
}

// ── Follow-up reminders (standalone, kept for non-briefing hours) ──
export async function checkFollowups(): Promise<void> {
    const chatId = config.allowedUserIds[0];
    if (!chatId) return;

    const { db } = await import("../memory/db.js");
    const due = db.prepare(`
        SELECT id, title, company, url FROM job_postings
        WHERE followup_at <= datetime('now')
          AND followup_sent_at IS NULL
          AND pipeline_status = 'applied'
    `).all() as { id: string; title: string; company: string; url: string }[];

    for (const job of due) {
        const msg = `📬 <b>Follow-up reminder</b>\n\nIt's been 7 days since you applied to <b>${esc(job.title)}</b> @ <b>${esc(job.company)}</b>. Any news?\n\n<a href="${job.url}">View posting ↗</a>`;
        const btn = dashboardButton(config.webappUrl, "/inbox", config.dashboardToken);
        try {
            await bot.api.sendMessage(chatId, msg, {
                parse_mode: "HTML",
                link_preview_options: { is_disabled: true },
                ...(btn ? { reply_markup: btn } : {}),
            });
            db.prepare("UPDATE job_postings SET followup_sent_at = datetime('now') WHERE id = ?").run(job.id);
        } catch (err) {
            console.error(`❌ Follow-up send failed for ${job.id}:`, err);
        }
    }
}

// ── Weekly review (Sunday 6 PM) ───────────────────────
export async function sendWeeklyReview(): Promise<void> {
    const chatId = config.allowedUserIds[0];
    if (!chatId) return;

    try {
        const { db } = await import("../memory/db.js");

        const appliedCount = (db.prepare(`SELECT COUNT(*) as c FROM job_postings WHERE applied_at >= date('now','-7 days')`).get() as any).c ?? 0;
        const newJobsCount = (db.prepare(`SELECT COUNT(*) as c FROM job_postings WHERE found_at >= date('now','-7 days')`).get() as any).c ?? 0;
        const emailsCount = (db.prepare(`SELECT COUNT(*) as c FROM job_emails WHERE created_at >= date('now','-7 days')`).get() as any).c ?? 0;
        const memoriesCount = (db.prepare(`SELECT COUNT(*) as c FROM memories WHERE created_at >= date('now','-7 days')`).get() as any).c ?? 0;
        const costRow = (db.prepare(`SELECT COALESCE(SUM(cost_usd),0) as c FROM usage_log WHERE created_at >= date('now','-7 days')`).get() as any);
        const weeklyCost = (costRow?.c ?? 0).toFixed(4);
        const pipeline = getPipelineCounts();

        const statsBlock =
            `📊 <b>Weekly Review</b>\n\n` +
            `<b>This week:</b>\n` +
            `• ${newJobsCount} new jobs found\n` +
            `• ${appliedCount} applications sent\n` +
            `• ${emailsCount} job emails received\n` +
            `• ${memoriesCount} new memories\n` +
            `• $${weeklyCost} LLM cost\n\n` +
            `<b>Pipeline:</b> ${pipeline.new ?? 0} new · ${pipeline.applied ?? 0} applied · ${pipeline.interview ?? 0} interview · ${pipeline.offer ?? 0} offer`;

        const { chat } = await import("../llm/llm.js");
        const { message } = await chat([{
            role: "user",
            content:
                `You are Gravity Claw, the user's AI job-search agent. Write a friendly 2-sentence week-in-review narrative based on these stats:\n\n${statsBlock}\n\n` +
                `IMPORTANT: Output raw Telegram HTML only. Use <b> and <i> tags. No markdown. No code fences. Append it after "Here's your week in review:".`,
        }]);

        const fullMsg = statsBlock + "\n\n" + (message.content ?? "");
        await sendPart(chatId, fullMsg);
        console.log("📅 Weekly review sent.");
    } catch (err) {
        console.error("❌ Weekly review failed:", err);
    }
}

// ── Reminders (every minute) ─────────────────────────
async function checkReminders(): Promise<void> {
    const chatId = config.allowedUserIds[0];
    if (!chatId) return;

    try {
        const { db } = await import("../memory/db.js");
        const nowUtc = new Date().toISOString();
        const due = db.prepare(`
            SELECT id, message FROM reminders
            WHERE due_at <= ?
              AND sent = 0
        `).all(nowUtc) as { id: number; message: string }[];

        for (const r of due) {
            try {
                await bot.api.sendMessage(chatId, `⏰ Reminder: ${r.message}`);
                emitEvent("reminder_fired", { message: r.message });
                db.prepare("UPDATE reminders SET sent = 1 WHERE id = ?").run(r.id);
            } catch (err) {
                console.error(`❌ Reminder send failed for #${r.id}:`, err);
            }
        }
    } catch { /* ignore — table may not exist yet */ }
}

// ── Daily email scan ──────────────────────────────────
async function runDailyEmailScan(): Promise<void> {
    if (!isGmailReady()) return;
    try {
        console.log("📧 Daily email scan — last 24h…");
        const results = await scanJobEmails(1);

        // Track 1: broadcast completion of the daily scan.
        emitEvent("email_scanned", { count: results.length });

        if (results.length > 0) {
            const userId = config.allowedUserIds[0];
            await bot.api.sendMessage(
                userId,
                `📬 *${results.length} new job email${results.length > 1 ? "s" : ""} found*\n` +
                results.map(r => `• ${r.subject} — ${r.stage ?? r.status}`).join("\n"),
                { parse_mode: "Markdown" }
            );
        } else {
            console.log("📧 Daily scan: no new job emails in last 24h");
        }

        // Track 4: detect replies to cold outreach and update spontaneous_targets.
        await checkOutreachReplies();
    } catch (err) {
        console.error("❌ Daily email scan failed:", err);
    }
}

// ── Start scheduler ───────────────────────────────────
export function startHeartbeat(): void {
    cron.schedule(HEARTBEAT_CRON, sendHeartbeat);
    cron.schedule(EMAIL_SCAN_CRON, runDailyEmailScan);
    cron.schedule(WEEKLY_CRON, sendWeeklyReview);
    cron.schedule(REMINDER_CRON, checkReminders);
    console.log("💓 Heartbeat scheduled — 8:00 AM daily, email scan 8:01 AM, weekly review Sundays 6 PM, reminders every minute");
}
