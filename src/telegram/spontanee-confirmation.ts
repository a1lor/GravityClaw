import { InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { randomUUID } from "crypto";
import { bot } from "./bot-instance.js";

// ── Types ─────────────────────────────────────────────
export type SpontaneousDecision = "approved" | "skipped" | "timeout" | "edit" | "stopped";

interface PendingSpontaneous {
    resolve: (decision: SpontaneousDecision) => void;
    timer: ReturnType<typeof setTimeout>;
}

// ── State ─────────────────────────────────────────────
const pending = new Map<string, PendingSpontaneous>();

// Callback data prefixes (kept short to stay inside Telegram's 64-byte limit)
export const SP_APPROVE_PREFIX = "sp_a:";
export const SP_EDIT_PREFIX    = "sp_e:";
export const SP_SKIP_PREFIX    = "sp_s:";
export const SP_STOP_PREFIX    = "sp_x:";

// ── Request ───────────────────────────────────────────
/**
 * Shows an email preview with 3 inline buttons: ✅ Envoyer / ✏️ Modifier / ⏭️ Passer.
 * Resolves to "approved", "skipped", or "timeout".
 */
export async function requestSpontaneousConfirmation(
    chatId: number,
    company: string,
    subject: string,
    body: string,
    timeoutMs = 120_000,
): Promise<SpontaneousDecision> {
    const id = randomUUID().replace(/-/g, "").slice(0, 16);

    const keyboard = new InlineKeyboard()
        .text("✅ Envoyer", `${SP_APPROVE_PREFIX}${id}`)
        .text("✏️ Modifier", `${SP_EDIT_PREFIX}${id}`)
        .text("⏭️ Passer", `${SP_SKIP_PREFIX}${id}`)
        .row()
        .text("🛑 Arrêter tout", `${SP_STOP_PREFIX}${id}`);

    const preview = `📨 <b>Candidature spontanée — ${company}</b>\n\n` +
        `<b>Objet:</b> ${subject}\n\n` +
        `<pre>${body.slice(0, 800)}${body.length > 800 ? "\n…(tronqué)" : ""}</pre>`;

    await bot.api.sendMessage(chatId, preview, {
        parse_mode: "HTML",
        reply_markup: keyboard,
    });

    return new Promise<SpontaneousDecision>((resolve) => {
        const timer = setTimeout(async () => {
            if (!pending.has(id)) return;
            pending.delete(id);
            resolve("timeout");
            await bot.api
                .sendMessage(chatId, `⏰ Confirmation expirée — ${company} ignorée.`)
                .catch(() => undefined);
        }, timeoutMs);

        pending.set(id, { resolve, timer });
    });
}

/**
 * Forcefully cancels all pending confirmations for a chat.
 */
export function cancelAllPendingConfirmations(): void {
    for (const [id, entry] of pending.entries()) {
        clearTimeout(entry.timer);
        entry.resolve("timeout");
        pending.delete(id);
    }
}

// ── Handle callback ───────────────────────────────────
/**
 * Call from the bot's callback_query:data handler.
 * Returns true if this was a spontaneous confirmation callback.
 */
export async function handleSpontaneousCallback(ctx: Context): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (!data) return false;

    const isApprove = data.startsWith(SP_APPROVE_PREFIX);
    const isEdit    = data.startsWith(SP_EDIT_PREFIX);
    const isSkip    = data.startsWith(SP_SKIP_PREFIX);
    const isStop    = data.startsWith(SP_STOP_PREFIX);

    if (!isApprove && !isEdit && !isSkip && !isStop) return false;

    const prefixLen = isApprove ? SP_APPROVE_PREFIX.length
        : isEdit ? SP_EDIT_PREFIX.length
            : isSkip ? SP_SKIP_PREFIX.length
                : SP_STOP_PREFIX.length;
    const id = data.slice(prefixLen);
    const entry = pending.get(id);

    if (!entry) {
        await ctx.answerCallbackQuery({ text: "⏰ Cette demande a expiré." });
        return true;
    }

    clearTimeout(entry.timer);
    pending.delete(id);

    if (isApprove) {
        entry.resolve("approved");
        await ctx.answerCallbackQuery({ text: "✅ Envoi en cours…" });
        await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    } else if (isEdit) {
        entry.resolve("edit");
        await ctx.answerCallbackQuery({ text: "✏️ Modification..." });
        await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    } else if (isStop) {
        entry.resolve("stopped");
        await ctx.answerCallbackQuery({ text: "🛑 Arrêt de la session" });
        await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
        return true; 
    } else {
        entry.resolve("skipped");
        await ctx.answerCallbackQuery({ text: "⏭️ Ignoré" });
        await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    }

    return true;
}
