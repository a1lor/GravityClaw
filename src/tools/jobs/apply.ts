import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { Document, Packer, Paragraph } from "docx";
import { chat, MODEL_BEST } from "../../llm/llm.js";
import { buildProfileContext, getProfileValue } from "../../memory/profile.js";
import { markApplied, saveJob } from "./tracker.js";
import { db } from "../../memory/db.js";
import { config } from "../../config.js";

// ── Constants ─────────────────────────────────────────
const USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const WTTJ_ALGOLIA_APP_ID = config.wttjAlgoliaAppId;
const WTTJ_ALGOLIA_API_KEY = config.wttjAlgoliaApiKey;

// Use environment variable or default to data/applications
const BASE_FOLDER = config.applicationBaseFolder || path.join(process.cwd(), "data", "applications");

// ── Types ─────────────────────────────────────────────
interface ScrapedJob {
    id: string;
    source: "linkedin" | "wttj";
    title: string;
    company: string;
    location: string;
    description: string;
    url: string;
}

export interface ApplyResult {
    success: boolean;
    title: string;
    company: string;
    language: "fr" | "en";
    coverLetterPath: string;
    folderPath: string;
    coverLetter: string;
    error?: string;
}

// ── Language detection ────────────────────────────────
const FR_TOKENS = new Set([
    "le", "la", "les", "de", "du", "des", "pour", "votre", "notre", "dans",
    "vous", "nous", "avec", "une", "sur", "par", "est", "sont", "qui", "que",
    "en", "au", "aux", "ce", "cette", "ces", "un", "ils", "elle", "ses",
    "et", "ou", "mais", "donc", "ainsi", "alors", "car", "ni", "or",
    "je", "tu", "il", "nous", "eux", "leur", "leurs", "mon", "ton", "son",
    "ma", "ta", "sa", "mes", "tes", "si", "très", "plus", "pas", "ne",
    "recherchons", "cherchons", "rejoindre", "poste", "équipe", "profil",
    "expérience", "compétences", "missions", "entreprise", "candidature",
]);

export function detectLanguage(text: string): "fr" | "en" {
    if (!text || text.trim().length === 0) return "en";

    // Strong signal: French-specific accented characters
    const frAccentRatio = (text.match(/[éèêëàâùûüçîïôœæ]/gi) ?? []).length / text.length;
    if (frAccentRatio > 0.005) return "fr";

    // Word-frequency signal — threshold lowered to 6% (tech descriptions have lots of EN terms)
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "en";
    const frCount = words.filter((w) => FR_TOKENS.has(w)).length;
    return frCount / words.length > 0.06 ? "fr" : "en";
}

// ── Job type detection ────────────────────────────────
export type JobType = 'alternance' | 'stage' | 'cdi' | 'cdd' | 'unspecified';

export function detectJobType(title: string, description: string): JobType {
    const t = (title + ' ' + description).toLowerCase();
    if (/\b(alternance|apprentissage|alternant|contrat d.apprentissage)\b/.test(t)) return 'alternance';
    if (/\b(stage|stagiaire|intern|internship)\b/.test(t)) return 'stage';
    if (/\bcdi\b/.test(t)) return 'cdi';
    if (/\bcdd\b/.test(t)) return 'cdd';
    return 'unspecified';
}

// ── Scrape WTTJ job by URL ────────────────────────────
async function scrapeWTTJ(url: string): Promise<ScrapedJob> {
    const match = url.match(/\/companies\/([^/]+)\/jobs\/([^/?#]+)/);
    if (!match) throw new Error("Invalid WTTJ URL format. Expected: /companies/{org}/jobs/{slug}");
    const [, orgSlug, jobSlug] = match;

    // Primary: fetch page directly and parse __NEXT_DATA__ (WTTJ is Next.js)
    try {
        const pageRes = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
                "Accept": "text/html,application/xhtml+xml",
            },
        });

        if (pageRes.ok) {
            const html = await pageRes.text();
            const $ = cheerio.load(html);

            // Parse embedded Next.js page data
            const nextDataScript = $("#__NEXT_DATA__").text();
            if (nextDataScript) {
                const nextData = JSON.parse(nextDataScript);
                // WTTJ stores job data at various paths depending on page version
                const job =
                    nextData?.props?.pageProps?.job ??
                    nextData?.props?.pageProps?.data?.job ??
                    nextData?.props?.pageProps?.initialData?.job;

                if (job) {
                    const description = [
                        job.description,
                        job.profile,
                        typeof job.contract_type === "string" ? job.contract_type : job.contract_type?.name,
                    ].filter(Boolean).join("\n\n");

                    return {
                        id: `wttj:${job.slug ?? jobSlug}`,
                        source: "wttj",
                        title: job.name ?? job.title ?? "Unknown",
                        company: job.organization?.name ?? orgSlug,
                        location: job.offices?.[0]?.city ?? "",
                        description,
                        url,
                    };
                }
            }

            // Fallback: parse JSON-LD structured data from HTML
            let title = "";
            let company = "";
            let description = "";
            let location = "";
            $('script[type="application/ld+json"]').each((_, el) => {
                try {
                    const data = JSON.parse($(el).text());
                    if (data["@type"] === "JobPosting") {
                        title = title || data.title || "";
                        company = company || data.hiringOrganization?.name || "";
                        description = description || data.description || "";
                        location = location || data.jobLocation?.address?.addressLocality || "";
                    }
                } catch { /* ignore */ }
            });

            if (title) {
                return {
                    id: `wttj:${jobSlug}`,
                    source: "wttj",
                    title,
                    company: company || orgSlug,
                    location,
                    description,
                    url,
                };
            }
        }
    } catch (err) {
        console.warn(`⚠️ WTTJ direct page fetch failed: ${err} — falling back to Algolia`);
    }

    // Fallback: Algolia search using extracted keywords from slug
    const keywords = jobSlug
        .replace(/_[^_]*$/, "")  // strip location suffix after last underscore
        .replace(/[-_]/g, " ")
        .replace(/\b(h|f|hf|alternance|stage|cdi|cdd)\b/gi, "")
        .trim()
        .slice(0, 60);

    const indexNames = ["wttj_jobs_production_fr", "wttj_jobs_production_en"];
    for (const indexName of indexNames) {
        try {
            const res = await fetch(
                `https://${WTTJ_ALGOLIA_APP_ID}-1.algolianet.com/1/indexes/*/queries`,
                {
                    method: "POST",
                    headers: {
                        "x-algolia-api-key": WTTJ_ALGOLIA_API_KEY,
                        "x-algolia-application-id": WTTJ_ALGOLIA_APP_ID,
                        "Content-Type": "application/json",
                        "User-Agent": USER_AGENT,
                    },
                    body: JSON.stringify({
                        requests: [{
                            indexName,
                            params: `query=${encodeURIComponent(keywords)}&hitsPerPage=10`,
                        }],
                    }),
                },
            );

            if (!res.ok) continue;

            const data = (await res.json()) as any;
            const hits: any[] = data.results?.[0]?.hits ?? [];
            const job = hits.find((h) => h.slug === jobSlug || h.objectID === jobSlug) ?? hits[0];
            if (!job) continue;

            const description = [job.description, job.profile].filter(Boolean).join("\n\n");
            return {
                id: `wttj:${job.slug ?? jobSlug}`,
                source: "wttj",
                title: job.name ?? "Unknown",
                company: job.organization?.name ?? orgSlug,
                location: job.offices?.[0]?.city ?? "",
                description,
                url,
            };
        } catch { /* try next index */ }
    }

    throw new Error(`Could not scrape WTTJ job. Try copying the full job page URL directly from your browser.`);
}

// ── Scrape LinkedIn job by URL ────────────────────────
async function scrapeLinkedIn(url: string): Promise<ScrapedJob> {
    // Extract job ID from URL: /jobs/view/1234567890 or /jobs/collections/recommended/?currentJobId=...
    const viewMatch = url.match(/\/jobs\/view\/(\d+)/);
    const paramMatch = url.match(/[?&]currentJobId=(\d+)/);
    const jobId = viewMatch?.[1] ?? paramMatch?.[1];
    if (!jobId) throw new Error("Invalid LinkedIn URL. Expected: /jobs/view/{id}");

    const canonicalUrl = `https://www.linkedin.com/jobs/view/${jobId}`;
    const res = await fetch(canonicalUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
        },
    });

    if (!res.ok) throw new Error(`LinkedIn HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    // Try JSON-LD structured data first
    let title = "";
    let company = "";
    let description = "";
    let location = "";

    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).text());
            if (data["@type"] === "JobPosting") {
                title = title || data.title || "";
                company = company || data.hiringOrganization?.name || "";
                description = description || data.description || "";
                location = location || data.jobLocation?.address?.addressLocality || "";
            }
        } catch { /* ignore */ }
    });

    // Fallback: parse HTML
    if (!title) title = $(".top-card-layout__title, h1.t-24").first().text().trim();
    if (!company) company = $(".topcard__org-name-link, .top-card-layout__card-details a").first().text().trim();
    if (!location) location = $(".topcard__flavor--bullet, .top-card-layout__card-details span").first().text().trim();
    if (!description) {
        description = $(".description__text, .show-more-less-html__markup").first().text().trim();
    }

    if (!title) throw new Error("Could not parse LinkedIn job title");

    return {
        id: `linkedin:${jobId}`,
        source: "linkedin",
        title,
        company,
        location,
        description,
        url: canonicalUrl,
    };
}

// ── Scrape job by URL (dispatch) ──────────────────────
export async function scrapeJobByUrl(url: string): Promise<ScrapedJob> {
    if (url.includes("welcometothejungle.com")) return scrapeWTTJ(url);
    if (url.includes("linkedin.com")) return scrapeLinkedIn(url);
    throw new Error("Unsupported job board. Supported: LinkedIn, Welcome to the Jungle");
}

// ── Generate cover letter ─────────────────────────────
export async function generateCoverLetter(
    title: string,
    company: string,
    description: string,
    language: "fr" | "en",
): Promise<string> {
    const { getAllProfile } = await import("../../memory/profile.js");
    const profile = getAllProfile();
    const name = profile["name"] || "the candidate";
    const background = [
        profile["cv_skills"] ? `Skills: ${profile["cv_skills"]}` : null,
        profile["projects"] ? `Projects: ${profile["projects"]}` : null,
        profile["background"] ? `Background: ${profile["background"]}` : null,
        profile["occupation"] ? `Role: ${profile["occupation"]}` : null,
        profile["availability"] ? `Availability: ${profile["availability"]}` : null,
    ].filter(Boolean).join("\n");

    const langInstruction = language === "fr"
        ? "Write ENTIRELY in French. Use vouvoiement (formal 'vous')."
        : "Write ENTIRELY in English.";

    const prompt =
        `Job description: ${description.slice(0, 2000)}\n\n` +
        `My background:\n${background}\n\n` +
        `Write a highly conversational, human-sounding 3-paragraph cover letter for ${name} applying to ${title} at ${company}:\n` +
        `> Hook with specific excitement about ${company} and this role\n` +
        `> Prove fit with quantified stories drawn from my background above\n` +
        `> Strong CTA asking for an interview\n\n` +
        `Tone rules:\n` +
        `- Must sound like a real person wrote it, not an AI.\n` +
        `- NEVER use words like "thrilled", "delve into", "delight", "testament", "tapestry", "seamlessly", or "embark".\n` +
        `- Keep it confident and direct. No fluff.\n` +
        `${langInstruction}\n` +
        `RETURN ONLY THE RAW TEXT. No subject line, no placeholders like [Name], no preamble, no markdown formatting. Just the paragraphs.`;

    const { message } = await chat([{ role: "user", content: prompt }], undefined, "", 1, MODEL_BEST);
    return message.content ?? "Error: Failed to generate cover letter.";
}

// ── Persist application to DB ─────────────────────────
const stmtUpdateApplyFields = db.prepare(
    `UPDATE job_postings SET cover_letter_path = ?, application_folder = ?, detected_language = ?, job_type = ? WHERE id = ?`,
);

// ── Main workflow ─────────────────────────────────────
export async function runApplyWorkflow(url: string): Promise<ApplyResult> {
    // 1. Scrape
    const job = await scrapeJobByUrl(url);

    // 2. Detect language and job type (use title + description for better accuracy)
    const language = detectLanguage(job.title + " " + job.description);
    const jobType = detectJobType(job.title, job.description);

    // 3. Generate cover letter
    const coverLetter = await generateCoverLetter(job.title, job.company, job.description, language);

    // 4. Build folder path
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const safeName = (s: string) => s.replace(/[/\\:*?"<>|]/g, "-").trim();
    const folderName = `${safeName(job.company)} - ${safeName(job.title)} - ${yearMonth}`;
    const folderPath = path.join(BASE_FOLDER, folderName);
    fs.mkdirSync(folderPath, { recursive: true });

    // 5. Save cover letter as .docx
    const doc = new Document({
        sections: [
            {
                properties: {},
                children: coverLetter
                    .split("\n")
                    .filter((text) => text.trim().length > 0)
                    .map((text) => new Paragraph({ text: text.trim(), spacing: { after: 200 } })),
            },
        ],
    });

    const buffer = await Packer.toBuffer(doc);
    const coverLetterPath = path.join(folderPath, `Lettre de motivation - ${safeName(job.company)}.docx`);
    fs.writeFileSync(coverLetterPath, buffer);

    // 6. Select and copy appropriate CV from library
    const { selectCV } = await import("../cv-manager.js");
    // Map job_type to CV job type (cdd/cdi → general)
    const cvJobType = (jobType === 'cdd' || jobType === 'cdi') ? 'general' : jobType;
    const selectedCV = selectCV(cvJobType as any, language);

    if (selectedCV && fs.existsSync(selectedCV.file_path)) {
        const cvExt = path.extname(selectedCV.file_path) || ".pdf";
        const destCv = path.join(folderPath, `cv${cvExt}`);
        fs.copyFileSync(selectedCV.file_path, destCv);
        console.log(`📎 Copied CV: ${selectedCV.file_name} (${selectedCV.job_type}-${selectedCV.language})`);
    } else {
        console.warn("⚠️ No suitable CV in library, trying fallback from profile");
        const cvPath = getProfileValue("cv_path");
        if (cvPath && fs.existsSync(cvPath)) {
            const cvExt = path.extname(cvPath) || ".pdf";
            const destCv = path.join(folderPath, `cv${cvExt}`);
            fs.copyFileSync(cvPath, destCv);
        }
    }

    // 7. Save job to DB + mark applied
    saveJob({
        id: job.id,
        source: job.source,
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
    });
    markApplied(job.id);

    // 8. Persist extra metadata
    stmtUpdateApplyFields.run(coverLetterPath, folderPath, language, jobType, job.id);

    return {
        success: true,
        title: job.title,
        company: job.company,
        language,
        coverLetterPath,
        folderPath,
        coverLetter,
    };
}
