import { chat } from "../llm/llm.js";

// ── Fact extraction prompt ────────────────────────────
// Kept minimal so even a small model handles it reliably.
function buildPrompt(userMessage: string, assistantResponse: string): string {
    return `You are a fact extractor for a personal AI assistant.

Given this conversation exchange, identify facts worth remembering about the user — their preferences, interests, goals, habits, plans, identity, worldview, relationships, or important personal context.

USER: ${userMessage}
ASSISTANT: ${assistantResponse}

Rules:
- Extract only concrete facts about THE USER (not general knowledge). Pay special attention to their identity, worldview, and how they think.
- One atomic fact per item (one idea only)
- Assign a CATEGORY to each fact (logistics, preferences, tech_stack, contact, bio, identity, worldview, relationships, other)
- Skip facts that are obvious, temporary, or only relevant to this single exchange
- NEVER extract or save: passwords, API keys, tokens, secrets, credit card numbers, SSNs, or any authentication credentials. If you see these, skip them entirely.
- Return JSON only — no markdown, no explanation

Return: {"facts": [{"content": "fact here", "category": "logistics"}]}
If nothing is worth remembering, return: {"facts": []}`;
}

// ── Main export ───────────────────────────────────────
/**
 * Fire-and-forget: extracts facts from a conversation exchange,
 * deduplicates against existing Pinecone memories, and persists
 * genuinely new facts to both SQLite and Pinecone.
 */
export async function extractAndSaveFacts(
    userMessage: string,
    assistantResponse: string,
): Promise<void> {
    try {
        const { message } = await chat([
            { role: "user", content: buildPrompt(userMessage, assistantResponse) },
        ]);

        const raw = message.content ?? "{}";
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return;

        const parsed = JSON.parse(jsonMatch[0]) as { facts?: any[] };
        if (!Array.isArray(parsed.facts) || parsed.facts.length === 0) return;

        const { findSimilarMemory, upsertMemory } = await import("../memory/vector.js");
        const { saveMemory, updateMemory } = await import("../memory/memories.js");

        for (const item of parsed.facts) {
            const content = String(item.content ?? "").trim();
            const category = String(item.category ?? "other").trim();
            if (!content) continue;

            const similar = await findSimilarMemory(content, 0.88);
            if (similar) {
                console.log(`  🔄 Updating similar memory #${similar.id}: "${content.slice(0, 50)}…"`);
                updateMemory(similar.id, content, category, "auto");
                await upsertMemory(similar.id, content, "auto");
            } else {
                const id = saveMemory(content, category, "auto");
                await upsertMemory(id, content, "auto");
                console.log(`  ✅ Saved new fact #${id} (${category}): "${content.slice(0, 50)}…"`);
            }
        }
    } catch (err) {
        console.error("❌ Fact extraction failed:", err);
    }
}
