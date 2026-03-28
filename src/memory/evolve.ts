import { db } from "./db.js";
import { chat } from "../llm/llm.js";

// ── SQL PREPARED STATEMENTS ───────────────────────────

// Archiving under-accessed memories older than 30 days
const stmtArchiveDecayed = db.prepare(`
    UPDATE memories 
    SET is_archived = 1 
    WHERE accessed_at < datetime('now', '-30 days')
      AND access_count < 3
      AND is_archived = 0
`);

// Find active, unarchived memories for potential merging
const stmtGetActiveMemories = db.prepare(`
    SELECT * FROM memories 
    WHERE is_archived = 0
    ORDER BY created_at DESC
`);

// Delete old rows that were merged
const stmtDeleteMemory = db.prepare(`DELETE FROM memories WHERE id = ?`);

export async function evolveMemories(): Promise<string> {
    console.log("🧬 Starting memory evolution and decay...");

    // 1. Decay Phase: Archive old, unused memories
    const archiveResult = stmtArchiveDecayed.run();
    let report = `Memory Evolution Report:\n- Archived ${archiveResult.changes} decayed memories.\n`;

    // 2. Consolidation Phase: Merge semantically similar active memories
    const activeMemories = stmtGetActiveMemories.all() as any[];
    if (activeMemories.length < 2) {
        report += "- Not enough active memories to merge.";
        return report;
    }

    // Process in batches of 50 to avoid massive LLM prompts
    const BATCH_SIZE = 50;
    let mergedCount = 0;
    const { saveMemory } = await import("./memories.js");
    const { upsertMemory, deleteMemoryVector } = await import("./vector.js");

    for (let i = 0; i < activeMemories.length; i += BATCH_SIZE) {
        const batch = activeMemories.slice(i, i + BATCH_SIZE);
        if (batch.length < 2) continue;

        const memoryDump = batch.map(m => `[ID: ${m.id} | Cat: ${m.category}] ${m.content}`).join("\n");
        const prompt = 
        `You are maintaining a long-term memory system. Review this list of raw memories. 
Identify if any memories are duplicates or can be combined into a single richer, consolidated memory.
If you find overlaps, return a JSON array of the IDs you want to MERGE, along with the new consolidated text and a suggested category.
If no merges are necessary, return an empty array.

Return ONLY raw JSON in this exact structure:
{
  "merges": [
    {
      "ids_to_delete": [2, 5],
      "new_content": "The user is an ex-founder who built a VR agency and loves transparent communication.",
      "category": "bio"
    }
  ]
}

MEMORIES:
${memoryDump}`;

        try {
            const { message } = await chat([{ role: "user", content: prompt }]);
            const responseJsonStr = message.content?.trim();
            if (!responseJsonStr) continue;
            
            const cleaned = responseJsonStr.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
            const blockMatch = cleaned.match(/\{[\s\S]*\}/);
            const parsedStr = blockMatch ? blockMatch[0] : cleaned;
            const result = JSON.parse(parsedStr);

            if (result.merges && Array.isArray(result.merges)) {
                for (const merge of result.merges) {
                    const ids = merge.ids_to_delete;
                    if (!Array.isArray(ids) || ids.length < 2) continue;
                    
                    const newId = saveMemory(merge.new_content, merge.category, "evolved-merge");
                    await upsertMemory(newId, merge.new_content, "evolved-merge");

                    for (const oldId of ids) {
                        stmtDeleteMemory.run(oldId);
                        try { await deleteMemoryVector(oldId); } catch { /* ignore if already missing from vector DB */ }
                    }
                    mergedCount++;
                }
            }
        } catch (err: any) {
            console.error(`⚠️ Memory evolution batch ${i/BATCH_SIZE + 1} failed:`, err.message);
        }
    }

    report += `- Processed ${mergedCount} successful memory consolidations across ${Math.ceil(activeMemories.length / BATCH_SIZE)} batches.\n`;

    console.log("🧬 Evolution complete.");
    return report;
}
