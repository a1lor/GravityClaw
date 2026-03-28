import { db } from "../memory/db.js";

// ── Cost rates per model (USD per 1M tokens) ─────────
// These are approximate OpenRouter prices.
const COST_RATES: Record<string, { input: number; output: number }> = {
    "google/gemini-2.0-flash-exp:free": { input: 0, output: 0 },
    "google/gemini-2.0-flash-001": { input: 0.10, output: 0.40 },
    "anthropic/claude-3.5-sonnet": { input: 3.00, output: 15.00 },
};

const DEFAULT_RATE = { input: 0.50, output: 1.50 }; // fallback

// ── Prepared statements ──────────────────────────────
const stmtInsert = db.prepare(`
    INSERT INTO usage_log (model, tier, prompt_tokens, completion_tokens, total_tokens, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?)
`);

const stmtTotalCost = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) as total FROM usage_log
`);

const stmtTotalTokens = db.prepare(`
    SELECT COALESCE(SUM(total_tokens), 0) as total FROM usage_log
`);

const stmtByTier = db.prepare(`
    SELECT tier,
           COUNT(*) as calls,
           SUM(total_tokens) as tokens,
           SUM(cost_usd) as cost
    FROM usage_log
    GROUP BY tier
`);

const stmtRecent = db.prepare(`
    SELECT model, tier, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at
    FROM usage_log
    ORDER BY id DESC
    LIMIT ?
`);

const stmtTodayCost = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) as total
    FROM usage_log
    WHERE date(created_at, 'localtime') = date('now', 'localtime')
`);

const stmtCallCount = db.prepare(`
    SELECT COUNT(*) as total FROM usage_log
`);

// ── Track a single LLM call ─────────────────────────
export function trackUsage(
    model: string,
    tier: string,
    promptTokens: number,
    completionTokens: number,
): void {
    const totalTokens = promptTokens + completionTokens;
    const rates = COST_RATES[model] ?? DEFAULT_RATE;
    const costUsd = (promptTokens / 1_000_000) * rates.input
        + (completionTokens / 1_000_000) * rates.output;

    stmtInsert.run(model, tier, promptTokens, completionTokens, totalTokens, costUsd);

    const symbol = tier === "free" ? "🟢" : tier === "cheap" ? "🟡" : "🔴";
    console.log(
        `${symbol} Usage: ${totalTokens} tokens ($${costUsd.toFixed(6)}) — ${model}`,
    );
}

// ── Aggregation queries ──────────────────────────────
export function getTotalCost(): number {
    return (stmtTotalCost.get() as any).total;
}

export function getTodayCost(): number {
    return (stmtTodayCost.get() as any).total;
}

export function getTotalTokens(): number {
    return (stmtTotalTokens.get() as any).total;
}

export function getTotalCalls(): number {
    return (stmtCallCount.get() as any).total;
}

export function getUsageByTier(): { tier: string; calls: number; tokens: number; cost: number }[] {
    return stmtByTier.all() as any[];
}

export function getRecentUsage(limit: number = 20) {
    return stmtRecent.all(limit);
}
