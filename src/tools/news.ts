import { chat } from "../llm/llm.js";
import * as cheerio from "cheerio";
import { getCache, setCache, deleteCache } from "../memory/cache.js";

interface NewsItem {
    title: string;
    link: string;
    snippet: string;
    source: string;
}

// Trusted RSS sources — used when no TLDR email is available
const SOURCES = [
    { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
    { name: "The Verge AI", url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml" },
    { name: "MIT Tech Review", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed/" },
    { name: "OpenAI Blog", url: "https://openai.com/news/rss.xml" },
    { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/" },
    { name: "Anthropic Blog", url: "https://www.anthropic.com/rss.xml" },
    { name: "Ars Technica AI", url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
    { name: "Reddit r/MachineLearning", url: "https://www.reddit.com/r/MachineLearning/top/.rss?t=day" },
    { name: "Reddit r/artificial", url: "https://www.reddit.com/r/artificial/top/.rss?t=day" },
];

async function fetchRss(source: typeof SOURCES[0]): Promise<NewsItem[]> {
    try {
        const res = await fetch(source.url, {
            headers: { "User-Agent": "GravityClaw/1.0" },
            signal: AbortSignal.timeout(5000) // 5s timeout
        });
        if (!res.ok) return [];
        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        const items: NewsItem[] = [];

        // RSS/Atom Unified Selector
        const entries = $("item").length > 0 ? $("item") : $("entry");

        entries.slice(0, 5).each((_, el) => {
            const title = $(el).find("title").text().trim();
            let link = $(el).find("link").text().trim();
            if (!link) link = $(el).find("link").attr("href") ?? "";

            const description = $(el).find("description").text().trim() ||
                $(el).find("content\\:encoded").text().trim() ||
                $(el).find("summary").text().trim() ||
                $(el).find("content").text().trim();

            const cleanSnippet = cheerio.load(description).text().trim().slice(0, 400);

            if (title && link) {
                items.push({ title, link, snippet: cleanSnippet, source: source.name });
            }
        });

        return items;
    } catch (e) {
        // Silent skip as per Task 2
        return [];
    }
}

async function fetchReadingTime(url: string): Promise<number> {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return 0;
        const html = await res.text();
        const $ = cheerio.load(html);
        const text = $.text();
        const wordCount = text.trim().split(/\s+/).length;
        return Math.ceil(wordCount / 200);
    } catch {
        return 0;
    }
}

function getSeenNews(): { urls: Set<string>; titles: string[] } {
    const stored = getCache("seen_news");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        return {
            urls: new Set(Array.isArray(stored.urls) ? stored.urls : []),
            titles: Array.isArray(stored.titles) ? stored.titles : [],
        };
    }
    return { urls: new Set(), titles: [] };
}

function recordSeenNews(urls: string[], titles: string[]): void {
    const seen = getSeenNews();
    for (const url of urls) seen.urls.add(url);
    const allTitles = [...new Set([...seen.titles, ...titles])];
    setCache("seen_news", { urls: [...seen.urls], titles: allTitles });
}

export function clearSeenNews(): void {
    deleteCache("seen_news");
    // Keep old key in case it was written before this refactor
    deleteCache("seen_news_urls");
}

// ── TLDR section format prompt (shared) ──────────────
const TLDR_SECTION_PROMPT =
    `Format as a TLDR-style AI news digest in Telegram HTML. Use ONLY these section headers (skip any section with no fitting items):\n\n` +
    `🚀 <b>Headlines &amp; Launches</b>\n\n` +
    `<a href="URL"><b>Title</b></a>\n\n` +
    `2-3 sentence summary in newsletter style.\n\n` +
    `🧠 <b>Deep Dives &amp; Analysis</b>\n\n` +
    `<a href="URL"><b>Title</b></a>\n\n` +
    `2-3 sentence summary.\n\n` +
    `🧑‍💻 <b>Engineering &amp; Research</b>\n\n` +
    `<a href="URL"><b>Title</b></a>\n\n` +
    `2-3 sentence summary.\n\n` +
    `🎁 <b>Miscellaneous</b>\n\n` +
    `<a href="URL"><b>Title</b></a>\n\n` +
    `2-3 sentence summary.\n\n` +
    `Rules: exactly 10 items total, no markdown asterisks, no read times, no extra text outside the HTML, use only the original links.\n\n`;

// Strip any existing read-time annotations so the real injection runs exactly once
function stripReadTimes(text: string): string {
    return text.replace(/\s*\(\s*[Nn\d]+\s*min(?:ute)?\s*read\s*\)/gi, "");
}

// ── Generate briefing from TLDR newsletter email ──────
async function generateBriefingFromEmail(emailContent: string): Promise<string> {
    const { message } = await chat([{
        role: "user",
        content:
            `The following is a TLDR AI newsletter. Extract the top 10 most important articles and reformat them as Telegram HTML.\n\n` +
            TLDR_SECTION_PROMPT +
            `Preserve the original article URLs. Do not include read times — they will be added separately.\n\n` +
            `Newsletter content:\n${emailContent}`,
    }]);
    return stripReadTimes(message.content ?? "");
}

export async function getAINewsBriefing(): Promise<string> {
    const cached = getCache("news_briefing");
    if (cached) return cached;

    // ── Try TLDR email first ──────────────────────────────
    try {
        const { fetchTLDREmail } = await import("./gmail/checker.js");
        const emailContent = await fetchTLDREmail();
        if (emailContent) {
            console.log("📧 Generating news briefing from TLDR email…");
            let result = await generateBriefingFromEmail(emailContent);
            if (result.length > 100) {
                // Inject real reading times (same as RSS path)
                const urlMatches = [...result.matchAll(/<a href="([^"]+)"/g)];
                if (urlMatches.length > 0) {
                    const urls = urlMatches.map((m) => m[1]);
                    const times = await Promise.all(urls.map(fetchReadingTime));
                    for (let i = 0; i < urls.length; i++) {
                        if (times[i] > 0) {
                            result = result.replace(
                                new RegExp(`(<a href="${urls[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"><b>)([^<]+)(</b></a>)`),
                                `$1$2 (${times[i]} min read)$3`,
                            );
                        }
                    }
                }
                setCache("news_briefing", result);
                return result;
            }
        }
    } catch {
        // Gmail not configured or fetch failed — fall through to RSS
    }

    // ── RSS fallback ──────────────────────────────────────
    console.log("🌐 Fetching AI news from trusted RSS sources…");
    const allResults = await Promise.all(SOURCES.map(fetchRss));
    const seen = getSeenNews();
    const flatItems = allResults.flat().filter((item) => !seen.urls.has(item.link));

    if (flatItems.length === 0) {
        const fallback =
            `🚀 <b>Headlines &amp; Launches</b>\n\n` +
            `<a href="https://openai.com/news"><b>AI Model Releases Continue in 2026</b></a>\n\n` +
            `Major AI labs keep shipping new model versions with improved reasoning, coding, and tool use. Performance benchmarks continue to climb across all major providers.\n\n` +
            `<a href="https://techcrunch.com/category/artificial-intelligence/"><b>Enterprise AI Adoption Accelerating</b></a>\n\n` +
            `Companies are embedding AI into core workflows at an unprecedented rate. Productivity gains in software engineering, legal, and finance sectors are drawing executive attention and budget.\n\n` +
            `<i>⚠️ Live feeds unavailable — showing static fallback.</i>`;
        return fallback;
    }

    const storiesBlock = flatItems
        .map((it, i) => `Story ${i + 1}:\nTitle: ${it.title}\nSource: ${it.source}\nLink: ${it.link}\nSnippet: ${it.snippet}`)
        .join("\n\n");

    const seenTitlesBlock = seen.titles.length > 0
        ? `IMPORTANT: Do NOT select any of these already-seen stories:\n${seen.titles.map((t) => `- ${t}`).join("\n")}\n\n`
        : "";

    try {
        const { message } = await chat([{
            role: "user",
            content:
                seenTitlesBlock +
                `Select the 10 most important AI news stories from the list below.\n\n` +
                TLDR_SECTION_PROMPT +
                storiesBlock,
        }]);

        let result = stripReadTimes(message.content ?? "Failed to generate news digest.");

        // Inject real reading times
        const urlMatches = [...result.matchAll(/<a href="([^"]+)"/g)];
        if (urlMatches.length > 0) {
            const urls = urlMatches.map((m) => m[1]);
            const times = await Promise.all(urls.map(fetchReadingTime));
            for (let i = 0; i < urls.length; i++) {
                if (times[i] > 0) {
                    result = result.replace(
                        new RegExp(`(<a href="${urls[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"><b>)([^<]+)(</b></a>)`),
                        `$1$2 (${times[i]} min read)$3`,
                    );
                }
            }
        }

        // Record seen so they're excluded next time
        const selectedUrls = [...result.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
        const selectedTitles = [...result.matchAll(/<a href="[^"]+"><b>([^<]+)<\/b><\/a>/g)]
            .map((m) => m[1].replace(/\s*\(\d+ min read\)$/, "").trim());
        if (selectedUrls.length > 0) recordSeenNews(selectedUrls, selectedTitles);

        setCache("news_briefing", result);
        return result;
    } catch (err) {
        console.error("❌ News LLM failed:", err);
        return "AI News Today\n\nError generating briefing.";
    }
}
