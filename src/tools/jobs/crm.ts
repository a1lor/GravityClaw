import { db } from "../../memory/db.js";
import { updatePipelineStatus, getPipelineCounts, getJobsByPipelineStatus } from "./tracker.js";

// ── Match an email sender to a job posting by company name ──
// Normalises strings by lowercasing and stripping punctuation, then checks
// if the company name from the job appears in the sender string (or vice versa).
function normaliseName(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

const stmtSearchByCompany = db.prepare<[], { id: string; company: string }>(
    "SELECT id, company FROM job_postings WHERE pipeline_status NOT IN ('rejected', 'offer') ORDER BY found_at DESC LIMIT 100",
);

export function linkEmailToJob(fromAddr: string, pipelineStatus: "applied" | "interview" | "rejected" | "offer"): string | null {
    const senderNorm = normaliseName(fromAddr);
    const jobs = stmtSearchByCompany.all() as { id: string; company: string }[];

    for (const job of jobs) {
        const companyNorm = normaliseName(job.company);
        if (companyNorm.length < 3) continue; // skip very short names
        if (senderNorm.includes(companyNorm) || companyNorm.includes(senderNorm.split(" ")[0])) {
            updatePipelineStatus(job.id, pipelineStatus);
            console.log(`🔗 CRM: linked email from "${fromAddr}" → job ${job.id} (${job.company}) → ${pipelineStatus}`);
            return job.id;
        }
    }
    return null;
}

// ── Pipeline summary as a human-readable string ────────
export function getPipelineSummaryText(): string {
    const counts = getPipelineCounts();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return "No jobs tracked yet. Tap 💼 Jobs to search.";

    const lines = [
        `💼 <b>Pipeline (${total} jobs)</b>`,
        "",
        `🆕 <b>${counts.new ?? 0}</b> new`,
        `📌 <b>${counts.saved ?? 0}</b> saved`,
        `✅ <b>${counts.applied ?? 0}</b> applied`,
        `🤝 <b>${counts.interview ?? 0}</b> interview`,
        `🎉 <b>${counts.offer ?? 0}</b> offer`,
        `❌ <b>${counts.rejected ?? 0}</b> rejected`,
    ];
    return lines.join("\n");
}

// ── Get all jobs grouped by pipeline status ────────────
export function getPipelineByStatus(): Record<string, ReturnType<typeof getJobsByPipelineStatus>> {
    return {
        new: getJobsByPipelineStatus("new"),
        saved: getJobsByPipelineStatus("saved"),
        applied: getJobsByPipelineStatus("applied"),
        interview: getJobsByPipelineStatus("interview"),
        offer: getJobsByPipelineStatus("offer"),
        rejected: getJobsByPipelineStatus("rejected"),
    };
}
