import { InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { randomUUID } from "crypto";
import { bot } from "./bot-instance.js";

// ── Pending confirmations ─────────────────────────────
interface PendingConfirmation {
    resolve: (approved: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
    type: "shell" | "email";
}

const pending = new Map<string, PendingConfirmation>();

// Callback data prefixes — kept short to stay inside Telegram's 64-byte limit.
const APPROVE_PREFIX = "sa:";
const DENY_PREFIX = "sd:";

// ── Shell Request ─────────────────────────────────────
/**
 * Sends a Telegram message asking the user to approve a shell command.
 */
export async function requestShellConfirmation(
    chatId: number,
    command: string,
    timeoutMs: number = 60_000,
): Promise<boolean> {
    const id = randomUUID().replace(/-/g, "").slice(0, 16);

    const keyboard = new InlineKeyboard()
        .text("✅ Approve", `${APPROVE_PREFIX}${id}`)
        .text("❌ Deny", `${DENY_PREFIX}${id}`);

    await bot.api.sendMessage(
        chatId,
        `🔒 *Shell command requested:*\n\`\`\`\n${command}\n\`\`\`\nApprove execution?`,
        { parse_mode: "Markdown", reply_markup: keyboard },
    );

    return new Promise<boolean>((resolve) => {
        const timer = setTimeout(async () => {
            if (!pending.has(id)) return;
            pending.delete(id);
            resolve(false);
            await bot.api
                .sendMessage(chatId, "⏰ Shell confirmation timed out — command denied.")
                .catch(() => undefined);
        }, timeoutMs);

        pending.set(id, { resolve, timer, type: "shell" });
    });
}

// ── Email Request ─────────────────────────────────────
/**
 * Shows an email draft preview with 'Send' and 'Cancel' buttons.
 */
export async function requestEmailConfirmation(
    chatId: number,
    to: string,
    subject: string,
    body: string,
    timeoutMs: number = 300_000, // 5 mins for email
): Promise<boolean> {
    const id = randomUUID().replace(/-/g, "").slice(0, 16);

    const keyboard = new InlineKeyboard()
        .text("📨 Send Email", `${APPROVE_PREFIX}${id}`)
        .text("❌ Cancel", `${DENY_PREFIX}${id}`);

    const preview = `📧 *Draft Email to ${to}*\n\n` +
        `*Subject:* ${subject}\n\n` +
        `${body}\n\n` +
        `_Should I send this?_`;

    await bot.api.sendMessage(chatId, preview, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
    });

    return new Promise<boolean>((resolve) => {
        const timer = setTimeout(async () => {
            if (!pending.has(id)) return;
            pending.delete(id);
            resolve(false);
            await bot.api
                .sendMessage(chatId, `⏰ Email draft for ${to} expired.`)
                .catch(() => undefined);
        }, timeoutMs);

        pending.set(id, { resolve, timer, type: "email" });
    });
}

// ── Handle callback ───────────────────────────────────
/**
 * Call from the bot's callback_query:data handler.
 * Returns true if the callback was a confirmation, false otherwise.
 */
export async function handleConfirmationCallback(ctx: Context): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (!data) return false;

    const isApprove = data.startsWith(APPROVE_PREFIX);
    const isDeny = data.startsWith(DENY_PREFIX);
    if (!isApprove && !isDeny) return false;

    const id = data.slice(3);
    const entry = pending.get(id);

    if (!entry) {
        await ctx.answerCallbackQuery({ text: "⏰ This request has already expired." });
        return true;
    }

    clearTimeout(entry.timer);
    pending.delete(id);

    const approved = isApprove;
    entry.resolve(approved);

    await ctx.answerCallbackQuery({ text: approved ? "✅ Approved" : "❌ Denied" });

    // Update the message based on type
    if (entry.type === "shell") {
        await ctx.editMessageText(
            approved
                ? "✅ *Approved* — executing command…"
                : "❌ *Denied* — command cancelled.",
            { parse_mode: "Markdown" }
        ).catch(() => undefined);
    } else {
        await ctx.editMessageText(
            approved
                ? "✅ *Sent* — Email has been queued for delivery."
                : "❌ *Cancelled* — Email draft discarded.",
            { parse_mode: "Markdown" }
        ).catch(() => undefined);
    }

    return true;
}
