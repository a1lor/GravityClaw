import { db } from "./db.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";

// ── Types ─────────────────────────────────────────────
interface ConversationRow {
    id: number;
    dialogue_id?: number | null;
    role: string;
    content: string;
    is_summary: number;
    created_at: string;
}

// ── Prepared statements ───────────────────────────────
const stmtInsertFull = db.prepare(
    "INSERT INTO conversations (dialogue_id, role, content, tool_calls, tool_call_id) VALUES (?, ?, ?, ?, ?)",
);
const stmtInsertSummary = db.prepare(
    "INSERT INTO conversations (dialogue_id, role, content, is_summary) VALUES (?, ?, ?, 1)",
);
const stmtRecent = db.prepare(
    "SELECT * FROM conversations WHERE dialogue_id IS ? ORDER BY id DESC LIMIT ?",
);
const stmtAll = db.prepare(
    "SELECT * FROM conversations WHERE dialogue_id IS ? ORDER BY id ASC",
);
const stmtCount = db.prepare(
    "SELECT COUNT(*) as count FROM conversations WHERE dialogue_id IS ?",
);
const stmtClear = db.prepare("DELETE FROM conversations");

// ── Write ─────────────────────────────────────────────
// Returns the SQLite row ID — used as the Pinecone vector key.
export function saveMessage(
    role: "user" | "assistant" | "tool",
    content: string | null,
    tool_calls?: string,
    tool_call_id?: string,
    dialogueId: number | null = null,
): number {
    const result = stmtInsertFull.run(dialogueId, role, content, tool_calls ?? null, tool_call_id ?? null);
    return result.lastInsertRowid as number;
}

// ── Read ──────────────────────────────────────────────
export function getRecentHistory(limit: number = 20, dialogueId: number | null = null): ChatCompletionMessageParam[] {
    const rows = stmtRecent.all(dialogueId, limit) as any[];

    // DB returns newest-first; reverse to get chronological order for the LLM
    return rows
        .reverse()
        .map((row) => {
            const msg: any = {
                role: row.role as any,
                content: row.content,
            };
            if (row.tool_calls) {
                msg.tool_calls = JSON.parse(row.tool_calls);
            }
            if (row.tool_call_id) {
                msg.tool_call_id = row.tool_call_id;
            }
            return msg as ChatCompletionMessageParam;
        });
}

export function getFullHistory(dialogueId: number | null = null): ConversationRow[] {
    return stmtAll.all(dialogueId) as ConversationRow[];
}

export function getConversationCount(dialogueId: number | null = null): number {
    const row = stmtCount.get(dialogueId) as { count: number };
    return row.count;
}

// ── Compact ───────────────────────────────────────────
// Wipes the conversation history and replaces it with a single summary message.
export function replaceWithSummary(summary: string): void {
    stmtClear.run();
    stmtInsertSummary.run(null, "assistant", `[Conversation summary]\n${summary}`);
}

export function clearHistory(): void {
    stmtClear.run();
}
