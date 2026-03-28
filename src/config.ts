import "dotenv/config";

// ── Required env vars ────────────────────────────────
function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        console.error(`❌ Missing required env var: ${key}`);
        console.error(`   Copy .env.example → .env and fill in your values.`);
        process.exit(1);
    }
    return value;
}

function envFlag(key: string): boolean {
    const raw = (process.env[key] ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

// ── Exported config (validated at import time) ───────
const disableTelegram = envFlag("DISABLE_TELEGRAM");
const disableHeartbeat = envFlag("DISABLE_HEARTBEAT");
const isRailwayRuntime = Boolean(
    process.env.RAILWAY_PUBLIC_DOMAIN &&
    (process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PROJECT_ID ||
        process.env.RAILWAY_SERVICE_ID ||
        process.env.RAILWAY_STATIC_URL),
);

export const config = {
    /** Feature flags (useful for local development) */
    disableTelegram,
    disableHeartbeat,

    /** Telegram bot token from @BotFather */
    telegramBotToken: disableTelegram ? "" : requireEnv("TELEGRAM_BOT_TOKEN"),

    /** OpenRouter API key */
    openrouterApiKey: requireEnv("OPENROUTER_API_KEY"),

    /** Whitelisted Telegram user IDs — only these users can interact */
    allowedUserIds: disableTelegram
        ? []
        : requireEnv("ALLOWED_USER_IDS")
            .split(",")
            .map((id) => Number(id.trim()))
            .filter((id) => !Number.isNaN(id) && id > 0),

    /** Groq API Key (for fast, free Whisper STT) */
    groqApiKey: process.env.GROQ_API_KEY ?? "",

    /** ElevenLabs API Key (for ultra-realistic TTS) */
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "",

    /** Max agentic loop iterations before forced stop */
    maxAgentIterations: (() => {
        const raw = process.env.MAX_AGENT_ITERATIONS;
        const parsed = Number(raw);
        if (raw !== undefined && isNaN(parsed)) {
            console.warn("⚠️ Config: MAX_AGENT_ITERATIONS is not a valid number, using default: 10");
        }
        return parsed || 10;
    })(),

    /** How many past conversation turns to load into each agent call */
    maxHistoryTurns: (() => {
        const raw = process.env.MAX_HISTORY_TURNS;
        const parsed = Number(raw);
        if (raw !== undefined && isNaN(parsed)) {
            console.warn("⚠️ Config: MAX_HISTORY_TURNS is not a valid number, using default: 20");
        }
        return parsed || 20;
    })(),

    /** Shell command execution timeout in milliseconds */
    shellTimeoutMs: (() => {
        const raw = process.env.SHELL_TIMEOUT_MS;
        const parsed = Number(raw);
        if (raw !== undefined && isNaN(parsed)) {
            console.warn("⚠️ Config: SHELL_TIMEOUT_MS is not a valid number, using default: 30000");
        }
        return parsed || 30_000;
    })(),

    /** Pinecone API key — optional, enables semantic vector memory */
    pineconeApiKey: process.env.PINECONE_API_KEY ?? "",

    /** Pinecone index name */
    pineconeIndex: process.env.PINECONE_INDEX ?? "gravity-claw",

    /** Google OAuth2 credentials — optional, enables Gmail integration */
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",

    /** Daily LLM cost alert threshold in USD (default $0.50, 0 = disabled) */
    costAlertThreshold: (() => {
        const raw = process.env.COST_ALERT_THRESHOLD;
        const parsed = Number(raw);
        return (raw !== undefined && !isNaN(parsed)) ? parsed : 0.50;
    })(),

    /**
     * Optional HTTPS URL for the Telegram Web App (Mini App) dashboard.
     * When set, the Dashboard button opens the URL inside Telegram instead
     * of sending a plain localhost link.
     *
     * Auto-detected on Railway via RAILWAY_PUBLIC_DOMAIN.
     * For local dev: npx cloudflare tunnel --url http://localhost:3200
     * Then set WEBAPP_URL=https://<your-tunnel>.trycloudflare.com in .env
     */
    webappUrl: process.env.WEBAPP_URL
        ?? (isRailwayRuntime && process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : ""),

    /** Token appended to dashboard deep-links for auto-login (matches DASHBOARD_TOKEN) */
    dashboardToken: process.env.DASHBOARD_TOKEN ?? "",

    /** Master AES-256 encryption key for secure secrets */
    masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY ?? "",

    /** WTTJ Algolia API credentials (public read-only keys) */
    wttjAlgoliaAppId: process.env.WTTJ_ALGOLIA_APP_ID ?? "",
    wttjAlgoliaApiKey: process.env.WTTJ_ALGOLIA_API_KEY ?? "",

    /** Base folder for job application files */
    applicationBaseFolder: process.env.APPLICATION_BASE_FOLDER ?? "",
} as const;

// Sanity check: at least one user ID when Telegram is enabled
if (!config.disableTelegram && config.allowedUserIds.length === 0) {
    console.error("❌ ALLOWED_USER_IDS must contain at least one valid Telegram user ID.");
    process.exit(1);
}

console.log(`✅ Config loaded — provider: OpenRouter, allowed users: [${config.allowedUserIds.join(", ")}]`);
console.log(`🌐 Dashboard URL: ${config.webappUrl || "not set (local fallback)"}`);
