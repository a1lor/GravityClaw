import { db } from "../memory/db.js";
import { existsSync } from "fs";
import path from "path";

export type CVJobType = 'alternance' | 'stage' | 'cdi' | 'general';
export type CVLanguage = 'fr' | 'en';

interface CVEntry {
    id: number;
    job_type: CVJobType;
    language: CVLanguage;
    file_path: string;
    file_name: string;
    is_default: number;
    created_at: string;
    updated_at: string;
}

// ── Prepared statements ───────────────────────────────
const stmtInsert = db.prepare(`
    INSERT OR REPLACE INTO cv_library (job_type, language, file_path, file_name, is_default)
    VALUES (?, ?, ?, ?, ?)
`);

const stmtGet = db.prepare(`
    SELECT * FROM cv_library WHERE job_type = ? AND language = ?
`);

const stmtList = db.prepare(`
    SELECT * FROM cv_library ORDER BY job_type, language
`);

const stmtDelete = db.prepare(`
    DELETE FROM cv_library WHERE id = ?
`);

const stmtSetDefault = db.prepare(`
    UPDATE cv_library SET is_default = 1 WHERE id = ?
`);

const stmtClearDefaults = db.prepare(`
    UPDATE cv_library SET is_default = 0
`);

// ── CRUD Operations ───────────────────────────────────

export function addCV(jobType: CVJobType, language: CVLanguage, filePath: string): { success: boolean; error?: string } {
    if (!existsSync(filePath)) {
        return { success: false, error: `File not found: ${filePath}` };
    }

    const fileName = path.basename(filePath);

    try {
        stmtInsert.run(jobType, language, filePath, fileName, 0);
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export function getCV(jobType: CVJobType, language: CVLanguage): CVEntry | null {
    const result = stmtGet.get(jobType, language) as CVEntry | undefined;

    if (!result) return null;

    // Validate file still exists
    if (!existsSync(result.file_path)) {
        console.warn(`⚠️ CV file missing: ${result.file_path}`);
        return null;
    }

    return result;
}

export function listCVs(): CVEntry[] {
    return stmtList.all() as CVEntry[];
}

export function deleteCV(id: number): boolean {
    const result = stmtDelete.run(id);
    return result.changes > 0;
}

export function setDefaultCV(id: number): boolean {
    const tx = db.transaction(() => {
        stmtClearDefaults.run();
        stmtSetDefault.run(id);
    });

    try {
        tx();
        return true;
    } catch {
        return false;
    }
}

export function getDefaultCV(): CVEntry | null {
    const result = db.prepare(`
        SELECT * FROM cv_library WHERE is_default = 1 LIMIT 1
    `).get() as CVEntry | undefined;

    return result ?? null;
}

// ── Smart CV Selection ────────────────────────────────

/**
 * Selects the best CV based on job type and language.
 * Falls back to general CV or default if specific match not found.
 */
export function selectCV(jobType: CVJobType, language: CVLanguage): CVEntry | null {
    // 1. Try exact match
    let cv = getCV(jobType, language);
    if (cv) return cv;

    // 2. Try same job type, other language
    const otherLang: CVLanguage = language === 'fr' ? 'en' : 'fr';
    cv = getCV(jobType, otherLang);
    if (cv) return cv;

    // 3. Try general CV in same language
    cv = getCV('general', language);
    if (cv) return cv;

    // 4. Try general CV in other language
    cv = getCV('general', otherLang);
    if (cv) return cv;

    // 5. Fall back to default
    return getDefaultCV();
}

export function formatCVList(): string {
    const cvs = listCVs();

    if (cvs.length === 0) {
        return "📂 No CVs registered. Use `/cv_add` to upload your CVs.";
    }

    return "📂 **CV Library**\n\n" + cvs.map(cv => {
        const defaultMarker = cv.is_default ? " ⭐" : "";
        const exists = existsSync(cv.file_path) ? "✅" : "❌";
        return `${exists} **${cv.job_type}** (${cv.language})${defaultMarker}\n` +
               `   File: \`${cv.file_name}\`\n` +
               `   ID: ${cv.id}`;
    }).join("\n\n");
}
