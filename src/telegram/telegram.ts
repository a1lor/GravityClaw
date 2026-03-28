import { Context, InputFile, InlineKeyboard, Keyboard } from "grammy";
import { bot } from "./bot-instance.js";
import { appendDashboardRow } from "./keyboards.js";
import { config } from "../config.js";
import { runAgentLoop } from "../agent/agent.js";

import { session } from "../agent/session.js";
import { transcribeAudio } from "../stt/stt.js";
import { generateSpeech } from "../tts/tts.js";
import { downloadTelegramFile } from "./download.js";
import { handleConfirmationCallback } from "./confirmation.js";
import { handleSpontaneousCallback, SpontaneousDecision } from "./spontanee-confirmation.js";
import { getConversationCount } from "../memory/conversations.js";
import { chat } from "../llm/llm.js";
import { editSpontaneousEmail } from "../tools/jobs/spontanee.js";
import {
    isOnboarding,
    startOnboarding,
    handleOnboardingMessage,
    completeOnboardingWithCV,
    finishOnboardingAfterExtraction,
} from "./onboarding.js";
import {
    getAllProfile,
    isProfileComplete,
    PROFILE_QUESTIONS,
    setProfileValue,
    getProfileValue,
} from "../memory/profile.js";
import fs from "fs";
import path from "path";
import { sendHeartbeat, sendHeartbeatNoNews } from "../heartbeat/heartbeat.js";

import { db } from "../memory/db.js";

import { getConsoleBuffer } from "../logger.js";
import { agentText, esc, splitMessage } from "./helpers.js";

import {
    getUnappliedJobs,
    markApplied,
    formatJobListHTML,
    checkNewJobs,
    getUnnotifiedJobs,
    markNotified,
    getPipelineCounts,
} from "../tools/jobs/tracker.js";
import {
    getAuthUrl,
    startOAuthCallbackServer,
    isGmailReady,
    isGmailCredentialsConfigured,
} from "../tools/gmail/auth.js";
import {
    getTodayCost,
    getTotalCost,
    getTotalCalls,
    getTotalTokens,
} from "../usage/tracker.js";

// ── Button callback_data shortener ───────────────────
// Telegram limits callback_data to 64 bytes. Job IDs like "email:company:timestamp"
// can exceed this when prefixed. We map long IDs to short tokens.
const btnIdMap = new Map<string, string>();   // short token → real ID
let btnCounter = 0;

function btnData(prefix: string, id: string): string {
    const raw = `${prefix}${id}`;
    if (Buffer.byteLength(raw, "utf8") <= 64) return raw;
    const token = `${prefix}#${++btnCounter}`;
    btnIdMap.set(token, id);
    // Evict old entries to avoid memory leak (keep last 500)
    if (btnIdMap.size > 500) {
        const first = btnIdMap.keys().next().value;
        if (first) btnIdMap.delete(first);
    }
    return token;
}

function resolveBtn(data: string, prefix: string): string {
    if (btnIdMap.has(data)) return btnIdMap.get(data)!;
    return data.slice(prefix.length);
}

// ── State for aborting batch processes ──────────────
const abortedChats = new Set<number>();

// ── State for enhanced /setup onboarding ──────────────
const setupSessions = new Map<number, { step: number; data: Record<string, string> }>();

const SETUP_QUESTIONS = [
    { key: "name", question: "What's your full name?" },
    { key: "location", question: "Where are you based? (City, Country)" },
    { key: "timezone", question: "What's your timezone? (e.g., Europe/Paris)" },
    { key: "career_goal_short", question: "Short-term career goal? (next 6-12 months)" },
    { key: "career_goal_long", question: "Long-term career vision? (2-5 years)" },
    { key: "preferred_companies", question: "List 3-5 dream companies or company types:" },
    { key: "dealbreakers", question: "Any deal-breakers? (location, remote, tech stack, etc.)" },
    { key: "communication_style", question: "Preferred tone: formal, casual, or balanced?" },
];

// ── State for processing ──────────────────────────────
let isProcessing = false;
let processingTimeout: ReturnType<typeof setTimeout> | null = null;

function setProcessing(val: boolean) {
    isProcessing = val;
    if (processingTimeout) {
        clearTimeout(processingTimeout);
        processingTimeout = null;
    }
    if (val) {
        processingTimeout = setTimeout(() => {
            if (isProcessing) {
                console.warn("⚠️ Watchdog: isProcessing stuck for 2 mins, force resetting.");
                isProcessing = false;
                processingTimeout = null;
            }
        }, 120_000); // 2 minute safety net
    }
}
const mainKeyboard = new Keyboard()
    .text("Jobs").text("Mail")
    .row()
    .text("Pipeline").text("Spontanee")
    .row()
    .text("Dashboard").text("More")
    .resized().persistent();

const moreKeyboard = new Keyboard()
    .text("Profile").text("Stats")
    .row()
    .text("Model").text("Morning")
    .row()
    .text("Memories").text("News")
    .row()
    .text("←")
    .resized().persistent();

const spontaneeKeyboard = new Keyboard()
    .text("Lancer").text("Cibles")
    .row()
    .text("Stats").text("←")
    .resized().persistent();

const newsKeyboard = new Keyboard()
    .text("Headlines").text("Refresh")
    .row()
    .text("Clear").text("←")
    .resized().persistent();

// ── Per-chat menu stack for proper ← navigation ──────
const menuStack = new Map<number, string[]>();

function currentMenu(chatId: number): string {
    const stack = menuStack.get(chatId);
    return stack && stack.length > 0 ? stack[stack.length - 1] : "main";
}

function pushMenu(chatId: number, menu: string) {
    const stack = menuStack.get(chatId) ?? [];
    stack.push(menu);
    menuStack.set(chatId, stack);
}

function popMenu(chatId: number): string {
    const stack = menuStack.get(chatId);
    if (stack && stack.length > 0) stack.pop();
    return currentMenu(chatId);
}

const MENU_KEYBOARDS: Record<string, Keyboard> = {
    main: mainKeyboard,
    more: moreKeyboard,
    spontanee: spontaneeKeyboard,
    news: newsKeyboard,
};

// Button labels → action names
const BUTTON_TOOL_MAP: Record<string, string> = {
    // Main
    "Jobs":       "check_jobs",
    "Mail":       "check_emails",
    "Pipeline":   "show_pipeline",
    "Spontanee":  "spontanee_menu",
    "Dashboard":  "dashboard",
    "More":       "more_menu",
    // More
    "Profile":    "profile",
    "Model":      "model_menu",
    "Morning":    "morning_no_news",
    "Memories":   "list_memories",
    "News":       "news_menu",
    // Spontanee
    "Lancer":     "spontanee_launch",
    "Cibles":     "spontanee_targets",
    // News
    "Headlines":  "news_today",
    "Refresh":    "more_news",
    "Clear":      "clean_news",
    // Stats is context-dependent (handled in handleToolButton)
    "Stats":      "stats",
    // Navigation
    "←":          "nav_back",
};

// ── Security middleware: user ID whitelist ────────────
bot.use(async (ctx: Context, next) => {
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
        console.warn(`🔒 Blocked message from unauthorized user ID: ${userId}`);
        return;
    }
    await next();
});

// ── /stop — clear all pending states and go back to main ──
bot.command("stop", async (ctx) => {
    const chatId = ctx.chat.id;
    
    // Signal batch processes to stop
    abortedChats.add(chatId);
    
    // Clear all possible interactive states
    const { cancelAllPendingConfirmations } = await import("./spontanee-confirmation.js");
    cancelAllPendingConfirmations();
    
    activeSpontaneousEdits.delete(chatId);
    menuStack.delete(chatId);
    setProcessing(false);
    session.clear();
    
    await ctx.reply("🛑 Stopped. All pending actions cancelled.", {
        reply_markup: mainKeyboard,
    });
});

// ── Global Error Handler ─────────────────────────────
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`❌ Error while handling update ${ctx.update.update_id}:`, err.error);
    const errMsg = err.error instanceof Error ? err.error.message : String(err.error);
    
    // Try to notify the user if possible
    ctx.reply(`⚠️ **Global Bot Error**\n\n_${errMsg.slice(0, 500)}_`, { parse_mode: "Markdown" }).catch(() => {});
});

// ── /help — show all commands ──
bot.command("help", async (ctx) => {
    try {
        const helpText = `
📖 <b>Gravity Claw — Help</b>

<b>Main buttons</b>
Jobs — Check new job postings
Mail — Scan Gmail for job emails
Pipeline — Application status breakdown
Spontanee — Cold outreach menu
Dashboard — Open web dashboard
More — Profile, Stats, Model, Morning, Memories, News

<b>Smart features</b>
• Paste a URL → choose Rank or Apply
• Send a voice message → transcribed &amp; processed
• Send a PDF/docx → saved as your CV

<b>Slash commands</b>
/rank &lt;url&gt; — Score a job against your profile
/apply &lt;url&gt; — Scrape job &amp; generate cover letter
/applied &lt;id&gt; — Mark a job as applied
/checkjobs — Force-scan for new jobs
/add_target &lt;co&gt; &lt;email&gt; — Add outreach target
/spontanee_reset — Reset skipped targets
/cv_list — View CVs in library
/setup — Re-run onboarding
/mesh &lt;goal&gt; — Multi-step workflow
/gmail_setup — Connect Gmail
/compact — Summarize long history
/report_bug — Save diagnostic snapshot
/stop — Cancel everything &amp; reset
/restart — Soft-reset session

<b>Natural language</b>
• "what do I have today?" — calendar + gym
• "search [topic]" — web search
• "brainstorm [topic]" — creative ideas
`;
        await trackedReply(ctx, helpText, { parse_mode: "HTML" });
    } catch (e: any) {
        console.error("❌ /help error:", e);
        await ctx.reply("⚠️ Failed to display help. There might be a formatting error.");
    }
});

// ── Callback query handler (shell confirmation + tool buttons) ──
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Tool button callbacks start with "tool:"
    if (data.startsWith("tool:")) {
        const toolName = data.slice(5);
        await handleToolButton(ctx, toolName);
        return;
    }

    // Draft reply to a job email
    if (data.startsWith("draft_reply:")) {
        const emailId = Number(data.slice(12));
        await ctx.answerCallbackQuery();
        if (isProcessing) {
            await ctx.reply("⏳ Still processing your previous request — please wait a moment.");
            return;
        }
        const emailRow = db.prepare("SELECT * FROM job_emails WHERE id = ?").get(emailId) as any;
        if (!emailRow) {
            await ctx.reply("⚠️ Email not found.");
            return;
        }
        setProcessing(true);
        await ctx.reply("✍️ Drafting reply…");
        session.setChatId(ctx.chat!.id);
        try {
            const prompt = `Draft a concise, professional follow-up reply to this job application email. Write only the email body — no subject line, no extra commentary.\n\nFrom: ${emailRow.from_addr}\nSubject: ${emailRow.subject}\nContent: ${emailRow.snippet}`;
            const draft = agentText(await runAgentLoop(prompt));
            await ctx.reply(draft, { parse_mode: "Markdown" });
        } catch {
            await ctx.reply("⚠️ Failed to generate draft.");
        } finally {
            setProcessing(false);
            session.clear();
        }
        return;
    }

    // Inline "Mark Applied" buttons on job listings
    if (data.startsWith("applied:")) {
        const jobId = resolveBtn(data, "applied:");
        await ctx.answerCallbackQuery();
        const ok = markApplied(jobId);
        await ctx.reply(ok ? `✅ Marked as applied.` : `⚠️ Job not found.`);
        return;
    }

    // Spontaneous outreach confirmation buttons
    if (data.startsWith("sp_a:") || data.startsWith("sp_e:") || data.startsWith("sp_s:") || data.startsWith("sp_x:")) {
        await handleSpontaneousCallback(ctx);
        return;
    }

    // Manual model selection buttons
    if (data.startsWith("model:")) {
        const choice = data.slice(6);
        await ctx.answerCallbackQuery();
        
        if (choice === "auto") {
            session.setForcedModel(null);
            await ctx.editMessageText("🧠 **Auto-pilot engaged.** I will pick the best model dynamically.", { parse_mode: "Markdown" });
        } else if (choice === "cheap") {
            session.setForcedModel("google/gemini-2.0-flash-001");
            await ctx.editMessageText("⚡ **Cheap/Fast Mode.** Locked to Gemini Flash.", { parse_mode: "Markdown" });
        } else if (choice === "smart") {
            session.setForcedModel("anthropic/claude-3.7-sonnet");
            await ctx.editMessageText("💎 **Smart Mode.** Locked to Claude 3.7 Sonnet.", { parse_mode: "Markdown" });
        }
        return;
    }

    // Smart URL detection: Rank or Apply
    if (data.startsWith("url_rank:") || data.startsWith("url_apply:")) {
        const isRank = data.startsWith("url_rank:");
        const prefix = isRank ? "url_rank:" : "url_apply:";
        const url = resolveBtn(data, prefix);
        await ctx.answerCallbackQuery();

        if (isProcessing) {
            await ctx.reply("⏳ Still processing — wait a moment.");
            return;
        }

        setProcessing(true);
        session.setChatId(ctx.chat!.id);
        const chatId = ctx.chat!.id;

        if (isRank) {
            (async () => {
                const { MODEL_BEST } = await import("../llm/llm.js");
                await ctx.editMessageText(`📊 Ranking with **${MODEL_BEST}**…`, { parse_mode: "Markdown" });
                try {
                    const { executeTool } = await import("../tools/definitions.js");
                    const result = await executeTool("rank_job", { url });
                    await trackedReply(ctx, result, { parse_mode: "Markdown" });
                } catch (err) {
                    await trackedReply(ctx, `⚠️ Ranking failed: ${err instanceof Error ? err.message : String(err)}`);
                } finally {
                    setProcessing(false);
                    session.clear();
                }
            })().catch(console.error);
        } else {
            (async () => {
                const { MODEL_BEST } = await import("../llm/llm.js");
                await ctx.editMessageText(`⏳ Generating cover letter with **${MODEL_BEST}**…`, { parse_mode: "Markdown" });
                try {
                    const { runApplyWorkflow } = await import("../tools/jobs/apply.js");
                    const result = await runApplyWorkflow(url);
                    const langFlag = result.language === "fr" ? "🇫🇷" : "🇬🇧";
                    const header =
                        `✅ *${result.title}* @ ${result.company}\n` +
                        `${langFlag} Language: ${result.language === "fr" ? "Français" : "English"}\n` +
                        `📁 \`${result.folderPath}\`\n\n` +
                        `*Cover Letter:*\n`;
                    await trackedReply(ctx, header + result.coverLetter, { parse_mode: "Markdown" });
                } catch (err) {
                    await trackedReply(ctx, `⚠️ Apply failed: ${err instanceof Error ? err.message : String(err)}`);
                } finally {
                    setProcessing(false);
                    session.clear();
                }
            })().catch(console.error);
        }
        return;
    }

    // Everything else → shell confirmation
    await handleConfirmationCallback(ctx);
});

// ── Global bot message tracker (clean-screen UX) ─────
const msgTracker = {
    ids: new Map<number, number[]>(),
    add(chatId: number, msgId: number) {
        const arr = this.ids.get(chatId) ?? [];
        arr.push(msgId);
        this.ids.set(chatId, arr);
    },
};

// wipeChat — deletes ALL chat history visible to the bot:
//   1. Any tracked message IDs (bot-sent messages since startup)
//   2. Brute-force range backwards from the trigger message (covers
//      user messages + messages sent before tracking started)
// excludeIds: message IDs to spare (e.g. the new header just sent before the wipe)
async function wipeChat(ctx: Context, excludeIds: number[] = []): Promise<void> {
    const chatId = ctx.chat!.id;

    // Collect tracked IDs and reset tracker
    const trackedIds = [...(msgTracker.ids.get(chatId) ?? [])];
    msgTracker.ids.set(chatId, []);

    // We no longer brute-force 200 IDs (Fix #9). We only delete messages we explicitly track.
    const toDelete = new Set(trackedIds);
    const triggerMsgId = ctx.message?.message_id;
    if (triggerMsgId) toDelete.add(triggerMsgId);

    // Remove IDs we want to preserve (e.g. the new category header just sent)
    const exclude = new Set(excludeIds);
    for (const id of exclude) toDelete.delete(id);

    // Fire all deletes in parallel — failures are expected for gaps/expired messages
    await Promise.all([...toDelete].map((id) =>
        bot.api.deleteMessage(chatId, id).catch(() => { }),
    ));
}

// trackedReply — sends and registers the message for future clearAll
async function trackedReply(
    ctx: Context,
    text: string,
    options: Parameters<Context["reply"]>[1] = {},
): Promise<void> {
    const chatId = ctx.chat!.id;
    if (text.length <= 4096) {
        const msg = await ctx.reply(text, options);
        msgTracker.add(chatId, msg.message_id);
    } else {
        for (const chunk of splitMessage(text, 4000)) {
            const msg = await ctx.reply(chunk, options);
            msgTracker.add(chatId, msg.message_id);
        }
    }
}

// replyNews — tracked reply with link previews disabled
async function replyNews(ctx: Context, text: string, options: Parameters<Context["reply"]>[1] = {}): Promise<void> {
    await trackedReply(ctx, text, { ...options, link_preview_options: { is_disabled: true } });
}


// ── /start ────────────────────────────────────────────
bot.command("start", async (ctx) => {
    const chatId = ctx.chat.id;
    menuStack.delete(chatId);

    if (!isProfileComplete()) {
        await ctx.reply(
            "👋 *Gravity Claw online.*\n\nLooks like this is your first time — let me get to know you first.",
            { parse_mode: "Markdown", reply_markup: mainKeyboard },
        );
        await startOnboarding(chatId);
        return;
    }

    await ctx.reply(
        "🪐 *Gravity Claw online.*",
        { parse_mode: "Markdown", reply_markup: mainKeyboard },
    );
});

// ── /setup — enhanced onboarding ──────────────────────
bot.command("setup", async (ctx) => {
    const chatId = ctx.chat.id;
    setupSessions.set(chatId, { step: 0, data: {} });
    await ctx.reply(
        `🚀 **Onboarding - Step 1/${SETUP_QUESTIONS.length}**\n\n${SETUP_QUESTIONS[0].question}`,
        { parse_mode: "Markdown" },
    );
});

// ── Shared helpers ────────────────────────────────────

async function doProfile(ctx: Context): Promise<void> {
    const profile = getAllProfile();
    if (Object.keys(profile).length === 0) {
        await trackedReply(ctx, "No profile saved yet. Use /setup to set one up.");
        return;
    }

    const escapeHTML = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const lines = PROFILE_QUESTIONS.filter((q) => profile[q.key])
        .map((q) => `• <b>${q.label}:</b> ${escapeHTML(profile[q.key])}`)
        .join("\n");
    const cvFilename = getProfileValue("cv_filename");
    const cvLine = cvFilename
        ? `\n📄 <b>CV:</b> ${escapeHTML(cvFilename)}`
        : "\n📄 <b>CV:</b> Not uploaded — send a PDF or .docx";
    await trackedReply(ctx, `📋 <b>Your Profile</b>\n\n${lines}${cvLine}\n\nUse /setup to update.`, {
        parse_mode: "HTML",
    });
}

// ── Utility: generate 1-sentence TLDRs for job offers ─
async function generateJobTLDRs(jobs: Parameters<typeof formatJobListHTML>[0]): Promise<string[]> {
    if (jobs.length === 0) return [];
    try {
        const prompt = jobs
            .map((j, i) => `Job ${i + 1}: ${j.title} at ${j.company}, ${j.location}`)
            .join("\n");
        const { message } = await chat([{
            role: "user",
            content:
                `For each job below, write ONE sentence (max 12 words) on what the role likely involves.\n` +
                `Reply with ONLY the numbered list, nothing else.\n\n${prompt}`,
        }]);
        const lines = (message.content ?? "")
            .split("\n")
            .filter((l) => /^\d+\./.test(l.trim()))
            .map((l) => l.replace(/^\d+\.\s*/, "").trim());
        while (lines.length < jobs.length) lines.push("");
        return lines;
    } catch {
        return jobs.map(() => "");
    }
}

// ── /profile — show saved profile ────────────────────
bot.command("profile", async (ctx) => {
    await doProfile(ctx);
});

// ── /morning — trigger heartbeat manually ────────────
bot.command("morning", async (ctx) => {
    if (isProcessing) {
        await ctx.reply("⏳ Still processing — wait a moment.");
        return;
    }
    setProcessing(true);
    try {
        await ctx.reply("💓 Generating your morning check-in…");
        await sendHeartbeatNoNews();
    } catch (err) {
        console.error("❌ /morning error:", err);
        await ctx.reply("⚠️ Failed to generate morning check-in.");
    } finally {
        setProcessing(false);
    }
});

// ── /restart — soft-reset in-memory state ────────────
bot.command("restart", async (ctx) => {
    setProcessing(false);
    session.clear();
    await ctx.reply("🔄 Session reset.", { reply_markup: mainKeyboard });
});

// ── /compact — prune context aggressively ────────────
bot.command("compact", async (ctx) => {
    await ctx.reply("🧹 Compacting context window...");
    const { handleLongTermSummary } = await import("../agent/agent.js");
    const summary = await handleLongTermSummary(true);
    if (!summary) {
        await ctx.reply("Context is already clean.");
    } else {
        await ctx.reply("✅ Context summarized into long-term memory and wiped.");
    }
});

// ── /mesh — execute a decomposed mesh workflow ─────────
bot.command("mesh", async (ctx) => {
    const goal = ctx.match?.trim();
    if (!goal) {
        await ctx.reply(
            "Usage: `/mesh <your large specific goal>`\nExample: `/mesh research 3 AI startups in Paris and summarize them.`",
            { parse_mode: "Markdown" },
        );
        return;
    }
    const { runMeshWorkflow } = await import("../agent/mesh.js");
    // Run asynchronously so it doesn't block the telegram listener
    runMeshWorkflow(ctx.chat.id, goal).catch(console.error);
});

// ── /model — toggle overriding the LLM engine ──────────
bot.command("model", async (ctx) => {
    const current = session.getForcedModel() || "auto";
    const keyboard = new InlineKeyboard()
        .text(current === "auto" ? "✅ 🧠 Auto" : "🧠 Auto", "model:auto").row()
        .text(current === "google/gemini-2.0-flash-001" ? "✅ ⚡ Cheap (Flash)" : "⚡ Cheap (Flash)", "model:cheap").row()
        .text(current === "anthropic/claude-3.7-sonnet" ? "✅ 💎 Smart (Claude 3.7)" : "💎 Smart (Claude 3.7)", "model:smart").row();
        
    await ctx.reply(
        "⚙️ **Select your preferred brain.**\n\n_" + 
        "Auto: Automatically scale cost based on task complexity.\n" + 
        "Cheap: Force Gemini Flash for fast regular chatting.\n" + 
        "Smart: Force Claude Sonnet 3.7 for heavy logic tasks._",
        { parse_mode: "Markdown", reply_markup: keyboard }
    );
});

// ── /jobs — show tracked job postings ────────────────
bot.command("jobs", async (ctx) => {
    const jobs = getUnappliedJobs();
    if (jobs.length === 0) {
        await ctx.reply("No unapplied job postings tracked yet. They'll show up in your morning check-in.");
        return;
    }
    const keyboard = new InlineKeyboard();
    jobs.forEach((job) => {
        if (job.url) keyboard.url(`🔗 Apply — ${job.company}`, job.url);
        keyboard.text("✅ Applied", btnData("applied:", job.id)).row();
    });
    appendDashboardRow(keyboard, config.webappUrl, "/pipeline", config.dashboardToken);
    await ctx.reply(
        `💼 <b>${jobs.length} open posting${jobs.length > 1 ? "s" : ""}:</b>\n\n${formatJobListHTML(jobs)}`,
        { parse_mode: "HTML", reply_markup: keyboard },
    );
});

// ── /checkjobs — fetch now without waiting for 8 AM ──
bot.command("checkjobs", async (ctx) => {
    const keywords = getProfileValue("occupation") || "relevant jobs";
    const location = getProfileValue("location") || "your area";
    await ctx.reply(`🔍 Checking for new ${keywords} jobs in ${location}…`);
    try {
        await checkNewJobs();
        const unnotified = getUnnotifiedJobs();
        if (unnotified.length === 0) {
            await ctx.reply("No new postings since last check.");
            return;
        }
        for (const job of unnotified) markNotified(job.id);
        await ctx.reply("💬 Generating summaries…");
        const tlDRs = await generateJobTLDRs(unnotified);
        const keyboard = new InlineKeyboard();
        unnotified.forEach((job) => {
            if (job.url) keyboard.url(`🔗 Apply — ${job.company}`, job.url);
            keyboard.text("✅ Applied", btnData("applied:", job.id)).row();
        });
        appendDashboardRow(keyboard, config.webappUrl, "/pipeline", config.dashboardToken);
        await ctx.reply(
            `💼 <b>${unnotified.length} new posting${unnotified.length > 1 ? "s" : ""}:</b>\n\n${formatJobListHTML(unnotified, tlDRs)}`,
            { parse_mode: "HTML", reply_markup: keyboard },
        );
    } catch (err) {
        await ctx.reply("⚠️ Job check failed. Check the logs.");
        console.error(err);
    }
});

// ── /applied — mark a job as applied ─────────────────
// Usage: /applied <number from /jobs list, or job ID>
bot.command("applied", async (ctx) => {
    const arg = ctx.match?.trim();
    if (!arg) {
        await ctx.reply(
            "Usage: `/applied <number>` — use the number from the /jobs list.",
            { parse_mode: "Markdown" },
        );
        return;
    }

    // If it's a number, resolve it to the Nth job in the unapplied list
    const num = Number(arg);
    let jobId: string | undefined;

    if (!Number.isNaN(num) && num > 0) {
        const jobs = getUnappliedJobs();
        jobId = jobs[num - 1]?.id;
    } else {
        jobId = arg;
    }

    if (!jobId) {
        await ctx.reply("Job not found. Run /jobs to see current listings.");
        return;
    }

    const ok = markApplied(jobId);
    await ctx.reply(ok ? `✅ Marked as applied.` : `Job not found: \`${jobId}\``, {
        parse_mode: "Markdown",
    });
});

// ── /apply — scrape job + generate cover letter ──────
bot.command("apply", async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
        await ctx.reply(
            "Usage: `/apply <url>` — paste a LinkedIn or Welcome to the Jungle job URL.",
            { parse_mode: "Markdown" },
        );
        return;
    }

    if (isProcessing) {
        await ctx.reply("⏳ Still processing your previous request — please wait a moment.");
        return;
    }

    const { MODEL_BEST } = await import("../llm/llm.js");
    const statusMsg = await ctx.reply(`⏳ Analyzing job posting using **${MODEL_BEST}**… This takes 15–30 seconds.`, { parse_mode: "Markdown" });
    msgTracker.add(ctx.chat.id, statusMsg.message_id);

    setProcessing(true);
    try {
        const { runApplyWorkflow } = await import("../tools/jobs/apply.js");
        const result = await runApplyWorkflow(url);

        const langFlag = result.language === "fr" ? "🇫🇷" : "🇬🇧";
        const header =
            `✅ *${result.title}* @ ${result.company}\n` +
            `${langFlag} Language: ${result.language === "fr" ? "Français" : "English"}\n` +
            `📁 \`${result.folderPath}\`\n\n` +
            `*Cover Letter:*\n`;

        await trackedReply(ctx, header + result.coverLetter, { parse_mode: "Markdown" });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await trackedReply(ctx, `⚠️ Apply failed: ${msg}`);
        console.error("❌ /apply error:", err);
    } finally {
        setProcessing(false);
    }
});

// ── /rank — score a job 1-10 against the user's profile ──
bot.command("rank", async (ctx) => {
    const arg = ctx.match?.trim();
    if (!arg) {
        await ctx.reply(
            "Usage: `/rank <url>` — paste a LinkedIn or Welcome to the Jungle job URL.\nYou can also send me a job description and ask me to rank it.",
            { parse_mode: "Markdown" },
        );
        return;
    }

    if (isProcessing) {
        await ctx.reply("⏳ Still processing your previous request — please wait a moment.");
        return;
    }

    const { MODEL_BEST } = await import("../llm/llm.js");
    const statusMsg = await ctx.reply(`📊 Scraping and ranking this job using **${MODEL_BEST}**… give me a moment.`, { parse_mode: "Markdown" });
    msgTracker.add(ctx.chat.id, statusMsg.message_id);

    setProcessing(true);
    try {
        const { executeTool } = await import("../tools/definitions.js");
        const isUrl = arg.startsWith("http://") || arg.startsWith("https://");
        const result = await executeTool("rank_job", isUrl ? { url: arg } : { job_description: arg });
        await trackedReply(ctx, result, { parse_mode: "Markdown" });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await trackedReply(ctx, `⚠️ Ranking failed: ${msg}`);
        console.error("❌ /rank error:", err);
    } finally {
        setProcessing(false);
    }
});

// ── /pipeline — show full pipeline ───────────────────
bot.command("pipeline", async (ctx) => {
    const { getPipelineSummaryText, getPipelineByStatus } = await import("../tools/jobs/crm.js");
    const summary = getPipelineSummaryText();
    const pipeline = getPipelineByStatus();
    const details = Object.entries(pipeline)
        .filter(([, jobs]) => jobs.length > 0)
        .map(([status, jobs]) => {
            const label: Record<string, string> = { new: "🆕 New", saved: "📌 Saved", applied: "✅ Applied", interview: "🤝 Interview", offer: "🎉 Offer", rejected: "❌ Rejected" };
            return `\n${label[status] ?? status}:\n${jobs.map((j) => `  • <b>${esc(j.title)}</b> @ ${esc(j.company)}`).join("\n")}`;
        })
        .join("");
    await trackedReply(ctx, summary + details, { parse_mode: "HTML" });
});

// ── /add_target — add cold outreach target ────────────
// Usage: /add_target <Company> <email> [industry]
bot.command("add_target", async (ctx) => {
    const parts = (ctx.match ?? "").trim().split(/\s+/);
    if (parts.length < 2) {
        await ctx.reply("Usage: `/add_target <Company> <email> [industry]`", { parse_mode: "Markdown" });
        return;
    }
    const [company, hrEmail, ...industryParts] = parts;
    const industry = industryParts.join(" ");

    const { addTarget } = await import("../tools/jobs/spontanee.js");
    const added = addTarget(company, hrEmail, industry);
    await ctx.reply(
        added
            ? `✅ Added *${company}* (${hrEmail}) to outreach list.`
            : `⚠️ *${company}* with ${hrEmail} is already in the list.`,
        { parse_mode: "Markdown" },
    );
});

// ── /spontanee — batch cold outreach generator ────────
const DAILY_SPONTANEE_LIMIT = 5;

async function runSpontaneeBatch(ctx: Context, remaining: number) {
    const chatId = ctx.chat!.id;
    const { getPendingTargets, updateTargetStatus, generateSpontaneousEmail } = await import("../tools/jobs/spontanee.js");
    const { requestSpontaneousConfirmation } = await import("./spontanee-confirmation.js");
    const { sendEmail } = await import("../tools/gmail/sender.js");

    try {
        const targets = getPendingTargets(remaining);
        if (targets.length === 0) {
            await ctx.reply("📭 Aucune cible en attente. Ajoutez des entreprises avec /add_target.");
            return;
        }

        await ctx.reply(`📨 ${targets.length} cible(s) à traiter (${remaining} restante(s) aujourd'hui)…\nUse /stop to abort the batch at any time.`);
        
        abortedChats.delete(chatId);

        let sent = 0;
        let skipped = 0;

        for (const target of targets) {
            if (abortedChats.has(chatId)) break;

            try {
                await ctx.reply(`✍️ Génération de l'email pour *${target.company}*…`, { parse_mode: "Markdown" });
                const email = await generateSpontaneousEmail(target);
                
                if (abortedChats.has(chatId)) break;

                const decision = await requestSpontaneousConfirmation(
                    chatId,
                    target.company,
                    email.subject,
                    email.body,
                ) as SpontaneousDecision;

                if (decision === "approved") {
                    const cvPath = getProfileValue("cv_path") || undefined;
                    const recipient = "litvak.da@gmail.com";
                    await sendEmail(recipient, email.subject, email.body, undefined, cvPath);
                    updateTargetStatus(target.id, "sent", "", email.body, email.subject);
                    sent++;
                    await ctx.reply(`✅ Email envoyé à *${target.company}* (via ${recipient})${cvPath ? " (CV joint)" : ""}`, { parse_mode: "Markdown" });
                } else if (decision === "edit") {
                    await handleSpontaneousEdit(ctx, target, email.subject, email.body);
                    skipped++; 
                    // Note: Editing currently breaks the background loop (sequential fallback)
                    break;
                } else if (decision === "stopped") {
                    abortedChats.add(chatId);
                    break;
                } else {
                    updateTargetStatus(target.id, "skipped", decision === "timeout" ? "timeout" : "user_skip");
                    skipped++;
                }
            } catch (err) {
                console.error(`❌ /spontanee error for ${target.company}:`, err);
                await ctx.reply(`⚠️ Erreur pour *${target.company}* — ignoré.`, { parse_mode: "Markdown" });
                skipped++;
            }
        }

        const abortMsg = abortedChats.has(chatId) ? "🛑 Session arrêtée." : "";
        await ctx.reply(`${abortMsg}\n📊 Session terminée: *${sent}* envoyé(s), *${skipped}* ignoré(s).`, { parse_mode: "Markdown" });
    } catch (err) {
        console.error("❌ runSpontaneeBatch global error:", err);
        await ctx.reply("⚠️ Une erreur inattendue est survenue lors du traitement par lot.");
    } finally {
        setProcessing(false);
        session.clear();
    }
}

bot.command("spontanee", async (ctx) => {
    const { getDailySentCount } = await import("../tools/jobs/spontanee.js");
    const { isGmailReady } = await import("../tools/gmail/auth.js");

    if (!isGmailReady()) {
        await ctx.reply("📧 Gmail not connected. Run /gmail_setup first.");
        return;
    }

    if (isProcessing) {
        await ctx.reply("⏳ Still processing — wait a moment.");
        return;
    }

    const sentToday = getDailySentCount();
    const remaining = DAILY_SPONTANEE_LIMIT - sentToday;
    if (remaining <= 0) {
        await ctx.reply(`✅ Limite journalière atteinte (${DAILY_SPONTANEE_LIMIT}/jour). Revenez demain.`);
        return;
    }

    setProcessing(true);
    // Launch in background so worker thread is free to process /stop
    runSpontaneeBatch(ctx, remaining).catch(console.error);
});

// ── /spontanee_stats — show outreach statistics ───────
bot.command("spontanee_stats", async (ctx) => {
    const { getTargetStats } = await import("../tools/jobs/spontanee.js");
    await ctx.reply(getTargetStats(), { parse_mode: "HTML" });
});

// ── /spontanee_reset — reset skipped targets to pending ─
bot.command("spontanee_reset", async (ctx) => {
    const { resetSkippedTargets } = await import("../tools/jobs/spontanee.js");
    const changes = resetSkippedTargets();
    await ctx.reply(`🔄 Reset terminé: <b>${changes}</b> cibles remises en attente.`, { parse_mode: "HTML" });
});

// ── /seed_targets — seed DB from companies.json ───────
bot.command("seed_targets", async (ctx) => {
    try {
        const { readFileSync } = await import("fs");
        const { addTarget } = await import("../tools/jobs/spontanee.js");
        const companiesPath = new URL("../../data/companies.json", import.meta.url).pathname;
        const companies: { company: string; industry: string; hr_email: string; note: string }[] =
            JSON.parse(readFileSync(companiesPath, "utf-8"));

        let added = 0;
        let skipped = 0;
        for (const c of companies) {
            if (!c.hr_email) { skipped++; continue; }
            const ok = addTarget(c.company, c.hr_email, c.industry);
            if (ok) added++; else skipped++;
        }
        await ctx.reply(`✅ Seed terminé: <b>${added}</b> nouvelles cibles ajoutées, <b>${skipped}</b> ignorées (déjà existantes ou sans email).`, { parse_mode: "HTML" });
    } catch (err) {
        await ctx.reply(`⚠️ Seed échoué: ${err instanceof Error ? err.message : String(err)}`);
    }
});

// ── CV Library Management ─────────────────────────────
bot.command("cv_add", async (ctx) => {
    const args = ctx.message?.text.split(" ").slice(1) || [];
    if (args.length < 3) {
        await ctx.reply(
            "**Usage:** `/cv_add <job_type> <language> <file_path>`\n\n" +
            "**Example:** `/cv_add alternance fr /Users/david/cv_alternance_fr.pdf`\n\n" +
            "**Job types:** alternance, stage, cdi, general\n" +
            "**Languages:** fr, en",
            { parse_mode: "Markdown" }
        );
        return;
    }

    const [jobType, language, ...pathParts] = args;
    const filePath = pathParts.join(" ");

    const { addCV } = await import("../tools/cv-manager.js");
    const result = addCV(jobType as any, language as any, filePath);

    if (result.success) {
        await ctx.reply(`✅ CV added: **${jobType}** (${language})`, { parse_mode: "Markdown" });
    } else {
        await ctx.reply(`❌ Error: ${result.error}`);
    }
});

bot.command("cv_list", async (ctx) => {
    const { formatCVList } = await import("../tools/cv-manager.js");
    await ctx.reply(formatCVList(), { parse_mode: "Markdown" });
});

bot.command("cv_delete", async (ctx) => {
    const args = ctx.message?.text.split(" ").slice(1) || [];
    if (args.length === 0) {
        await ctx.reply("**Usage:** `/cv_delete <id>`\n\nGet the ID from `/cv_list`", { parse_mode: "Markdown" });
        return;
    }

    const { deleteCV } = await import("../tools/cv-manager.js");
    const success = deleteCV(Number(args[0]));

    await ctx.reply(success ? "✅ CV deleted" : "❌ CV not found");
});

bot.command("cv_set_default", async (ctx) => {
    const args = ctx.message?.text.split(" ").slice(1) || [];
    if (args.length === 0) {
        await ctx.reply("**Usage:** `/cv_set_default <id>`", { parse_mode: "Markdown" });
        return;
    }

    const { setDefaultCV } = await import("../tools/cv-manager.js");
    const success = setDefaultCV(Number(args[0]));

    await ctx.reply(success ? "✅ Default CV set" : "❌ Failed to set default");
});

// ── /report_bug — capture diagnostic snapshot ─────────
bot.command("report_bug", async (ctx) => {
    const description = ctx.message?.text.split(" ").slice(1).join(" ") || "No description provided";
    const timestamp = new Date().toISOString();

    const { getRecentHistory } = await import("../memory/conversations.js");
    const recentHistory = getRecentHistory(3);

    const bugReport = {
        timestamp,
        description,
        console_logs: getConsoleBuffer().slice(-100),
        conversation_context: recentHistory.map(m => ({
            role: m.role,
            content: (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))?.slice(0, 200) || "",
            tool_calls: (m as any).tool_calls ? "present" : "none"
        })),
        active_session: {
            chatId: session.getChatId(),
            forcedModel: session.getForcedModel(),
        }
    };

    const reportDir = path.join(process.cwd(), "data", "bug_reports");
    fs.mkdirSync(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, `report_${timestamp.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(bugReport, null, 2));

    const recentLogs = getConsoleBuffer().slice(-10).join("\n");

    await ctx.reply(
        `🐛 **Bug Report Saved**\n\n` +
        `**ID:** \`${timestamp}\`\n` +
        `**File:** \`${path.basename(reportPath)}\`\n\n` +
        `**Last 10 console entries:**\n` +
        `\`\`\`\n${recentLogs.slice(0, 800)}\`\`\``,
        { parse_mode: "Markdown" }
    );
});

// ── /gmail_setup — connect Gmail account ─────────────
bot.command("gmail_setup", async (ctx) => {
    if (!isGmailCredentialsConfigured()) {
        await ctx.reply(
            "⚠️ *Gmail not configured.*\n\n" +
            "You need to set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your `.env` first.\n\n" +
            "Here's how:\n" +
            "1. Go to [console.cloud.google.com](https://console.cloud.google.com)\n" +
            "2. Create a new project\n" +
            "3. Enable the *Gmail API* under APIs & Services\n" +
            "4. Go to Credentials → Create → OAuth 2.0 Client ID → *Desktop app*\n" +
            "5. Add `http://localhost:12350` to Authorised redirect URIs\n" +
            "6. Download the JSON and copy the `client_id` and `client_secret` into your `.env`\n" +
            "7. Then run `/gmail_setup` again.",
            { parse_mode: "Markdown" },
        );
        return;
    }

    const authUrl = getAuthUrl();
    if (!authUrl) {
        await ctx.reply("⚠️ Could not generate auth URL — check your Google credentials in `.env`.");
        return;
    }

    // Send the URL as plain text — Markdown parse mode mangles OAuth URLs
    // (underscores get treated as italic markers and truncate the URL)
    await ctx.reply("🔑 Connect your Gmail — open this link in your browser on this machine:");
    await ctx.reply(authUrl);
    await ctx.reply("After you approve, this bot will connect automatically.");

    try {
        await startOAuthCallbackServer();
        await ctx.reply("✅ Gmail connected! Job-related emails will now appear in your morning check-in.");
    } catch (err) {
        await ctx.reply(`❌ Gmail setup failed: ${(err as Error).message}`);
    }
});

// ── Spontaneous Edit Flow ─────────────────────────────
const activeSpontaneousEdits = new Map<number, { targetId: number; company: string; hrEmail: string; oldSubject: string; oldBody: string; }>();

async function handleSpontaneousEdit(ctx: Context, target: any, oldSubject: string, oldBody: string) {
    const chatId = ctx.chat!.id;
    activeSpontaneousEdits.set(chatId, {
        targetId: target.id,
        company: target.company,
        hrEmail: target.hr_email,
        oldSubject,
        oldBody,
    });
    session.setChatId(chatId);
    await ctx.reply(`✏️ Vous modifiez l'email pour *${target.company}*.\n\nEnvoyez-moi vos instructions (ex: "Plus court", "Mentionne mon projet RAG") et je le réécrirai.`);
}

// ── Handle text messages ──────────────────────────────
bot.on("message:text", async (ctx) => {
    const userMessage = ctx.message.text;
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    // Check if we are in enhanced setup onboarding
    if (setupSessions.has(chatId) && !userMessage.startsWith("/")) {
        if (isProcessing) {
            const waitMsg = await ctx.reply("⏳ Still processing — wait a moment.");
            msgTracker.add(chatId, waitMsg.message_id);
            return;
        }
        setProcessing(true);
        try {
            const setupSession = setupSessions.get(chatId)!;
            const currentQ = SETUP_QUESTIONS[setupSession.step];
            setupSession.data[currentQ.key] = userMessage;

            setupSession.step++;
            if (setupSession.step < SETUP_QUESTIONS.length) {
                await ctx.reply(
                    `✅ Got it!\n\n**Step ${setupSession.step + 1}/${SETUP_QUESTIONS.length}:**\n${SETUP_QUESTIONS[setupSession.step].question}`,
                    { parse_mode: "Markdown" }
                );
                return;
            }

            // Setup complete
            setupSessions.delete(chatId);

            for (const [key, value] of Object.entries(setupSession.data)) {
                setProfileValue(key, value);
            }

            const soulPath = path.join(process.cwd(), "data", "soul.md");
            const soulAddition = `\n\n--- FROM /setup (${new Date().toISOString()}) ---\n` +
                Object.entries(setupSession.data).map(([k, v]) => `- **${k}**: ${v}`).join("\n");
            fs.appendFileSync(soulPath, soulAddition);

            await ctx.reply("✅ **Setup complete!** Your preferences have been saved to my memory and core directives.", { parse_mode: "Markdown" });
        } catch (err) {
            console.error("❌ Setup onboarding error:", err);
            await ctx.reply("⚠️ Something went wrong during setup. Please try again.");
        } finally {
            setProcessing(false);
        }
        return;
    }

    // Check if we are in an active spontaneous edit session
    if (activeSpontaneousEdits.has(chatId)) {
        if (isProcessing) {
            const waitMsg = await ctx.reply("⏳ Still processing your previous message — please wait a moment.");
            msgTracker.add(chatId, waitMsg.message_id);
            return;
        }

        const editSession = activeSpontaneousEdits.get(chatId)!;
        activeSpontaneousEdits.delete(chatId);
        
        setProcessing(true);
        session.setChatId(chatId);
        await ctx.reply(`✍️ Modification de l'email pour *${editSession.company}*…`, { parse_mode: "Markdown" });
        
        try {
            const { updateTargetStatus } = await import("../tools/jobs/spontanee.js");
            const { requestSpontaneousConfirmation } = await import("./spontanee-confirmation.js");
            const { sendEmail } = await import("../tools/gmail/sender.js");

            const newEmail = await editSpontaneousEmail(editSession.oldSubject, editSession.oldBody, userMessage);
            
            const decision = await requestSpontaneousConfirmation(
                chatId,
                editSession.company,
                newEmail.subject,
                newEmail.body,
            );

            if (decision === "approved") {
                const cvPath = getProfileValue("cv_path") || undefined;
                const recipient = "litvak.da@gmail.com";
                await sendEmail(recipient, newEmail.subject, newEmail.body, undefined, cvPath);
                updateTargetStatus(editSession.targetId, "sent", "Edit successful", newEmail.body, newEmail.subject);
                await ctx.reply(`✅ Email envoyé à *${editSession.company}* (via ${recipient})${cvPath ? " (CV joint)" : ""}`, { parse_mode: "Markdown" });
            } else if (decision === "edit") {
                await handleSpontaneousEdit(ctx, { id: editSession.targetId, company: editSession.company, hr_email: editSession.hrEmail }, newEmail.subject, newEmail.body);
            } else {
                updateTargetStatus(editSession.targetId, "skipped", "Cancelled after edit");
            }
        } catch (e) {
            console.error("❌ Spontaneous edit error:", e);
            await ctx.reply(`⚠️ Erreur lors de la modification: ${String(e)}`);
        } finally {
            setProcessing(false);
            session.clear();
        }
        return;
    }

    // ── Check if it's a persistent keyboard button ──
    const toolName = BUTTON_TOOL_MAP[userMessage];
    if (toolName) {
        await handleToolButton(ctx, toolName);
        return;
    }

    // ── Smart URL detection: offer Rank / Apply inline ──
    const urlMatch = userMessage.trim().match(/^(https?:\/\/\S+)$/i);
    if (urlMatch) {
        const url = urlMatch[1];
        const kb = new InlineKeyboard()
            .text("Rank", btnData("url_rank:", url))
            .text("Apply", btnData("url_apply:", url));
        await ctx.reply("Link detected — what would you like to do?", { reply_markup: kb });
        return;
    }

    // Route to onboarding if active — bypasses the agent loop
    if (isOnboarding()) {
        if (isProcessing) {
            const waitMsg = await ctx.reply("⏳ Still processing — wait a moment.");
            msgTracker.add(chatId, waitMsg.message_id);
            return;
        }
        setProcessing(true);
        try {
            await handleOnboardingMessage(chatId, userMessage);
        } catch (err) {
            console.error("❌ Onboarding message error:", err);
            await ctx.reply("⚠️ Something went wrong during onboarding. Please try again.");
        } finally {
            setProcessing(false);
        }
        return;
    }

    if (isProcessing) {
        const waitMsg = await ctx.reply("⏳ Still processing your previous message — please wait a moment.");
        msgTracker.add(chatId, waitMsg.message_id);
        return;
    }

    console.log(`📩 [${userId}] ${userMessage}`);
    setProcessing(true);
    session.setChatId(chatId);
    abortedChats.delete(chatId);

    // Background Agent Loop
    (async () => {
        try {
            await ctx.replyWithChatAction("typing");
            const response = agentText(await runAgentLoop(userMessage));
            if (abortedChats.has(chatId)) return;
            await processAndSendResponse(ctx, userId, response, false);
        } catch (error) {
            console.error("❌ Agent loop error:", error);
            const errMsg = await ctx.reply("⚠️ Something went wrong. Check the logs.");
            msgTracker.add(chatId, errMsg.message_id);
        } finally {
            setProcessing(false);
            session.clear();
        }
    })().catch(console.error);
});

// ── Handle voice messages ─────────────────────────────
bot.on("message:voice", async (ctx) => {
    if (isProcessing) {
        const waitMsg = await ctx.reply("⏳ Still processing your previous message — please wait a moment.");
        msgTracker.add(ctx.chat.id, waitMsg.message_id);
        return;
    }

    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    console.log(`🎙️ [${userId}] Voice message received`);

    setProcessing(true);
    session.setChatId(chatId);
    abortedChats.delete(chatId);

    // Background Voice Processing
    (async () => {
        try {
            await ctx.replyWithChatAction("typing");

            const file = await ctx.getFile();
            const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
            const audioBuffer = await downloadTelegramFile(fileUrl);
            
            if (abortedChats.has(chatId)) return;
            
            const transcription = await transcribeAudio(audioBuffer);

            console.log(`📝 [${userId}] Transcribed: "${transcription}"`);
            const saidMsg = await ctx.reply(`🗣️ *You said:*\n_${transcription}_`, { parse_mode: "Markdown" });
            msgTracker.add(chatId, saidMsg.message_id);

            if (abortedChats.has(chatId)) return;

            const responseText = agentText(await runAgentLoop(transcription));
            
            if (abortedChats.has(chatId)) return;
            
            await processAndSendResponse(ctx, userId, responseText, true);
        } catch (error) {
            console.error("❌ Voice processing error:", error);
            const errMsg = await ctx.reply("⚠️ Sorry, I couldn't process your voice message.");
            msgTracker.add(chatId, errMsg.message_id);
        } finally {
            setProcessing(false);
            session.clear();
        }
    })().catch(console.error);
});

// esc() imported from ./helpers.js

// ── Utility: edit a message in-place, fallback to delete+reply ─
// Tries editMessageText first (≤4096 chars). If result is too long
// or edit fails, deletes the spinner and sends as a tracked reply.
// trackedReply handles chunking for long results.
async function editOrFallback(
    ctx: Context,
    chatId: number,
    msgId: number,
    text: string,
    parseMode: "Markdown" | "HTML" = "Markdown",
): Promise<void> {
    if (text.length <= 4096) {
        try {
            await bot.api.editMessageText(chatId, msgId, text, { parse_mode: parseMode });
            msgTracker.add(chatId, msgId);
            return;
        } catch { /* fall through to delete+reply */ }
    }
    try { await bot.api.deleteMessage(chatId, msgId); } catch { /* ignore */ }
    await trackedReply(ctx, text, { parse_mode: parseMode });
}

// ── Utility: handle tool button presses ──────────────
async function handleToolButton(ctx: Context, toolName: string) {
    // answerCallbackQuery only applies when triggered from an inline button,
    // not from the persistent reply keyboard (which sends a regular text message).
    if (ctx.callbackQuery) await ctx.answerCallbackQuery();

    try {
        switch (toolName) {
            case "list_memories": {
                const { listMemories } = await import("../memory/memories.js");
                const memories = listMemories(15);
                const memText = memories.length === 0
                    ? "No memories stored yet."
                    : `🧠 *Memories (${memories.length}):*\n\n` +
                    memories.map((m) => `#${m.id}${m.tags ? ` [${m.tags}]` : ""}: ${m.content}`).join("\n");
                const memMsg = await ctx.reply(memText, { parse_mode: "Markdown", reply_markup: mainKeyboard });
                await wipeChat(ctx, [memMsg.message_id]);
                break;
            }

            case "check_jobs": {
                if (isProcessing) { await ctx.reply("⏳ Still processing — wait a moment."); break; }
                const keywords = getProfileValue("occupation");
                const location = getProfileValue("location");
                if (!keywords || !location) {
                    await trackedReply(ctx, "⚠️ I don't have your search criteria yet. Please set your **Occupation** and **Location** in your profile (/setup) so I can search for you.");
                    break;
                }

                setProcessing(true);
                try {
                    // Show pipeline summary first
                    const counts = getPipelineCounts();
                    const total = Object.values(counts).reduce((a, b) => a + b, 0);
                    const pipelineText = total > 0
                        ? `💼 <b>Pipeline</b>\n\n🆕 <b>${counts.new ?? 0}</b> new  ✅ <b>${counts.applied ?? 0}</b> applied  🤝 <b>${counts.interview ?? 0}</b> interview  🎉 <b>${counts.offer ?? 0}</b> offer  ❌ <b>${counts.rejected ?? 0}</b> rejected\n\n<i>Searching for new jobs…</i>`
                        : `🔍 Checking for new ${keywords} jobs in ${location}…`;
                    await trackedReply(ctx, pipelineText, { parse_mode: "HTML" });

                    try {
                        await checkNewJobs();
                    } catch (fetchErr) {
                        console.error("❌ checkNewJobs failed:", fetchErr);
                        await trackedReply(ctx, "⚠️ Could not fetch fresh jobs (network error). Showing cached results.");
                    }
                    const unnotified = getUnnotifiedJobs();
                    if (unnotified.length === 0) {
                        await trackedReply(ctx, "✅ No new postings since last check.");
                    } else {
                        for (const job of unnotified) markNotified(job.id);
                        await trackedReply(ctx, "💬 Generating summaries…");
                        const tlDRs = await generateJobTLDRs(unnotified);
                        const keyboard = new InlineKeyboard();
                        unnotified.forEach((job) => {
                            if (job.url) keyboard.url(`🔗 Apply — ${job.company}`, job.url);
                            keyboard.text("✅ Applied", btnData("applied:", job.id)).row();
                        });
                        const hasButtons = keyboard.inline_keyboard.length > 0;
                        await trackedReply(ctx,
                            `💼 <b>${unnotified.length} new posting${unnotified.length > 1 ? "s" : ""}:</b>\n\n${formatJobListHTML(unnotified, tlDRs)}`,
                            { parse_mode: "HTML", ...(hasButtons ? { reply_markup: keyboard } : {}) },
                        );
                    }
                } finally {
                    setProcessing(false);
                }
                break;
            }

            case "check_emails": {
                if (isProcessing) { await ctx.reply("⏳ Still processing — wait a moment."); break; }
                if (!isGmailReady()) {
                    await trackedReply(ctx, "📧 Gmail not connected yet. Run /gmail_setup first.");
                } else {
                    setProcessing(true);
                    try {
                        const { checkJobEmails } = await import("../tools/gmail/checker.js");
                        const emails = await checkJobEmails();
                        if (emails.length === 0) {
                            await trackedReply(ctx, "📧 No new job-related emails in the last 24 hours.");
                        } else {
                            const icon = (s: string) => s === "positive" ? "🟢" : s === "negative" ? "🔴" : "⚪";
                            const text = emails.map((e) =>
                                `${icon(e.status)} <b>${esc(e.subject)}</b>\nFrom: ${esc(e.from)}\n<i>${esc(e.snippet.slice(0, 100))}</i>`
                            ).join("\n\n");
                            const positives = emails.filter((e) => e.status === "positive");
                            let draftKeyboard: InlineKeyboard | undefined;
                            if (positives.length > 0) {
                                draftKeyboard = new InlineKeyboard();
                                for (const e of positives) {
                                    const row = db.prepare("SELECT id FROM job_emails WHERE subject = ? AND from_addr = ?").get(e.subject, e.from) as { id: number } | undefined;
                                    if (row) {
                                        const label = `✍️ Reply — ${e.from.split("<")[0].trim().slice(0, 25)}`;
                                        draftKeyboard.text(label, `draft_reply:${row.id}`).row();
                                    }
                                }
                            }
                            await trackedReply(ctx,
                                `📧 <b>${emails.length} job email${emails.length > 1 ? "s" : ""}:</b>\n\n${text}`,
                                { parse_mode: "HTML", ...(draftKeyboard ? { reply_markup: draftKeyboard } : {}) },
                            );
                        }
                    } finally {
                        setProcessing(false);
                    }
                }
                break;
            }

            case "show_pipeline": {
                const { getPipelineSummaryText, getPipelineByStatus } = await import("../tools/jobs/crm.js");
                const summary = getPipelineSummaryText();
                const pipeline = getPipelineByStatus();
                const details = Object.entries(pipeline)
                    .filter(([, jobs]) => jobs.length > 0)
                    .map(([status, jobs]) => {
                        const label: Record<string, string> = { new: "🆕 New", saved: "📌 Saved", applied: "✅ Applied", interview: "🤝 Interview", offer: "🎉 Offer", rejected: "❌ Rejected" };
                        return `\n${label[status] ?? status}:\n${jobs.map((j) => `  • <b>${esc(j.title)}</b> @ ${esc(j.company)}`).join("\n")}`;
                    })
                    .join("");
                await trackedReply(ctx, summary + details, { parse_mode: "HTML" });
                break;
            }

            case "show_applications": {
                const { getAllJobEmails } = await import("../tools/gmail/checker.js");
                const emails = getAllJobEmails();
                if (emails.length === 0) {
                    await trackedReply(ctx, "📬 No application emails tracked yet. Tap 📧 Gmail to scan.");
                } else {
                    const pos = emails.filter((e: any) => e.status === "positive").length;
                    const neg = emails.filter((e: any) => e.status === "negative").length;
                    const neu = emails.filter((e: any) => e.status === "neutral").length;
                    const icon = (s: string) => s === "positive" ? "🟢" : s === "negative" ? "🔴" : "⚪";
                    let text = `📬 <b>Applications Summary</b>\n\n🟢 ${pos} positive  🔴 ${neg} rejected  ⚪ ${neu} other\n\n`;
                    text += emails.slice(0, 10).map((e: any) =>
                        `${icon(e.status)} <b>${esc(e.subject)}</b>\n  <i>${esc(e.from_addr)}</i>`
                    ).join("\n\n");
                    if (emails.length > 10) text += `\n\n<i>...and ${emails.length - 10} more. Open the Dashboard for the full view.</i>`;
                    await trackedReply(ctx, text, { parse_mode: "HTML" });
                }
                break;
            }

            case "dashboard": {
                const { getDashboardUrl } = await import("../dashboard/server.js");
                const msgs = (db.prepare("SELECT COUNT(*) as c FROM conversations").get() as any).c;
                const mems = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as any).c;
                const jobs = (db.prepare("SELECT COUNT(*) as c FROM job_postings").get() as any).c;
                const applied = (db.prepare("SELECT COUNT(*) as c FROM job_postings WHERE pipeline_status IN ('applied','interview','offer','rejected')").get() as any).c;
                
                // Prefer a public HTTPS URL for Telegram (Mini App). If we're running locally,
                // Telegram will reject localhost URLs in inline keyboard buttons.
                const baseUrl = config.webappUrl || getDashboardUrl();
                const token = config.dashboardToken;
                const sep = baseUrl.includes("?") ? "&" : "?";
                const url = token ? `${baseUrl}${sep}token=${token}` : baseUrl;

                const isHttps = url.startsWith("https://");
                const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");

                const keyboard = isLocalhost
                    ? undefined
                    : new InlineKeyboard().url("📊 Open Dashboard", url);

                const localHint = (!isHttps && isLocalhost)
                    ? `\n\n<b>Local:</b> open <code>${esc(url)}</code> in a browser on the same machine.\n` +
                      `<i>To open from your phone, set WEBAPP_URL to an HTTPS tunnel (see .env.example).</i>`
                    : "";
                await trackedReply(ctx,
                    `📊 <b>Dashboard</b>\n\n` +
                    `💬 ${msgs} messages  🧠 ${mems} memories\n` +
                    `💼 ${jobs} jobs tracked  📩 ${applied} applied\n\n` +
                    `<i>Full analytics, pipeline, and calendar →</i>${localHint}`,
                    keyboard ? { parse_mode: "HTML", reply_markup: keyboard } : { parse_mode: "HTML" }
                );
                break;
            }

            case "current_time": {
                const now = new Date().toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short", hour12: false, timeZone: "Europe/Paris" });
                await trackedReply(ctx, `🕐 ${now}`);
                break;
            }

            case "clean_news": {
                const { deleteCache } = await import("../memory/cache.js");
                deleteCache("news_briefing");
                await trackedReply(ctx, "🧹 News cache cleared! Tap *Headlines* or *Refresh* to fetch fresh stories.", { parse_mode: "Markdown" });
                break;
            }

            case "news_menu": {
                const chatId = ctx.chat!.id;
                pushMenu(chatId, "news");
                const newsMenuMsg = await ctx.reply("📰 News", { reply_markup: newsKeyboard });
                await wipeChat(ctx, [newsMenuMsg.message_id]);
                break;
            }

            case "more_menu": {
                const chatId = ctx.chat!.id;
                pushMenu(chatId, "more");
                const moreMsg = await ctx.reply("⚙️ More", { reply_markup: moreKeyboard });
                await wipeChat(ctx, [moreMsg.message_id]);
                break;
            }

            case "spontanee_menu": {
                const chatId = ctx.chat!.id;
                pushMenu(chatId, "spontanee");
                const spMsg = await ctx.reply("📨 Spontanee", { reply_markup: spontaneeKeyboard });
                await wipeChat(ctx, [spMsg.message_id]);
                break;
            }

            case "spontanee_launch": {
                if (isProcessing) { await ctx.reply("⏳ Still processing — wait a moment."); break; }
                const { getDailySentCount } = await import("../tools/jobs/spontanee.js");
                if (!isGmailReady()) {
                    await trackedReply(ctx, "📧 Gmail not connected. Run /gmail_setup first.");
                    break;
                }
                const sentToday = getDailySentCount();
                const remaining = DAILY_SPONTANEE_LIMIT - sentToday;
                if (remaining <= 0) {
                    await trackedReply(ctx, `✅ Daily limit reached (${DAILY_SPONTANEE_LIMIT}/day). Try again tomorrow.`);
                    break;
                }
                setProcessing(true);
                runSpontaneeBatch(ctx, remaining).catch(console.error);
                break;
            }

            case "spontanee_targets": {
                const { getPendingTargets, getTargetStats } = await import("../tools/jobs/spontanee.js");
                const pending = getPendingTargets(100);
                const statsText = getTargetStats();
                let text = statsText + "\n\n";
                if (pending.length === 0) {
                    text += "<i>No pending targets. Add with /add_target.</i>";
                } else {
                    text += `<b>Pending (${pending.length}):</b>\n` +
                        pending.slice(0, 15).map((t: any) =>
                            `  • <b>${esc(t.company)}</b> — ${esc(t.hr_email)}`
                        ).join("\n");
                    if (pending.length > 15) text += `\n  <i>...and ${pending.length - 15} more</i>`;
                }
                await trackedReply(ctx, text, { parse_mode: "HTML" });
                break;
            }

            case "morning_no_news": {
                if (isProcessing) { await ctx.reply("⏳ Still processing — wait a moment."); break; }
                setProcessing(true);
                try {
                    const morningMsg = await ctx.reply("💓 Generating briefing…");
                    msgTracker.add(ctx.chat!.id, morningMsg.message_id);
                    await sendHeartbeatNoNews();
                } finally { setProcessing(false); }
                break;
            }

            case "news_today": {
                if (isProcessing) { await ctx.reply("⏳ Still processing — wait a moment."); break; }
                setProcessing(true);
                try {
                    const loadMsg = await ctx.reply("📰 Fetching news…", { link_preview_options: { is_disabled: true } });
                    msgTracker.add(ctx.chat!.id, loadMsg.message_id);
                    const { getAINewsBriefing } = await import("../tools/news.js");
                    const news = await getAINewsBriefing();
                    try { await bot.api.deleteMessage(ctx.chat!.id, loadMsg.message_id); } catch { /* ignore */ }
                    await replyNews(ctx, news, { parse_mode: "HTML" });
                } finally { setProcessing(false); }
                break;
            }

            case "more_news": {
                if (isProcessing) { await ctx.reply("⏳ Still processing — wait a moment."); break; }
                setProcessing(true);
                try {
                    const { deleteCache } = await import("../memory/cache.js");
                    deleteCache("news_briefing");
                    const refreshMsg = await ctx.reply("🔄 Fetching fresh news…", { link_preview_options: { is_disabled: true } });
                    msgTracker.add(ctx.chat!.id, refreshMsg.message_id);
                    const { getAINewsBriefing } = await import("../tools/news.js");
                    const news = await getAINewsBriefing();
                    try { await bot.api.deleteMessage(ctx.chat!.id, refreshMsg.message_id); } catch { /* ignore */ }
                    await replyNews(ctx, news, { parse_mode: "HTML" });
                } finally { setProcessing(false); }
                break;
            }

            case "back_to_menu":
            case "nav_back":
            case "nav_home": {
                const chatId = ctx.chat!.id;
                const parentMenu = popMenu(chatId);
                const kb = MENU_KEYBOARDS[parentMenu] ?? mainKeyboard;
                const backMsg = await ctx.reply("–", { reply_markup: kb });
                await wipeChat(ctx, [backMsg.message_id]);
                break;
            }

            case "model_menu": {
                const current = session.getForcedModel() || "auto";
                const modelKb = new InlineKeyboard()
                    .text(current === "auto" ? "● Auto" : "Auto", "model:auto").row()
                    .text(current === "google/gemini-2.0-flash-001" ? "● Cheap" : "Cheap", "model:cheap").row()
                    .text(current === "anthropic/claude-3.7-sonnet" ? "● Smart" : "Smart", "model:smart").row();
                await trackedReply(ctx,
                    "Select model.\n\n" +
                    "_Auto — scales with complexity_\n" +
                    "_Cheap — Gemini Flash_\n" +
                    "_Smart — Claude 3.7 Sonnet_",
                    { parse_mode: "Markdown", reply_markup: modelKb },
                );
                break;
            }

            case "profile": {
                await doProfile(ctx);
                break;
            }

            case "stats": {
                const chatId = ctx.chat!.id;
                if (currentMenu(chatId) === "spontanee") {
                    const { getTargetStats } = await import("../tools/jobs/spontanee.js");
                    await trackedReply(ctx, getTargetStats(), { parse_mode: "HTML" });
                } else {
                    const msgCount = getConversationCount();
                    const memCount = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number }).c;
                    const todayCost = getTodayCost();
                    const totalCost = getTotalCost();
                    const totalCalls = getTotalCalls();
                    const totalTokens = getTotalTokens();
                    const formatTokens = (n: number) =>
                        n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);
                    await trackedReply(ctx,
                        `📈 *Stats*\n\n` +
                        `💬 Messages: *${msgCount}*\n` +
                        `🧠 Memories: *${memCount}*\n` +
                        `🔁 LLM calls: *${totalCalls}*\n` +
                        `🪙 Tokens: *${formatTokens(totalTokens)}*\n` +
                        `💰 Today: *$${todayCost.toFixed(4)}*\n` +
                        `💳 Total: *$${totalCost.toFixed(4)}*`,
                        { parse_mode: "Markdown" },
                    );
                }
                break;
            }

            case "cv": {
                const cvPath = getProfileValue("cv_path");
                const cvFilename = getProfileValue("cv_filename");
                if (cvPath && cvFilename) {
                    await trackedReply(ctx,
                        `📄 <b>CV on file:</b> <code>${esc(cvFilename)}</code>\n\n` +
                        `Saved at: <code>${esc(cvPath)}</code>\n\n` +
                        `<i>To update it, just send a new PDF or .docx file in this chat.</i>`,
                        { parse_mode: "HTML" },
                    );
                } else {
                    await trackedReply(ctx,
                        `📄 <b>No CV uploaded yet.</b>\n\n` +
                        `Send your CV as a <b>PDF</b> or <b>.docx</b> file directly in this chat and I'll save it for job applications.`,
                        { parse_mode: "HTML" },
                    );
                }
                break;
            }

            default:
                await trackedReply(ctx, `⚠️ Unknown tool: ${toolName}`);
        }
    } catch (error) {
        console.error(`❌ Tool button error [${toolName}]:`, error);
        await trackedReply(ctx, `⚠️ Tool "${toolName}" failed. Check the logs.`);
    }
}

// ── Utility: process text + <voice> tags ─────────────
async function processAndSendResponse(ctx: Context, userId: number, rawResponse: string, sendVoice: boolean) {
    const voiceRegex = /<voice>([\s\S]*?)<\/voice>/g;
    const voiceTexts: string[] = [];

    const textResponse = rawResponse
        .replace(voiceRegex, (_full, voiceContent: string) => {
            if (voiceContent.trim()) voiceTexts.push(voiceContent.trim());
            return "";
        })
        .trim();

    // If voice is disabled and the only content was in <voice> tags, use that as text
    const effectiveText = (!sendVoice && (textResponse === "" || textResponse === "(No response)") && voiceTexts.length > 0)
        ? voiceTexts.join("\n\n")
        : textResponse;

    // 1. Send the text part (if any)
    if (effectiveText.length > 0) {
        // We use HTML for the final response for maximum robustness.
        // We allow <b>, <i>, <code>, <a>, <pre> from the LLM if it uses them,
        // but we must be careful with unescaped & and <.
        // A simple trick: if the LLM uses markdown, we convert it to HTML first.
        
        let htmlText = effectiveText
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            // Convert simple markdown to HTML
            .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
            .replace(/\*(.*?)\*/g, "<i>$1</i>")
            .replace(/`(.*?)`/g, "<code>$1</code>")
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

        try {
            await trackedReply(ctx, htmlText, { parse_mode: "HTML" });
            console.log(`📤 [${userId}] Text response sent (${htmlText.length} chars as HTML)`);
        } catch (err) {
            console.warn(`⚠️ HTML parse failed, falling back to plaintext for user ${userId}. Error:`, err);
            try {
                // Retry without parse_mode (plaintext fallback)
                await trackedReply(ctx, effectiveText);
                console.log(`📤 [${userId}] Text response sent with plaintext fallback (${effectiveText.length} chars)`);
            } catch (fallbackErr) {
                console.error(`❌ Text response fallback failed completely for user ${userId}:`, fallbackErr);
            }
        }
    }

    // 2. Generate and send voice parts only for voice message inputs
    if (!sendVoice) return;

    if (voiceTexts.length > 0 && config.elevenlabsApiKey) {
        for (const [index, voiceText] of voiceTexts.entries()) {
            try {
                const cleanText = voiceText.replace(/[_*`[\]]/g, "");
                const voiceBuffer = await generateSpeech(cleanText);
                await ctx.replyWithVoice(new InputFile(voiceBuffer, `voice_${index}.mp3`));
                console.log(`🔊 [${userId}] Voice message sent (${cleanText.length} chars)`);
            } catch (ttsError) {
                console.error("⚠️ Failed to generate speech reply:", ttsError);
                await ctx.reply(
                    "⚠️ <i>Failed to generate the requested voice message.</i>",
                    { parse_mode: "HTML" },
                );
            }
        }
    } else if (voiceTexts.length > 0) {
        console.warn("⚠️ Agent tried to send a voice message, but ElevenLabs API key is missing.");
        await ctx.reply(
            "🎙️ <i>(Agent attempted to send a voice message, but TTS is not configured)</i>",
            { parse_mode: "HTML" },
        );
    }
}

// splitMessage() imported from ./helpers.js

// ── Handle photos / screenshots (vision support) ─────
bot.on("message:photo", async (ctx) => {
    if (isProcessing) {
        await ctx.reply("⏳ Still processing your previous message — please wait.");
        return;
    }

    setProcessing(true);

    try {
        await ctx.reply("👁️ Analyzing image...");

        // Get the highest resolution photo
        const photos = ctx.message.photo;
        const photo = photos[photos.length - 1];

        const file = await ctx.api.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

        // Download image as base64
        const buffer = await downloadTelegramFile(fileUrl);
        const base64Image = buffer.toString('base64');

        // Get caption if provided
        const caption = ctx.message.caption || "What's in this image?";

        console.log(`🖼️ Image received (${(buffer.length / 1024).toFixed(1)} KB), caption: "${caption}"`);

        // Call vision-enabled model
        const { chat: llmChat, MODEL_BEST } = await import("../llm/llm.js");
        const response = await llmChat(
            [
                {
                    role: "user",
                    content: [
                        { type: "text", text: caption },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`,
                            },
                        },
                    ],
                },
            ],
            undefined,
            "",
            1,
            MODEL_BEST // Force Claude vision model
        );

        const result = response.message.content || "I couldn't analyze this image.";
        await ctx.reply(result, { parse_mode: "Markdown" });

        console.log(`✅ Vision analysis complete`);
    } catch (err) {
        console.error("❌ Photo analysis error:", err);
        await ctx.reply("⚠️ Failed to analyze the image. Make sure I have vision model access.");
    } finally {
        setProcessing(false);
    }
});

// ── Handle CV / document uploads ─────────────────────
bot.on("message:document", async (ctx) => {
    if (isProcessing) {
        await ctx.reply("⏳ Still processing your previous message — please wait.");
        return;
    }

    const doc = ctx.message.document;
    const allowed = ["application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

    if (!allowed.includes(doc.mime_type ?? "")) {
        await ctx.reply("📎 Send your CV as a PDF or Word document (.pdf / .docx).");
        return;
    }

    const MAX_CV_BYTES = 25 * 1024 * 1024; // 25 MB
    if ((doc.file_size ?? 0) > MAX_CV_BYTES) {
        await ctx.reply("⚠️ File too large. Maximum CV size is 25 MB.");
        return;
    }

    setProcessing(true);
    try {
        await ctx.reply("📥 Saving your CV…");

        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
        const buffer = await downloadTelegramFile(fileUrl);

        const ext = path.extname(doc.file_name ?? ".pdf") || ".pdf";
        const savePath = path.resolve("data/cv/cv" + ext);
        fs.mkdirSync(path.dirname(savePath), { recursive: true });
        fs.writeFileSync(savePath, buffer);

        setProfileValue("cv_path", savePath);
        setProfileValue("cv_filename", doc.file_name ?? ("cv" + ext));
        // Reset extraction flag so the CV is re-analyzed on next heartbeat (or immediately below)
        setProfileValue("cv_profile_extracted", "");

        // ── CV sent during onboarding → extract profile + finish setup ──
        if (isOnboarding()) {
            console.log(`📄 CV saved to ${savePath}`);
            await completeOnboardingWithCV(ctx.chat.id);
            const { analyzeCvOnce } = await import("../tools/jobs/cv-analyzer.js");
            await analyzeCvOnce();
            await finishOnboardingAfterExtraction(ctx.chat.id);
            return;
        }

        await ctx.reply(
            `✅ CV saved: *${doc.file_name}*\n\nI'll reference it for job applications. ` +
            `You can update it anytime by sending a new file.`,
            { parse_mode: "Markdown" },
        );
        console.log(`📄 CV saved to ${savePath}`);
    } catch (err) {
        console.error("❌ CV upload error:", err);
        await ctx.reply("⚠️ Failed to save your CV. Check the logs.");
    } finally {
        setProcessing(false);
    }
});

// ── Export start/stop ─────────────────────────────────
export function startBot(): void {
    const run = async () => {
        while (true) {
            try {
                await bot.start({
                    onStart: async (botInfo) => {
                        console.log(`🤖 Gravity Claw online — @${botInfo.username}`);
                        console.log(`🔒 Whitelist: [${config.allowedUserIds.join(", ")}]`);
                        console.log(`📡 Long-polling active — no web server exposed`);

                        // Explicitly set the Telegram command menu
                        try {
                            await bot.api.setMyCommands([
                                { command: "start", description: "Initialize the bot" },
                                { command: "help", description: "Show commands & help" },
                                { command: "stop", description: "Cancel everything & reset" },
                                { command: "rank", description: "Score a job (rank <url>)" },
                                { command: "apply", description: "Generate cover letter (apply <url>)" },
                                { command: "checkjobs", description: "Force-scan for new jobs" },
                                { command: "add_target", description: "Add outreach target" },
                                { command: "setup", description: "Re-run onboarding" },
                                { command: "mesh", description: "Multi-step workflow (mesh <goal>)" },
                                { command: "gmail_setup", description: "Connect Gmail account" },
                                { command: "compact", description: "Summarize long history" },
                                { command: "restart", description: "Soft-reset session" },
                            ]);
                            console.log("✅ Command menu updated successfully.");
                        } catch (err) {
                            console.warn("⚠️ Failed to set bot commands:", err instanceof Error ? err.message : String(err));
                        }

                        // Send restart notification exactly once
                        const flagPath = path.resolve("data/.restart-notified");
                        if (!fs.existsSync(flagPath)) {
                            const chatId = config.allowedUserIds[0];
                            if (chatId) {
                                try {
                                    await bot.api.sendMessage(chatId, "🔄 Gravity Claw restarted and online.", {
                                        reply_markup: mainKeyboard,
                                    });
                                    fs.mkdirSync(path.dirname(flagPath), { recursive: true });
                                    fs.writeFileSync(flagPath, new Date().toISOString());
                                } catch { /* ignore */ }
                            }
                        }
                    },
                });
                break;
            } catch (err: any) {
                if (err.error_code === 409) {
                    console.log("⏳ Telegram polling conflict (409). Another instance is active. Retrying in 30s...");
                    await new Promise(r => setTimeout(r, 30000));
                } else {
                    console.error("❌ Bot fatal error:", err);
                    break;
                }
            }
        }
    };
    run().catch(e => console.error("❌ Polling loop failed:", e));
}

export function stopBot(): void {
    bot.stop();
}
