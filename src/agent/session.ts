// ── Active session state ──────────────────────────────
// Stores the current Telegram chat ID so tools can send messages
// (e.g. shell confirmation prompts) without threading ctx everywhere.
// Safe for a single-user personal bot.

let activeChatId: number | null = null;
let forcedModel: string | null = null;

export const session = {
    getChatId(): number | null {
        return activeChatId;
    },
    setChatId(id: number): void {
        activeChatId = id;
    },
    getForcedModel(): string | null {
        return forcedModel;
    },
    setForcedModel(modelOrTier: string | null): void {
        forcedModel = modelOrTier;
    },
    clear(): void {
        activeChatId = null;
        forcedModel = null;
    },
};
