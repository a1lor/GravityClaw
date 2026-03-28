import { bot } from "./bot-instance.js";
import {
    PROFILE_QUESTIONS,
    setProfileValue,
    getAllProfile,
    getProfileValue,
} from "../memory/profile.js";

// ── State ─────────────────────────────────────────────
// Single-user bot — module-level state is fine.
let onboardingIndex: number | null = null;

export function isOnboarding(): boolean {
    return onboardingIndex !== null;
}

// ── Start ─────────────────────────────────────────────
export async function startOnboarding(chatId: number): Promise<void> {
    onboardingIndex = 0;
    await bot.api.sendMessage(
        chatId,
        "🪐 *Welcome to Gravity Claw* — your personal AI, running locally on your machine.\n\n" +
        "Here's what I can do for you:\n\n" +
        "💬 *Chat* — ask me anything, I remember context across conversations\n" +
        "🧠 *Memory* — I automatically save facts about you and recall them later\n" +
        "📝 *Notes* — create and search Markdown notes by voice or text\n" +
        "💼 *Jobs* — every morning I surface the best job matches based on your profile with one-tap Apply buttons\n" +
        "📧 *Gmail* — I scan your inbox for application emails and summarise them with a TLDR\n" +
        "📊 *Dashboard* — full analytics view openable directly inside Telegram\n" +
        "🎙️ *Voice* — send voice messages, I transcribe and respond in kind\n" +
        "🖥️ *Shell* — run terminal commands with your approval\n" +
        "📄 *CV* — send me your CV as a file and I'll keep it on hand for applications\n\n" +
        "⚡ *Quick setup:* Send your CV as a PDF or Word file right now and I'll extract your profile automatically.\n\n" +
        "_Or answer the 6 questions below to fill it in manually. Type /skip to leave any blank._",
        { parse_mode: "Markdown" },
    );
    await sendCurrentQuestion(chatId);
}

// ── Handle a user reply during onboarding ─────────────
export async function handleOnboardingMessage(
    chatId: number,
    answer: string,
): Promise<void> {
    if (onboardingIndex === null) return;

    const question = PROFILE_QUESTIONS[onboardingIndex];
    const isSkip = answer.trim().toLowerCase() === "/skip";

    if (!isSkip) {
        setProfileValue(question.key, answer.trim());
    }

    onboardingIndex++;

    if (onboardingIndex >= PROFILE_QUESTIONS.length) {
        onboardingIndex = null;
        await sendCompletionMessages(chatId);
    } else {
        await sendCurrentQuestion(chatId);
    }
}

// ── Complete onboarding via CV (called from document handler) ─
export async function completeOnboardingWithCV(chatId: number): Promise<void> {
    onboardingIndex = null;
    const cvFilename = getProfileValue("cv_filename");
    await bot.api.sendMessage(
        chatId,
        `📄 CV received${cvFilename ? ` *(${cvFilename})*` : ""} — extracting your profile…`,
        { parse_mode: "Markdown" },
    );
}

export async function finishOnboardingAfterExtraction(chatId: number): Promise<void> {
    await sendCompletionMessages(chatId);
}

// ── Helpers ───────────────────────────────────────────
async function sendCurrentQuestion(chatId: number): Promise<void> {
    if (onboardingIndex === null) return;
    const { question } = PROFILE_QUESTIONS[onboardingIndex];
    const progress = `_(${onboardingIndex + 1}/${PROFILE_QUESTIONS.length})_  `;
    await bot.api.sendMessage(chatId, progress + question, {
        parse_mode: "Markdown",
    });
}

async function sendCompletionMessages(chatId: number): Promise<void> {
    const profile = getAllProfile();
    const summary = PROFILE_QUESTIONS.filter((q) => profile[q.key])
        .map((q) => `• *${q.label}:* ${profile[q.key]}`)
        .join("\n");

    await bot.api.sendMessage(
        chatId,
        `✅ *Profile saved!*\n\n${summary || "_No fields filled yet._"}\n\n` +
        "Use /profile to review it or /setup to update anytime.",
        { parse_mode: "Markdown" },
    );

    if (!profile.cv_filename) {
        await bot.api.sendMessage(
            chatId,
            "📄 *One last thing — your CV.*\n\n" +
            "Send me your CV as a PDF or Word file and I'll extract your profile automatically.\n\n" +
            "_You can skip this and send it later at any time._",
            { parse_mode: "Markdown" },
        );
    }

    await bot.api.sendMessage(
        chatId,
        "🚀 *You're all set. Here's how to use the keyboard:*\n\n" +
        "🧠 *Memories* — list saved facts about you\n" +
        "📝 *Notes* — list your notes\n" +
        "📧 *Gmail* — check for new job-related emails\n" +
        "💼 *Jobs* — fetch the latest job postings\n" +
        "💬 *Applications* — email application summary\n" +
        "📊 *Dashboard* — open the analytics view\n" +
        "💓 *Morning* — trigger the daily check-in now\n" +
        "📋 *Profile* — view your saved profile\n" +
        "📈 *Stats* — quick LLM usage & cost snapshot\n\n" +
        "Or just *send a message* — I'm listening.",
        { parse_mode: "Markdown" },
    );
}
