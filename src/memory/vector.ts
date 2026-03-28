import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "../config.js";
import { embed, EMBED_DIMENSIONS } from "./embeddings.js";

// ── Namespaces ────────────────────────────────────────
const CONV_NS = "conversations";
const MEM_NS = "memories";

// ── Lazy initialisation ───────────────────────────────
// Pinecone init is non-blocking. If the key is missing or the API
// fails, all exported functions degrade to silent no-ops.
let pinecone: Pinecone | null = null;
let ready = false;
let disabledForSession = false;
let disableReasonLogged = false;

function disableSemanticMemoryForSession(reason: unknown) {
    ready = false;
    pinecone = null;
    disabledForSession = true;
    if (!disableReasonLogged) {
        const msg = reason instanceof Error ? reason.message : String(reason);
        console.warn(`⚠️ Semantic memory disabled for this session: ${msg}`);
        disableReasonLogged = true;
    }
}

// Kick off init immediately when the module is first imported.
const _initPromise: Promise<void> = (async () => {
    if (!config.pineconeApiKey) {
        console.warn("⚠️  PINECONE_API_KEY not set — semantic memory disabled");
        return;
    }

    try {
        pinecone = new Pinecone({ apiKey: config.pineconeApiKey });

        const { indexes } = await pinecone.listIndexes();
        const exists = (indexes ?? []).some((idx) => idx.name === config.pineconeIndex);

        if (!exists) {
            console.log(`🔧 Creating Pinecone index "${config.pineconeIndex}"…`);
            await pinecone.createIndex({
                name: config.pineconeIndex,
                dimension: EMBED_DIMENSIONS,
                metric: "cosine",
                spec: { serverless: { cloud: "aws", region: "us-east-1" } },
                waitUntilReady: true,
            });
        }

        ready = true;
        console.log(`✅ Pinecone ready — index: "${config.pineconeIndex}"`);
    } catch (err) {
        console.error("❌ Pinecone init failed:", err);
        disableSemanticMemoryForSession(err);
    }
})();

// Helper: returns the index handle or null if not ready.
function idx() {
    return (!disabledForSession && ready && pinecone) ? pinecone.index(config.pineconeIndex) : null;
}

// ── Upsert operations ─────────────────────────────────

export async function upsertConversation(
    id: number,
    role: string,
    content: string,
): Promise<void> {
    const index = idx();
    if (!index) return;

    try {
        const values = await embed(content);
        await index.namespace(CONV_NS).upsert({
            records: [
                {
                    id: `conv-${id}`,
                    values,
                    metadata: {
                        role,
                        content: content.slice(0, 1000),
                        created_at: new Date().toISOString(),
                        sqlite_id: id,
                    },
                },
            ],
        });
    } catch (err) {
        console.error("❌ Pinecone upsert conversation failed:", err);
        // If embeddings/index dimensions are mismatched or the upstream rejects the request,
        // disable semantic memory for the rest of this process to avoid log spam + cron delays.
        disableSemanticMemoryForSession(err);
    }
}

export async function upsertMemory(
    id: number,
    content: string,
    tags: string = "",
): Promise<void> {
    const index = idx();
    if (!index) return;

    try {
        const values = await embed(content);
        await index.namespace(MEM_NS).upsert({
            records: [
                {
                    id: `mem-${id}`,
                    values,
                    metadata: {
                        content: content.slice(0, 1000),
                        tags,
                        created_at: new Date().toISOString(),
                        sqlite_id: id,
                    },
                },
            ],
        });
    } catch (err) {
        console.error("❌ Pinecone upsert memory failed:", err);
        disableSemanticMemoryForSession(err);
    }
}

export async function deleteMemoryVector(id: number): Promise<void> {
    const index = idx();
    if (!index) return;

    try {
        await index.namespace(MEM_NS).deleteOne({ id: `mem-${id}` });
    } catch (err) {
        console.error("❌ Pinecone delete memory vector failed:", err);
        disableSemanticMemoryForSession(err);
    }
}

/**
 * Returns the best match for a memory if similarity ≥ threshold.
 * Used to prevent storing near-duplicate facts or finding conflicts.
 */
export async function findSimilarMemory(
    content: string,
    threshold: number = 0.88,
): Promise<{ id: number; score: number } | null> {
    const index = idx();
    if (!index) return null;

    try {
        const values = await embed(content);
        const result = await index.namespace(MEM_NS).query({
            vector: values,
            topK: 1,
            includeMetadata: true,
        });

        const match = result.matches?.[0];
        const topScore = match?.score ?? 0;

        if (topScore >= threshold) {
            if (!match?.metadata) {
                console.warn("⚠️ Pinecone match missing metadata — skipping deduplication");
                return null;
            }
            const sqliteId = match.metadata.sqlite_id;
            if (typeof sqliteId !== "number") {
                console.warn("⚠️ Pinecone match missing sqlite_id in metadata — skipping deduplication");
                return null;
            }
            return { id: sqliteId, score: topScore };
        }
        return null;
    } catch (err) {
        console.error("❌ Pinecone similarity check failed:", err);
        disableSemanticMemoryForSession(err);
        return null;
    }
}

// ── Semantic recall ───────────────────────────────────

interface SimilarConversation {
    role: string;
    content: string;
    created_at: string;
    score: number;
}

/**
 * Queries Pinecone for the most semantically similar past exchanges.
 * Returns a formatted string ready to be appended to the system prompt,
 * or an empty string if nothing relevant is found.
 */
export async function buildSemanticRecall(
    query: string,
    topK: number = 5,
): Promise<string> {
    const index = idx();
    if (!index) return "";

    try {
        const values = await embed(query);
        const result = await index.namespace(CONV_NS).query({
            vector: values,
            topK,
            includeMetadata: true,
        });

        const hits: SimilarConversation[] = (result.matches ?? [])
            .filter((m) => (m.score ?? 0) >= 0.72) // skip weak matches
            .map((m) => ({
                role: String(m.metadata?.role ?? ""),
                content: String(m.metadata?.content ?? ""),
                created_at: String(m.metadata?.created_at ?? ""),
                score: m.score ?? 0,
            }));

        if (hits.length === 0) return "";

        const lines = hits.map((h) => {
            const age = formatRelativeAge(h.created_at);
            const label = h.role === "user" ? "You" : "Claw";
            return `  [${age}] ${label}: ${h.content}`;
        });

        return `\n\n## Semantically Relevant Past Context\n${lines.join("\n")}`;
    } catch (err) {
        console.error("❌ Pinecone semantic recall failed:", err);
        disableSemanticMemoryForSession(err);
        return "";
    }
}

// ── Helpers ───────────────────────────────────────────

function formatRelativeAge(isoDate: string): string {
    try {
        const diff = Date.now() - new Date(isoDate).getTime();
        const mins = Math.floor(diff / 60_000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 30) return `${days}d ago`;
        const months = Math.floor(days / 30);
        return `${months}mo ago`;
    } catch {
        return "?";
    }
}

// Export the init promise so callers can optionally await startup.
export const vectorReady = _initPromise;
