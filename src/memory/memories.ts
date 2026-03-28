import { db } from "./db.js";

// ── Types ─────────────────────────────────────────────
export interface Memory {
    id: number;
    content: string;
    category: string;
    tags: string;
    is_archived: number;
    created_at: string;
    accessed_at: string;
    access_count: number;
}

// ── Prepared statements ───────────────────────────────
const stmtInsert = db.prepare(
    "INSERT INTO memories (content, category, tags) VALUES (?, ?, ?)",
);
const stmtUpdate = db.prepare(
    "UPDATE memories SET content = ?, category = ?, tags = ?, accessed_at = datetime('now'), is_archived = 0 WHERE id = ?",
);
const stmtSearch = db.prepare(`
    SELECT * FROM memories
    WHERE (content LIKE ? OR tags LIKE ?)
    ORDER BY accessed_at DESC
    LIMIT ?
`);
const stmtList = db.prepare(
    "SELECT * FROM memories ORDER BY accessed_at DESC LIMIT ?",
);
const stmtDelete = db.prepare("DELETE FROM memories WHERE id = ?");
const stmtArchive = db.prepare("UPDATE memories SET is_archived = 1 WHERE id = ?");

const stmtTouch = db.prepare(`
    UPDATE memories
    SET accessed_at = datetime('now'), access_count = access_count + 1
    WHERE id = ?
`);

// ── CRUD ──────────────────────────────────────────────

export function saveMemory(content: string, category: string = "general", tags: string = ""): number {
    const result = stmtInsert.run(content, category, tags);
    return result.lastInsertRowid as number;
}

export function updateMemory(id: number, content: string, category: string, tags: string): void {
    stmtUpdate.run(content, category, tags, id);
}

export function archiveMemory(id: number): void {
    stmtArchive.run(id);
}

export function searchMemories(query: string, limit: number = 10): Memory[] {
    const pattern = `%${query}%`;
    const rows = stmtSearch.all(pattern, pattern, limit) as Memory[];
    for (const row of rows) stmtTouch.run(row.id);
    return rows;
}

export function listMemories(limit: number = 20): Memory[] {
    return stmtList.all(limit) as Memory[];
}

export function listByCategories(categories: string[], limit: number = 20): Memory[] {
    const placeholders = categories.map(() => "?").join(",");
    const stmt = db.prepare(`
        SELECT * FROM memories 
        WHERE category IN (${placeholders}) AND is_archived = 0 
        ORDER BY accessed_at DESC 
        LIMIT ?
    `);
    return stmt.all(...categories, limit) as Memory[];
}

export function deleteMemory(id: number): boolean {
    return stmtDelete.run(id).changes > 0;
}

// ── Context injection for LLM ─────────────────────────
export function buildMemoryContext(memories: Memory[]): string {
    if (memories.length === 0) return "";

    const lines = memories.map((m) => {
        const tags = m.tags ? ` [${m.tags}]` : "";
        const cat = m.category !== "general" ? ` (${m.category})` : "";
        return `  #${m.id}${cat}${tags}: ${m.content}`;
    });
    return `\n\n## Stored Memories\n${lines.join("\n")}`;
}
