import { db } from "../../memory/db.js";

// ── Application logic — Consolidated into job_postings ─────
// This file is now a thin wrapper for compatibility with older modules.

export interface Application {
    id: string;
    company: string;
    position: string;
    status: string;
    outcome: string;
    last_update: string;
}

const stmtUpsert = db.prepare(`
    INSERT INTO job_postings (id, company, title, pipeline_status, outcome, source, url)
    VALUES (?, ?, ?, ?, ?, 'manual', '')
    ON CONFLICT(id) DO UPDATE SET
        pipeline_status = excluded.pipeline_status,
        outcome = excluded.outcome,
        found_at = datetime('now')
`);

const stmtList = db.prepare("SELECT id, company, title as position, pipeline_status as status, outcome, found_at as last_update FROM job_postings ORDER BY found_at DESC");

export function updateApplicationStatus(
    company: string,
    position: string,
    status: string,
    outcome: string = ""
): void {
    const id = `manual:${company.toLowerCase().replace(/\s+/g, "-")}:${position.toLowerCase().replace(/\s+/g, "-")}`;
    stmtUpsert.run(id, company, position, status, outcome);
}

export function listApplications(): Application[] {
    return stmtList.all() as Application[];
}
