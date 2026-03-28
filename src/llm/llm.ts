import OpenAI from "openai";
import { config } from "../config.js";
import { trackUsage, getTodayCost } from "../usage/tracker.js";
import fs from "fs";
import path from "path";
import type {
    ChatCompletionMessageParam,
    ChatCompletionTool,
    ChatCompletionMessage,
} from "openai/resources/chat/completions.js";

// ── OpenRouter client (OpenAI-compatible) ────────────
const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: config.openrouterApiKey,
    timeout: 60_000,
    defaultHeaders: {
        "HTTP-Referer": "https://gravityclaw.local",
        "X-Title": "Gravity Claw",
    },
});

// ── Model tiers (cheapest first) ─────────────────────
// The bot picks the lightest model that can handle the task.
// Free models for simple chat, paid only when real brainpower is needed.

const MODEL_FREE = "google/gemini-2.0-flash-001";     // Fast, free-tier Gemini Flash
const MODEL_CHEAP = "meta-llama/llama-3.1-8b-instruct";     // Stable fallback for tool refinement
const MODEL_SMART = "anthropic/claude-3.7-sonnet";          // High intelligence
export const MODEL_BEST = "anthropic/claude-3.7-sonnet";    // Best overall quality

type ModelTier = "free" | "cheap" | "smart";

/**
 * Pick the right model based on conversation complexity.
 * - Simple greetings / short messages → free
 * - Tool calls, medium tasks → cheap
 * - Explicitly complex or multi-step reasoning → smart
 */
function selectModel(
    messages: ChatCompletionMessageParam[],
    hasTools: boolean,
    iteration: number,
): { model: string; tier: ModelTier } {
    // Get the latest user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    const userText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";
    const wordCount = userText.split(/\s+/).length;

    // Iteration > 3 means the bot is struggling with a multi-step task — escalate to smart model
    if (iteration > 3) {
        return { model: MODEL_SMART, tier: "smart" };
    }

    // Keywords that signal complex reasoning or creative generation
    const complexPatterns = /\b(analyze|explain in detail|compare|debug|refactor|architecture|strategy|plan|write code|implement|review|brainstorm|ideate|creative|options|propose)\b/i;
    if (complexPatterns.test(userText)) {
        return { model: MODEL_CHEAP, tier: "cheap" };
    }

    // Frequent tool use or long context → cheap model (better tool reliability)
    if (hasTools && (wordCount > 40 || iteration > 1)) {
        return { model: MODEL_CHEAP, tier: "cheap" };
    }

    // Default: free model handles most conversations just fine
    return { model: MODEL_FREE, tier: "free" };
}

export function getSystemPrompt(memoryContext: string = ""): string {
    const now = new Date().toLocaleString("en-US", {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dateStyle: "full",
        timeStyle: "short",
    });

    let soulText = "";
    try {
        const soulPath = path.join(process.cwd(), "data", "soul.md");
        if (fs.existsSync(soulPath)) {
            soulText = fs.readFileSync(soulPath, "utf-8");
            soulText = `\n\n--- CORE DIRECTIVES (soul.md) ---\n${soulText}\n---------------------------------\n`;
        }
    } catch {
        // Silently ignore if soul.md doesn't exist yet
    }

    return `Gravity Claw — AI agent. Server Time: ${now}. Remember that server time may differ from the user's timezone.
- Tool-first: For ANY action request (jobs, news, email, dashboard, memory, weather, time, morning briefing) call the appropriate tool immediately. Never describe what you would do — do it.
- Tool output: When a tool returns formatted output (bulleted lists, structured text), return it VERBATIM. Do NOT rephrase, summarize, or add prose around it. Use \\n for newlines; NEVER use <br> tags.
- Code formatting: When sharing code, commands, or technical snippets, wrap them in triple backticks with language identifier (e.g., \`\`\`python, \`\`\`bash, \`\`\`json) for easy copying. Use single backticks for inline code. For file paths, commands, and variable names, use <code>syntax</code> for easy copying.
- Tone: Direct, mirrored. No filler.
- Objective: Solve the underlying problem. Flag gaps/risks proactively.
- Emailing: For professional emails, use the 'compose_email' tool. If the user's intent is vague (e.g., "Send an email to John"), ALWAYS ask for the core message or context before drafting.
- Constraint: Minimal tokens. Never expose internal keys or file paths.
- Language: English by default. Answer in Russian ONLY if the user speaks to you in Russian. Transliterate or translate underlying tool payloads seamlessly if needed.
- Memory: Use context below for personalized advice.${soulText}${memoryContext}`;
}

// ── Types ────────────────────────────────────────────
export type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionMessage };

export interface ChatResponse {
    message: ChatCompletionMessage;
    finishReason: string | null;
    model: string;
    reasoning?: string;
}

// ── Retry helper ─────────────────────────────────────
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Cost alert (once per day) ─────────────────────────
let costAlertSentDate = "";

async function maybeSendCostAlert(): Promise<void> {
    const threshold = config.costAlertThreshold;
    if (threshold <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    if (costAlertSentDate === today) return;
    const todayCost = getTodayCost();
    if (todayCost < threshold) return;
    costAlertSentDate = today;
    try {
        const { bot } = await import("../telegram/bot-instance.js");
        const chatId = config.allowedUserIds[0];
        await bot.api.sendMessage(
            chatId,
            `⚠️ <b>Cost alert</b>\n\nYou've spent <b>$${todayCost.toFixed(4)}</b> today (threshold: $${threshold.toFixed(2)}). Gravity Claw will keep running but consider lighter usage.`,
            { parse_mode: "HTML" },
        );
    } catch (err) {
        console.warn("⚠️ Cost alert: failed to send Telegram message:", err);
    }
}

// ── Main chat function ───────────────────────────────
export async function chat(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    memoryContext: string = "",
    iteration: number = 1,
    forceModel?: string,
    disableTools: boolean = false,
    maxTokens: number = 2048,
): Promise<ChatResponse> {
    let lastError: unknown;
    const hasTools = !!(tools && tools.length > 0) && !disableTools;
    const { model: autoModel, tier } = selectModel(messages, hasTools, iteration);
    const model = forceModel ?? autoModel;

    const cleanMessages = messages.map((m: any) => {
        const isEmpty = m.content == null || String(m.content).trim() === "";
        if (isEmpty && m.tool_calls) {
            return { ...m, content: " " }; // Provide a dummy space to satisfy API requirements
        }
        return m;
    });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const payload = {
                model,
                max_tokens: maxTokens,
                messages: [
                    { role: "system" as const, content: getSystemPrompt(memoryContext) },
                    ...cleanMessages,
                ],
                ...(hasTools ? { tools } : { tool_choice: "none" }), // Explicitly disable if told to
            };

            console.log(`🧠 [${tier}] ${model} — iteration ${iteration}`);

            const response = await client.chat.completions.create(payload as any);

            // Track usage
            const usage = response.usage;
            if (usage) {
                trackUsage(model, tier, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0);
                maybeSendCostAlert().catch(() => { });
            }

            const choice = response.choices[0];
            const reasoning = (choice.message as any).reasoning_content || (choice.message as any).reasoning || "";
            return {
                message: choice.message,
                finishReason: choice.finish_reason,
                model,
                ...(reasoning ? { reasoning: String(reasoning) } : {}),
            };
        } catch (error: unknown) {
            lastError = error;
            const status = (error as { status?: number }).status;

            // If the free model fails, fall back to cheap
            if (tier === "free" && attempt === 0) {
                console.log(`⚡ Free model failed (${status}), falling back to cheap model…`);
                const fallbackPayload = {
                    model: MODEL_CHEAP,
                    max_tokens: maxTokens,
                    messages: [
                        { role: "system" as const, content: getSystemPrompt(memoryContext) },
                        ...cleanMessages,
                    ],
                    ...(hasTools ? { tools } : {}),
                };
                try {
                    const response = await client.chat.completions.create(fallbackPayload as any);
                    const usage = response.usage;
                    if (usage) {
                        trackUsage(MODEL_CHEAP, "cheap", usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0);
                        maybeSendCostAlert().catch(() => { });
                    }
                    const choice = response.choices[0];
                    const reasoning = (choice.message as any).reasoning_content || (choice.message as any).reasoning || "";
                    console.log(`✅ Fallback to ${MODEL_CHEAP} succeeded`);
                    return {
                        message: choice.message,
                        finishReason: choice.finish_reason,
                        model: MODEL_CHEAP,
                        ...(reasoning ? { reasoning: String(reasoning) } : {}),
                    };
                } catch {
                    // Continue to normal retry
                }
            }

            if (status === 429 && attempt < MAX_RETRIES - 1) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                console.log(`⏳ Rate limited — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})…`);
                await sleep(delay);
                continue;
            }

            throw error;
        }
    }

    throw lastError;
}
