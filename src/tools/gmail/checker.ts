import { google } from "googleapis";
import { getAuthenticatedClient, isGmailReady } from "./auth.js";
import { db } from "../../memory/db.js";
import { chat } from "../../llm/llm.js";
import { trackUsage } from "../../usage/tracker.js";
import { emitEvent } from "../../events/emitter.js";

export interface EmailSummary {
    from: string;
    subject: string;
    date: string;
    snippet: string;
    status: "positive" | "negative" | "neutral";
    gmailMessageId?: string;
    gmailThreadId?: string;
    action?: string;
    stage?: string;
}

// ── Automated sender exclusion ────────────────────────
const EXCLUDED_DOMAINS = [
    // Dev platforms — never job-related
    "github.com", "gitlab.com",
    // Social / media
    "twitter.com", "facebook.com", "instagram.com",
    // Infra / dev tools
    "railway.app", "vercel.com", "netlify.com", "heroku.com",
    "discord.com", "slack.com", "notion.so", "figma.com",
    // Payments / consumer
    "stripe.com", "paypal.com", "uber.com", "deliveroo",
    "spotify.com", "apple.com", "amazon.com",
    // AI providers (own emails, not recruitment)
    "openai.com", "anthropic.com",
    // Hard bounces
    "mailer-daemon",
    // Bulk newsletter senders that are never recruiters
    "newsletter", "digest@", "updates@",
    // NOTE: "noreply", "no-reply", "donotreply" intentionally REMOVED —
    // many legitimate ATS systems (Workday, Greenhouse, Lacoste, etc.)
    // send application confirmations from no-reply addresses.
    // The LLM classifier handles the actual filtering.
    // google.com also removed — Google Forms/Meet invites can be job-related.
];

function isExcludedSender(from: string): boolean {
    const lower = from.toLowerCase();
    const matched = EXCLUDED_DOMAINS.find((d) => lower.includes(d));
    if (matched) console.log(`🚫 Filtered sender: ${from} (matched: ${matched})`);
    return !!matched;
}

// ── AI-powered batch classifier ───────────────────────
// Sends all fetched email subjects + snippets to the LLM in one call.
// Returns only emails that are direct responses to job applications,
// with company name and position extracted for pipeline linking.

interface RawEmail {
    from: string;
    subject: string;
    snippet: string;
    date: string;
    gmailMessageId?: string;
    gmailThreadId?: string;
}

interface ClassifiedEmail extends RawEmail {
    status: EmailSummary["status"];
    stage: string;
    company: string;
    position: string;
    action: string;
}

async function classifyEmailsWithAI(emails: RawEmail[]): Promise<ClassifiedEmail[]> {
    if (emails.length === 0) return [];

    const emailList = emails
        .map((e, i) => `${i}. From: ${e.from}\n   Subject: ${e.subject}\n   Preview: ${e.snippet.slice(0, 200)}`)
        .join("\n\n");

    const prompt = `You are reviewing emails for David Litvak, a student searching for an ALTERNANCE (apprenticeship contract) or STAGE (internship) in Data Science / AI in France.

Emails may be written in French or English — apply the same rules to both languages equally.

Your job: identify emails that are responses to ANY type of application he submitted — alternance, stage, job, or candidature spontanée (spontaneous/unsolicited application). Also include direct contact from someone at a company regarding his CV or candidature. This includes responses from HR departments, recruiters, hiring managers, founders, associates, managers, or anyone at a company referencing his CV, candidature, or application.

INCLUDE:
- Any message referencing his CV or candidature: "votre candidature", "votre CV", "your application", "your resume", "mon associé m'a transmis votre candidature", "candidature spontanée", "RE: Candidature Spontanée"
- Responses to spontaneous applications (candidatures spontanées) — these count even if no specific job was posted
- Confirmations that an application was received: "Nous avons bien reçu votre candidature" / "We received your application"
- Interview invitations (entretien, assessment, test technique, interview, call)
- Requests to complete a quiz, test, coding challenge, personality assessment, or evaluation
- Recruiters or hiring managers asking to schedule a call or continue the conversation
- Rejections: "votre candidature n'a pas été retenue", "nous ne donnons pas suite", "unfortunately we won't be moving forward", "we regret to inform"
- Offers for alternance/stage/job positions
- Responses that express interest but are not ready yet: "nous garderons votre CV", "nous vous recontacterons", "pas encore prêts", "we'll keep your profile on file", "we'll reach out when ready", "votre profil nous intéresse mais…"
- Automated acknowledgments from ATS/HR platforms (Workday, SmartRecruiters, Greenhouse, Lever, Taleo, iCIMS, BambooHR, Welcome to the Jungle) about HIS specific application

EXCLUDE — mark as "NO":
- Job alerts, job recommendations, "new jobs for you", "offres qui pourraient vous intéresser"
- LinkedIn notifications, Glassdoor, Indeed, WTTJ digest/promo emails
- Newsletters, marketing, promotional emails
- Cold recruiter outreach (someone contacting him first with no reference to a prior application)
- Transactional emails (orders, shipping, subscriptions, billing, password resets)
- Social media notifications
- Emails from friends, family, professors, classmates
- School/university administrative emails
- SaaS product updates, developer tool notifications
- Any email with no reference to a CV, candidature, or application he submitted

Be STRICT on the EXCLUDE list. When in doubt whether an email is a real response to an application he submitted, mark as "NO".

For each email, respond with its index and:
- stage: "acknowledgment", "pending", "interview", "test", "rejection", "offer", "follow-up", or "NO"
  - acknowledgment: application received and being reviewed
  - pending: company is interested but not ready to proceed yet — keeping CV on file, will reach out later
  - interview: invitation to interview or schedule a call
  - test: assessment, coding challenge, or evaluation requested
  - rejection: explicitly not moving forward
  - offer: job/alternance/stage offer made
  - follow-up: recruiter or company checking in with a question
- company: company name (empty string if NO)
- position: position title if known (empty string if unknown or NO)
- action: what David needs to do — one of:
  - "reply" — a response is expected (schedule interview, answer questions, confirm availability)
  - "test" — needs to complete an assessment or challenge
  - "none" — no action needed (acknowledgment, pending, rejection, or informational)

Respond with ONLY a JSON array, no explanation. Example:
[{"index":0,"stage":"acknowledgment","company":"BPCE","position":"Data Scientist alternance","action":"none"},{"index":1,"stage":"pending","company":"Startup IA","position":"Alternance Data","action":"none"},{"index":2,"stage":"test","company":"Thales","position":"ML Engineer stage","action":"test"},{"index":3,"stage":"NO","company":"","position":"","action":"none"}]

Emails:
${emailList}`;

    try {
        const { message } = await chat(
            [{ role: "user", content: prompt }],
            undefined,
            "",
            1,
        );

        // Track usage for this AI call
        const model = "google/gemini-2.0-flash-001";
        const estimatedPromptTokens = Math.ceil(prompt.length / 4);
        const estimatedCompletionTokens = Math.ceil((message.content?.length ?? 50) / 4);
        trackUsage(model, "gmail-classifier", estimatedPromptTokens, estimatedCompletionTokens);

        const raw = message.content ?? "[]";
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const results: { index: number; stage: string; company: string; position: string; action?: string }[] = JSON.parse(jsonMatch[0]);

        const stageToStatus = (stage: string): EmailSummary["status"] => {
            if (stage === "interview" || stage === "offer" || stage === "test") return "positive";
            if (stage === "rejection") return "negative";
            return "neutral"; // acknowledgment, follow-up
        };

        // Debug: log each classification result
        for (const r of results) {
            const e = emails[r.index];
            console.log(`📊 [${r.stage}] ${e?.from?.slice(0, 60)} | ${e?.subject?.slice(0, 60)}`);
        }

        return results
            .filter((r) => r.stage !== "NO")
            .map((r) => ({
                ...emails[r.index],
                status: stageToStatus(r.stage),
                stage: r.stage,
                company: r.company ?? "",
                position: r.position ?? "",
                action: r.action ?? "none",
            }))
            .filter(Boolean);

    } catch (err) {
        console.error("❌ Gmail AI classifier failed:", err);
        return [];
    }
}

// ── Persistence ──────────────────────────────────────
const stmtInsert = db.prepare(`
    INSERT OR IGNORE INTO job_emails (from_addr, subject, snippet, status, email_date, gmail_message_id, gmail_thread_id, action_needed, stage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtExists = db.prepare(`
    SELECT id FROM job_emails WHERE gmail_message_id = ?
`);
const stmtGetAll = db.prepare(`
    SELECT * FROM job_emails ORDER BY created_at DESC LIMIT 100
`);

// Auto-create a job_postings entry from an email when no match is found
const stmtInsertJobFromEmail = db.prepare(`
    INSERT OR IGNORE INTO job_postings (id, source, title, company, location, url, pipeline_status)
    VALUES (?, 'email', ?, ?, '', '', ?)
`);
const stmtFindJobByCompany = db.prepare<[string], { id: string }>(
    `SELECT id FROM job_postings WHERE lower(company) = lower(?) LIMIT 1`,
);

export function saveJobEmail(email: EmailSummary): boolean {
    if (email.gmailMessageId && stmtExists.get(email.gmailMessageId)) return false; 
    // Normalize email_date to ISO format for consistent SQLite sorting
    const isoDate = email.date ? (() => { try { return new Date(email.date).toISOString(); } catch { return email.date; } })() : null;
    stmtInsert.run(
        email.from,
        email.subject,
        email.snippet,
        email.status,
        isoDate,
        email.gmailMessageId ?? "",
        email.gmailThreadId ?? "",
        email.action ?? "", 
        email.stage ?? ""
    );

    // Check if this is a reply to a spontaneous outreach
    const fromEmail = email.from.match(/<(.+)>|(\S+@\S+\.\S+)/);
    const cleanFrom = fromEmail ? (fromEmail[1] || fromEmail[2]) : email.from;
    
    const stmtCheckSpon = db.prepare(`SELECT id FROM spontaneous_targets WHERE hr_email = ? AND status = 'sent'`);
    const sponTarget = stmtCheckSpon.get(cleanFrom) as { id: number } | undefined;
    
    if (sponTarget) {
        import("../jobs/spontanee.js").then(({ markTargetReplied }) => {
            markTargetReplied(sponTarget.id);
            console.log(`💬 Outreach: marked target ${sponTarget.id} (${cleanFrom}) as replied!`);
        });
    }

    return true;
}

export function getAllJobEmails() {
    return stmtGetAll.all() as any[];
}

function parseDbDateTime(value: string | null | undefined): number | null {
    const raw = value ? String(value).trim() : "";
    if (!raw) return null;
    // SQLite datetime('now') yields: "YYYY-MM-DD HH:MM:SS"
    const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : null;
}

function extractEmailFromHeader(fromHeader: string): string {
    // Similar extraction as elsewhere in this codebase.
    const m = fromHeader.match(/<(.+)>|(\S+@\S+\.\S+)/);
    return String(m ? (m[1] || m[2]) : fromHeader).trim();
}

export async function checkOutreachReplies(): Promise<void> {
    if (!isGmailReady()) return;

    const auth = getAuthenticatedClient();
    if (!auth) return;

    const gmail = google.gmail({ version: "v1", auth });

    // Used to exclude self-sent messages from reply matching.
    let myEmail = "";
    try {
        const profile = await gmail.users.getProfile({ userId: "me" });
        myEmail = String(profile.data.emailAddress ?? "").trim().toLowerCase();
    } catch {
        // Ignore; we still do in-code filtering when possible.
    }

    const rawTargets = db
        .prepare(
            `SELECT id, company, hr_email, sent_at
             FROM spontaneous_targets
             WHERE status = 'sent' AND sent_at IS NOT NULL`,
        )
        .all() as { id: number; company: string; hr_email: string; sent_at: string }[];

    if (rawTargets.length === 0) return;

    const BATCH_SIZE = 10;

    for (let i = 0; i < rawTargets.length; i += BATCH_SIZE) {
        const batch = rawTargets.slice(i, i + BATCH_SIZE);

        const emails = batch
            .map((t) => String(t.hr_email ?? "").trim().toLowerCase())
            .filter(Boolean);

        if (emails.length === 0) continue;

        // After = earliest sent_at in this batch.
        const earliestMs = Math.min(
            ...batch
                .map((t) => parseDbDateTime(t.sent_at))
                .filter((x): x is number => x !== null),
        );
        if (!Number.isFinite(earliestMs)) continue;

        const earliestUnix = Math.floor(earliestMs / 1000);

        const fromPart = `from:(${emails.join(" OR ")})`;
        const query = myEmail ? `${fromPart} after:${earliestUnix} -from:${myEmail}` : `${fromPart} after:${earliestUnix}`;

        const listRes = await gmail.users.messages.list({
            userId: "me",
            q: query,
            maxResults: 100,
        });
        const messageIds = listRes.data.messages ?? [];
        if (messageIds.length === 0) continue;

        const targetsByEmail = new Map<string, { id: number; company: string; sentAtMs: number }[]>();
        for (const t of batch) {
            const cleanHr = String(t.hr_email ?? "").trim().toLowerCase();
            const sentAtMs = parseDbDateTime(t.sent_at);
            if (!cleanHr || sentAtMs === null) continue;

            const arr = targetsByEmail.get(cleanHr) ?? [];
            arr.push({ id: t.id, company: t.company, sentAtMs });
            targetsByEmail.set(cleanHr, arr);
        }

        const stmtMarkReplied = db.prepare(`
          UPDATE spontaneous_targets
          SET reply_at = datetime('now'), status = 'replied'
          WHERE id = ? AND status = 'sent'
        `);

        for (const m of messageIds) {
            if (!m.id) continue;

            const full = await gmail.users.messages.get({
                userId: "me",
                id: m.id,
                format: "metadata",
                metadataHeaders: ["From"],
            });

            const headers = full.data.payload?.headers ?? [];
            const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
            const fromHeader = get("From");
            const cleanFrom = extractEmailFromHeader(fromHeader).toLowerCase();
            if (!cleanFrom) continue;
            if (myEmail && cleanFrom === myEmail) continue;

            const internalMs = Number(full.data.internalDate);
            if (!Number.isFinite(internalMs) || internalMs <= 0) continue;

            const candidates = targetsByEmail.get(cleanFrom) ?? [];
            if (candidates.length === 0) continue;

            for (const t of candidates) {
                if (internalMs > t.sentAtMs) {
                    const result = stmtMarkReplied.run(t.id);
                    if (result.changes > 0) {
                        emitEvent("outreach_replied", { company: t.company, targetId: t.id });
                    }
                }
            }
        }
    }
}

// ── Link email to pipeline (or create a new entry) ───
async function syncEmailToPipeline(
    email: ClassifiedEmail,
    pipelineStatus: "applied" | "interview" | "offer" | "rejected",
): Promise<void> {
    const { linkEmailToJob } = await import("../jobs/crm.js");
    const matched = linkEmailToJob(email.from, pipelineStatus);

    if (matched) {
        console.log(`🔗 Pipeline: updated existing job → ${pipelineStatus}`);
        return;
    }

    // No match by sender domain — try matching by extracted company name
    if (email.company) {
        const existing = stmtFindJobByCompany.get(email.company);
        if (existing) {
            const { updatePipelineStatus } = await import("../jobs/tracker.js");
            updatePipelineStatus(existing.id, pipelineStatus);
            console.log(`🔗 Pipeline: matched by company "${email.company}" → ${pipelineStatus}`);
            return;
        }

        // Still no match — auto-create a job_postings entry
        const newId = `email:${email.company.toLowerCase().replace(/\s+/g, "-")}:${Date.now()}`;
        const title = email.position || "Position appliquée";
        stmtInsertJobFromEmail.run(newId, title, email.company, pipelineStatus);
        console.log(`➕ Pipeline: created new job entry for "${email.company}" → ${pipelineStatus}`);
    } else {
        console.log(`⚠️ Pipeline: no company extracted from email, skipping link`);
    }
}

// ── Check for job-related emails ─────────────────────
export async function checkJobEmails(): Promise<EmailSummary[]> {
    if (!isGmailReady()) return [];

    const auth = getAuthenticatedClient();
    if (!auth) return [];

    try {
        const gmail = google.gmail({ version: "v1", auth });

        // Yesterday's emails only — this runs daily at 8 AM via heartbeat
        const query = [
            "newer_than:1d",
            "-from:mailer-daemon",
            "-from:glassdoor.com",
            "-from:linkedin.com",
            "-from:indeed.com",
            "-from:welcometothejungle.com",
            '-subject:"job alert"',
            '-subject:"new jobs"',
            '-subject:"jobs you might like"',
            '-subject:"offres qui correspondent"',
            '-subject:"nouvelles offres"',
            "-category:promotions",
        ].join(" ");

        const listRes = await gmail.users.messages.list({
            userId: "me",
            q: query,
            maxResults: 50,
        });

        const messages = listRes.data.messages ?? [];
        if (messages.length === 0) return [];

        // Fetch metadata for all messages
        const rawEmails: RawEmail[] = [];
        for (const msg of messages) {
            try {
                const full = await gmail.users.messages.get({
                    userId: "me",
                    id: msg.id!,
                    format: "metadata",
                    metadataHeaders: ["From", "Subject", "Date"],
                });
                const headers = full.data.payload?.headers ?? [];
                const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
                const from = get("From");
                if (isExcludedSender(from)) continue;
                rawEmails.push({ 
                    from, 
                    subject: get("Subject"), 
                    snippet: full.data.snippet ?? "", 
                    date: get("Date"), 
                    gmailMessageId: msg.id ?? "",
                    gmailThreadId: msg.threadId ?? ""
                });
            } catch {
                // Skip individual message failures
            }
        }

        if (rawEmails.length === 0) return [];

        // AI classification — single LLM call for all emails
        const classified = await classifyEmailsWithAI(rawEmails);
        console.log(`📧 AI classifier: ${classified.length}/${rawEmails.length} emails are application responses`);

        const summaries: EmailSummary[] = [];
        for (const email of classified) {
            const summary: EmailSummary = { 
                from: email.from, 
                subject: email.subject, 
                date: email.date, 
                snippet: email.snippet, 
                status: email.status, 
                gmailMessageId: email.gmailMessageId, 
                gmailThreadId: email.gmailThreadId,
                action: email.action, 
                stage: email.stage 
            };
            summaries.push(summary);
            saveJobEmail(summary); // save (idempotent)

            // Always sync pipeline regardless of whether email was already saved
            const pipelineStatus =
                email.stage === "acknowledgment" ? "applied" :
                email.stage === "interview" ? "interview" :
                email.stage === "offer" ? "offer" :
                email.stage === "rejection" ? "rejected" : null;
            if (pipelineStatus) {
                await syncEmailToPipeline(email, pipelineStatus);
            }
        }

        return summaries;
    } catch (error) {
        console.error("❌ Gmail check failed:", error);
        return [];
    }
}

// ── Scan progress tracking ────────────────────────────
export interface ScanProgress {
    running: boolean;
    phase: "idle" | "fetching" | "metadata" | "classifying" | "done" | "error";
    totalEmails: number;
    processed: number;
    matched: number;
    error?: string;
    lastScanAt?: string;
}

export const scanProgress: ScanProgress = {
    running: false, phase: "idle", totalEmails: 0, processed: 0, matched: 0,
};

// ── Deep scan (backfill) — searches more broadly ─────
export async function scanJobEmails(days: number = 14): Promise<EmailSummary[]> {
    if (scanProgress.running) return [];
    if (!isGmailReady()) return [];

    const auth = getAuthenticatedClient();
    if (!auth) return [];

    scanProgress.running = true;
    scanProgress.phase = "fetching";
    scanProgress.totalEmails = 0;
    scanProgress.processed = 0;
    scanProgress.matched = 0;
    scanProgress.error = undefined;

    try {
        const gmail = google.gmail({ version: "v1", auth });

        const query = [
            `newer_than:${days}d`,
            "-from:mailer-daemon",
            "-from:glassdoor.com",
            "-from:linkedin.com",
            "-from:indeed.com",
            "-from:welcometothejungle.com",
            '-subject:"job alert"',
            '-subject:"new jobs"',
            '-subject:"jobs you might like"',
            '-subject:"offres qui correspondent"',
            '-subject:"nouvelles offres"',
            // NOTE: do NOT exclude category:promotions — ATS confirmation emails
            // (Lacoste, Workday, etc.) are routinely miscategorised as promotions by Gmail.
        ].join(" ");

        console.log(`📧 Scanning ${days} days of Gmail for application responses…`);

        // Paginate through all matching emails
        const messages: { id: string; threadId?: string }[] = [];
        let pageToken: string | undefined;
        do {
            const listRes = await gmail.users.messages.list({
                userId: "me",
                q: query,
                maxResults: 500,
                pageToken,
            });
            for (const m of listRes.data.messages ?? []) {
                if (m.id) messages.push({ id: m.id, threadId: m.threadId ?? undefined });
            }
            pageToken = listRes.data.nextPageToken ?? undefined;
        } while (pageToken);

        console.log(`📧 Found ${messages.length} emails to classify`);
        scanProgress.totalEmails = messages.length;
        if (messages.length === 0) {
            scanProgress.phase = "done";
            scanProgress.running = false;
            return [];
        }

        // Fetch metadata for all messages
        scanProgress.phase = "metadata";
        const rawEmails: RawEmail[] = [];
        for (let mi = 0; mi < messages.length; mi++) {
            const msg = messages[mi];
            try {
                const full = await gmail.users.messages.get({
                    userId: "me",
                    id: msg.id!,
                    format: "metadata",
                    metadataHeaders: ["From", "Subject", "Date"],
                });
                const headers = full.data.payload?.headers ?? [];
                const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
                const from = get("From");
                if (isExcludedSender(from)) continue;
                rawEmails.push({ 
                    from, 
                    subject: get("Subject"), 
                    snippet: full.data.snippet ?? "", 
                    date: get("Date"), 
                    gmailMessageId: msg.id ?? "",
                    gmailThreadId: msg.threadId ?? ""
                });
            } catch {
                // Skip individual failures
            }
            // Update progress during metadata fetch (counts toward ~50% of work)
            scanProgress.processed = Math.floor((mi + 1) / messages.length * 50);
        }

        // AI classification in batches of 20 (avoid token limits on large scans)
        scanProgress.phase = "classifying";
        scanProgress.totalEmails = rawEmails.length;
        const BATCH_SIZE = 20;
        const summaries: EmailSummary[] = [];
        let classifiedCount = 0;

        for (let i = 0; i < rawEmails.length; i += BATCH_SIZE) {
            const batch = rawEmails.slice(i, i + BATCH_SIZE);
            const classified = await classifyEmailsWithAI(batch);

            for (const email of classified) {
                const summary: EmailSummary = { 
                    from: email.from, 
                    subject: email.subject, 
                    date: email.date, 
                    snippet: email.snippet, 
                    status: email.status, 
                    gmailMessageId: email.gmailMessageId, 
                    gmailThreadId: email.gmailThreadId,
                    action: email.action, 
                    stage: email.stage 
                };
                summaries.push(summary);
                saveJobEmail(summary); // idempotent

                // Always sync pipeline regardless of whether email was already saved
                const pipelineStatus =
                    email.stage === "acknowledgment" ? "applied" :
                    email.stage === "interview" ? "interview" :
                    email.stage === "offer" ? "offer" :
                    email.stage === "rejection" ? "rejected" : null;
                if (pipelineStatus) {
                    await syncEmailToPipeline(email, pipelineStatus);
                }
            }
            classifiedCount += batch.length;
            scanProgress.processed = 50 + Math.floor(classifiedCount / rawEmails.length * 50);
            scanProgress.matched = summaries.length;
        }

        scanProgress.processed = 100;
        scanProgress.phase = "done";
        scanProgress.running = false;
        scanProgress.lastScanAt = new Date().toISOString();
        console.log(`📧 Scan complete: ${summaries.length} application responses found`);
        return summaries;
    } catch (error) {
        console.error("❌ Gmail scan failed:", error);
        scanProgress.phase = "error";
        scanProgress.error = (error as Error).message;
        scanProgress.running = false;
        return [];
    }
}

export { isGmailReady } from "./auth.js";

// ── TLDR email scraping ───────────────────────────────
function extractEmailText(payload: any): string | null {
    if (!payload) return null;
    
    const pieces: string[] = [];

    function walk(p: any) {
        if (p.body?.data && p.mimeType === "text/plain") {
            pieces.push(Buffer.from(p.body.data, "base64url").toString("utf-8"));
        } else if (p.body?.data && p.mimeType === "text/html" && pieces.length === 0) {
            const raw = Buffer.from(p.body.data, "base64url").toString("utf-8");
            pieces.push(
                raw
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                    .replace(/<(br|p|div|li|h[1-6])[^>]*>/gi, "\n")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/&nbsp;/g, " ")
                    .replace(/&amp;/g, "&")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/[ \t]+/g, " ")
                    .replace(/\n\s*\n/g, "\n\n")
                    .trim()
            );
        }
        if (p.parts) {
            for (const part of p.parts) walk(part);
        }
    }

    walk(payload);
    return pieces.length > 0 ? pieces.join("\n\n") : null;
}

export async function fetchTLDREmail(): Promise<string | null> {
    if (!isGmailReady()) return null;
    const auth = getAuthenticatedClient();
    if (!auth) return null;
    try {
        const gmail = google.gmail({ version: "v1", auth });
        const listRes = await gmail.users.messages.list({
            userId: "me",
            q: "from:tldr.tech newer_than:2d",
            maxResults: 5,
        });
        const messages = listRes.data.messages ?? [];
        if (messages.length === 0) return null;
        for (const msgRef of messages) {
            const full = await gmail.users.messages.get({
                userId: "me",
                id: msgRef.id!,
                format: "full",
            });
            const headers = full.data.payload?.headers ?? [];
            const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
            // Only TLDR AI newsletter
            if (!subject.toLowerCase().includes("ai")) continue;
            const text = extractEmailText(full.data.payload);
            if (text && text.length > 500) {
                console.log(`📧 TLDR email found: "${subject}"`);
                return text.slice(0, 10000);
            }
        }
        return null;
    } catch (err) {
        console.error("❌ TLDR email fetch failed:", err);
        return null;
    }
}
