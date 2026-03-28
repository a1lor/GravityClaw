import { db } from "./db.js";

export function getCache(category: string): any | null {
    const row = db.prepare("SELECT content FROM daily_cache WHERE category = ? AND updated_at = date('now')")
        .get(category) as { content: string } | undefined;

    if (!row) return null;
    try {
        return JSON.parse(row.content);
    } catch {
        return null;
    }
}

export function setCache(category: string, content: any): void {
    db.prepare("INSERT OR REPLACE INTO daily_cache (category, content, updated_at) VALUES (?, ?, date('now'))")
        .run(category, JSON.stringify(content));
}

export function deleteCache(category: string): void {
    db.prepare("DELETE FROM daily_cache WHERE category = ?").run(category);
}
