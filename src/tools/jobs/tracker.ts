import { db } from "../../memory/db.js";
import { fetchAllJobs, type JobPosting } from "./fetcher.js";
import { detectJobType } from "./apply.js";

// ── Statements ────────────────────────────────────────
const stmtExists = db.prepare<[string], { id: string }>(
    "SELECT id FROM job_postings WHERE id = ?",
);
const stmtDuplicateCheck = db.prepare<[string, string], { id: string }>(
    "SELECT id FROM job_postings WHERE lower(title) = lower(?) AND lower(company) = lower(?) LIMIT 1",
);
const stmtInsert = db.prepare(
    "INSERT OR IGNORE INTO job_postings (id, source, title, company, location, url, job_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
const stmtMarkNotified = db.prepare(
    "UPDATE job_postings SET notified_at = datetime('now') WHERE id = ?",
);
const stmtMarkApplied = db.prepare(
    "UPDATE job_postings SET applied_at = datetime('now'), pipeline_status = 'applied', followup_at = datetime('now', '+7 days') WHERE id = ?",
);
const stmtUpdatePipeline = db.prepare(
    "UPDATE job_postings SET pipeline_status = ? WHERE id = ?",
);
const stmtGetByStatus = db.prepare(
    "SELECT id, source, title, company, location, url, found_at, applied_at, pipeline_status FROM job_postings WHERE pipeline_status = ? ORDER BY found_at DESC",
);
const stmtPipelineCounts = db.prepare(
    "SELECT pipeline_status, COUNT(*) as cnt FROM job_postings GROUP BY pipeline_status",
);
const stmtGetUnnotified = db.prepare(
    "SELECT id, source, title, company, location, url FROM job_postings WHERE notified_at IS NULL ORDER BY found_at DESC LIMIT 20",
);
const stmtGetUnapplied = db.prepare(
    "SELECT id, source, title, company, location, url, applied_at FROM job_postings WHERE applied_at IS NULL ORDER BY found_at DESC LIMIT 30",
);
const stmtGetById = db.prepare<[string], JobRow>(
    "SELECT id, source, title, company, location, url FROM job_postings WHERE id = ?",
);

export interface JobRow {
    id: string;
    source: string;
    title: string;
    company: string;
    location: string;
    url: string;
    applied_at?: string | null;
}

// ── CRUD ──────────────────────────────────────────────
export function saveJob(job: JobPosting): boolean {
    if (stmtExists.get(job.id)) return false; // already known (same source)
    // Cross-source duplicate: same title + company from a different source
    const dupe = stmtDuplicateCheck.get(job.title, job.company);
    if (dupe && !dupe.id.startsWith(job.source + ":")) return false;
    const jobType = detectJobType(job.title, "");
    stmtInsert.run(job.id, job.source, job.title, job.company, job.location, job.url, jobType);
    return true;
}

export function markNotified(id: string): void {
    stmtMarkNotified.run(id);
}

export function markApplied(id: string): boolean {
    const result = stmtMarkApplied.run(id);
    return result.changes > 0;
}

export function getUnnotifiedJobs(): JobRow[] {
    return stmtGetUnnotified.all() as JobRow[];
}

export function getUnappliedJobs(): JobRow[] {
    return stmtGetUnapplied.all() as JobRow[];
}

export function updatePipelineStatus(id: string, status: string): void {
    stmtUpdatePipeline.run(status, id);
}

export function getJobsByPipelineStatus(status: string): JobRow[] {
    return stmtGetByStatus.all(status) as JobRow[];
}

export function getPipelineCounts(): Record<string, number> {
    const rows = stmtPipelineCounts.all() as { pipeline_status: string; cnt: number }[];
    const counts: Record<string, number> = { new: 0, saved: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
    for (const row of rows) counts[row.pipeline_status] = row.cnt;
    return counts;
}

export function getJobById(id: string): JobRow | undefined {
    return stmtGetById.get(id);
}

import { getProfileValue } from "../../memory/profile.js";

// ── Check for new jobs ────────────────────────────────
export async function checkNewJobs(): Promise<JobRow[]> {
    const keywords = getProfileValue("occupation");
    const location = getProfileValue("location");

    if (!keywords || !location) {
        console.warn("⚠️ checkNewJobs: No occupation or location in profile.");
        return [];
    }

    const { data: fresh } = await fetchAllJobs(keywords, location);
    const newJobs: JobRow[] = [];

    for (const job of fresh) {
        if (saveJob(job)) {
            newJobs.push({ ...job });
        }
    }

    return newJobs;
}

// ── Escape HTML special chars ─────────────────────────
function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Format (Markdown — legacy) ────────────────────────
export function formatJobList(jobs: JobRow[], showApplied = false): string {
    if (jobs.length === 0) return "No job postings found.";

    return jobs
        .map((j, i) => {
            const appliedTag = showApplied && j.applied_at ? " ✅" : "";
            return (
                `${i + 1}. *${j.title}*${appliedTag} — ${j.company}\n` +
                `   📍 ${j.location} | ${j.source.toUpperCase()}\n` +
                `   🔗 ${j.url}`
            );
        })
        .join("\n\n");
}

// ── Format (HTML — preferred) ─────────────────────────
// tlDRs is optional: when provided, index must match jobs index.
export function formatJobListHTML(jobs: JobRow[], tlDRs: string[] = [], showApplied = false): string {
    if (jobs.length === 0) return "No job postings found.";

    return jobs
        .map((j, i) => {
            const appliedTag = showApplied && j.applied_at ? " ✅" : "";
            const tldr = tlDRs[i] ? `\n   💬 <i>${esc(tlDRs[i])}</i>` : "";
            return (
                `${i + 1}. <b>${esc(j.title)}</b>${appliedTag}\n` +
                `   🏢 ${esc(j.company)} · 📍 ${esc(j.location)} · <code>${j.source.toUpperCase()}</code>${tldr}`
            );
        })
        .join("\n\n");
}
