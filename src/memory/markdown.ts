import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from "fs";
import path from "path";

// ── Notes directory ───────────────────────────────────
const NOTES_DIR = path.join(process.cwd(), "data", "notes");

// ── Helpers ───────────────────────────────────────────
// Sanitise note names so they're safe filenames.
function toSlug(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 64);
}

function notePath(name: string): string {
    return path.join(NOTES_DIR, `${toSlug(name)}.md`);
}

// ── CRUD ──────────────────────────────────────────────
export function createNote(name: string, content: string): string {
    const slug = toSlug(name);
    writeFileSync(notePath(name), content, "utf-8");
    return slug;
}

export function readNote(name: string): string | null {
    const filePath = notePath(name);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
}

export function updateNote(name: string, content: string): boolean {
    const filePath = notePath(name);
    if (!existsSync(filePath)) return false;
    writeFileSync(filePath, content, "utf-8");
    return true;
}

export function appendToNote(name: string, text: string): string {
    const filePath = notePath(name);
    const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
    const updated = existing ? `${existing.trimEnd()}\n\n${text}` : text;
    writeFileSync(filePath, updated, "utf-8");
    return toSlug(name);
}

export function listNotes(): string[] {
    return readdirSync(NOTES_DIR)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.slice(0, -3)); // strip .md
}

export function deleteNote(name: string): boolean {
    const filePath = notePath(name);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    return true;
}

// ── Search ────────────────────────────────────────────
export interface NoteMatch {
    name: string;
    excerpt: string;
}

export function searchNotes(query: string): NoteMatch[] {
    const lower = query.toLowerCase();
    const results: NoteMatch[] = [];

    for (const name of listNotes()) {
        const content = readNote(name);
        if (!content) continue;

        if (content.toLowerCase().includes(lower)) {
            const matchLine =
                content
                    .split("\n")
                    .find((l) => l.toLowerCase().includes(lower))
                    ?.trim() ?? "";
            results.push({ name, excerpt: matchLine });
        }
    }

    return results;
}
