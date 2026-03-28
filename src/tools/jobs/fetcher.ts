import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { config } from "../../config.js";

export interface JobPosting {
    id: string;        // "{source}:{externalId}"
    source: "linkedin" | "wttj";
    title: string;
    company: string;
    location: string;
    url: string;
}

const USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ── Retry helper ─────────────────────────────────────
async function fetchWithRetry(
    url: string,
    options: Parameters<typeof fetch>[1],
    maxRetries = 3,
): Promise<Awaited<ReturnType<typeof fetch>>> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const res = await fetch(url, options);
            if (res.status === 429 || res.status === 503) {
                const delay = 1000 * Math.pow(2, attempt);
                console.warn(`⚠️ HTTP ${res.status} — retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            return res;
        } catch (err) {
            lastErr = err;
            if (attempt < maxRetries - 1) {
                const delay = 1000 * Math.pow(2, attempt);
                console.warn(`⚠️ Fetch error — retrying in ${delay}ms: ${err}`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastErr ?? new Error("fetchWithRetry exhausted");
}

// ── LinkedIn guest API ────────────────────────────────
async function fetchLinkedInJobs(keywords: string, location: string): Promise<JobPosting[]> {
    const url = new URL(
        "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search",
    );
    url.searchParams.set("keywords", keywords);
    url.searchParams.set("location", location);
    url.searchParams.set("start", "0");
    url.searchParams.set("f_TPR", "r86400"); // last 24 h

    const res = await fetchWithRetry(url.toString(), {
        headers: { "User-Agent": USER_AGENT },
    });

    if (!res.ok) throw new Error(`LinkedIn HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const jobs: JobPosting[] = [];

    $("li").each((_, el) => {
        const card = $(el).find(".base-card");
        const urn = card.attr("data-entity-urn") ?? "";
        const match = urn.match(/jobPosting:(\d+)/);
        if (!match) return;

        const externalId = match[1];
        const title = card.find(".base-search-card__title").text().trim();
        const company = card.find(".base-search-card__subtitle").text().trim();
        const loc = card.find(".job-search-card__location").text().trim();
        const href = card.find("a.base-card__full-link").attr("href") ?? "";
        const jobUrl = href.split("?")[0];

        if (!title || !externalId) return;

        jobs.push({
            id: `linkedin:${externalId}`,
            source: "linkedin",
            title,
            company,
            location: loc || location,
            url: jobUrl || `https://www.linkedin.com/jobs/view/${externalId}`,
        });
    });

    return jobs;
}

// ── Welcome to the Jungle ─────────────────────────────
// Uses WTTJ's internal Algolia search API (public, read-only key).
const WTTJ_ALGOLIA_APP_ID = config.wttjAlgoliaAppId;
const WTTJ_ALGOLIA_API_KEY = config.wttjAlgoliaApiKey;
const WTTJ_FETCH_TIMEOUT_MS = 8000;

async function fetchWTTJJobs(keywords: string, location: string): Promise<JobPosting[]> {
    // Try two index names — WTTJ occasionally renames their Algolia indices
    const indexNames = ["wttj_jobs_production_en", "wttj_jobs_production_fr"];

    for (const indexName of indexNames) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), WTTJ_FETCH_TIMEOUT_MS);

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
                        requests: [{ indexName, params: `query=${encodeURIComponent(keywords)}&hitsPerPage=20` }],
                    }),
                    signal: controller.signal,
                }
            );
            clearTimeout(timeoutId);

            if (!res.ok) {
                console.warn(`⚠️ WTTJ [${indexName}] HTTP ${res.status} — trying next index`);
                continue;
            }

            const data = (await res.json()) as any;
            const hits: any[] = data.results?.[0]?.hits ?? [];

            if (hits.length === 0 && indexName !== indexNames[indexNames.length - 1]) {
                console.warn(`⚠️ WTTJ [${indexName}] returned 0 hits — trying next index`);
                continue;
            }

            console.log(`✅ WTTJ [${indexName}] returned ${hits.length} hits`);
            return hits.map((job) => ({
                id: `wttj:${job.slug ?? job.objectID}`,
                source: "wttj" as const,
                title: job.name ?? "Unknown",
                company: job.organization?.name ?? "Unknown",
                location: job.offices?.[0]?.city ?? location,
                url: `https://www.welcometothejungle.com/en/companies/${job.organization?.slug}/jobs/${job.slug}`,
            }));
        } catch (err: any) {
            const reason = err?.name === "AbortError" ? `timed out after ${WTTJ_FETCH_TIMEOUT_MS}ms` : String(err?.message ?? err);
            console.error(`❌ WTTJ [${indexName}] failed: ${reason}`);
        }
    }

    return [];
}

// ── Task A: Contract-Type Regex Gate ──────────────────
export const CONTRACT_FILTER = /\b(alternance|stage|apprentissage|contrat\s*pro|période\s*pro)\b/i;

function applyContractFilter(jobs: JobPosting[]): JobPosting[] {
    return jobs.filter(j => CONTRACT_FILTER.test(j.title));
}

export interface ScraperResult {
    data: JobPosting[];
    errors: string[];
}

// ── Main ──────────────────────────────────────────────
export async function fetchAllJobs(
    keywords: string,
    location: string,
): Promise<ScraperResult> {
    const errors: string[] = [];
    const results = await Promise.allSettled([
        fetchLinkedInJobs(keywords, location),
        fetchWTTJJobs(keywords, location),
    ]);

    const jobs: JobPosting[] = [];
    for (const result of results) {
        if (result.status === "fulfilled") {
            jobs.push(...result.value);
        } else {
            const msg = (result.reason as Error)?.message ?? String(result.reason);
            errors.push(msg);
            console.warn("⚠️ Job source failed:", msg);
        }
    }

    const filtered = applyContractFilter(jobs);
    console.log(`🔍 Found ${jobs.length} total, ${filtered.length} matched contract filter.`);

    return { data: filtered, errors };
}

import { chat } from "../../llm/llm.js";
import { getProfileValue } from "../../memory/profile.js";
import { getCache, setCache } from "../../memory/cache.js";

export async function getRankedJobsBriefing(): Promise<string> {
    const cached = getCache("jobs_briefing");
    if (cached) return cached;

    const keywords = getProfileValue("occupation");
    const location = getProfileValue("location");

    if (!keywords || !location) {
        return "💼 <b>Top Jobs For You</b>\n\n⚠️ I don't have your search criteria yet. Please set your <b>Occupation</b> and <b>Location</b> in your profile so I can start your daily search.";
    }

    console.log(`🔍 Fetching jobs for "${keywords}" in "${location}"…`);
    const { data: allJobs, errors } = await fetchAllJobs(keywords, location);

    let errorSection = "";
    if (errors.length > 0) {
        errorSection = `\n\n<i>⚠️ Note: Some sources failed (${errors.join(", ")})</i>`;
    }

    // Prioritize WTTJ
    const wttjJobs = allJobs.filter((j: JobPosting) => j.source === "wttj");
    const otherJobs = allJobs.filter((j: JobPosting) => j.source !== "wttj");
    const candidateJobs = [...wttjJobs, ...otherJobs].slice(0, 15);

    if (candidateJobs.length === 0) {
        return "💼 <b>Top Jobs For You</b>\n\nNo new matching jobs found today." + errorSection;
    }

    const cvSkills = getProfileValue("cv_skills") || "General software engineer";
    const userRhythm = getProfileValue("rhythm") || "Standard";
    const projects = getProfileValue("projects") || "None listed";

    try {
        const { message } = await chat([
            {
                role: "user",
                content:
                    `CONTEXT:\n` +
                    `- My CV Skills: "${cvSkills}"\n` +
                    `- My Projects: "${projects}"\n` +
                    `- My Education Rhythm: "${userRhythm}"\n\n` +
                    `TASKS:\n` +
                    `1. Rank these jobs by relevance and pick the TOP 3.\n` +
                    `2. RHYTHM CHECK: Look for conflicts with my rhythm (${userRhythm}). Add "⚠️ Rhythm Conflict" if found.\n` +
                    `3. SCORING BOOST: Boost jobs matching my projects (${projects}) by 15%.\n\n` +
                    `Format as Telegram HTML exactly like this (no extra text before or after):\n\n` +
                    `💼 <b>Top Jobs For You</b>\n\n` +
                    `<a href="URL"><b>Title — Company (Location)</b></a>\n` +
                    `Match: X% · Source\n\n` +
                    `<a href="URL"><b>Title — Company (Location)</b></a>\n` +
                    `Match: X% · Source\n\n` +
                    `<a href="URL"><b>Title — Company (Location)</b></a>\n` +
                    `Match: X% · Source\n\n` +
                    `Rules: use only the original job URLs provided, no numbered list, Source is "WTTJ" or "LinkedIn".\n\n` +
                    `JOBS:\n` +
                    candidateJobs.map((j, i) => `${i + 1}. ${j.title} at ${j.company} (${j.location}) - ${j.url}`).join("\n")
            }
        ]);

        const result = (message.content ?? "Failed to rank jobs.") + errorSection;
        setCache("jobs_briefing", result);
        return result;
    } catch (err) {
        console.error("❌ Job ranking failed:", err);
        return "💼 <b>Top Jobs For You</b>\n\nError ranking jobs." + errorSection;
    }
}
