import { db } from "../memory/db.js";
import { chat, MODEL_BEST } from "../llm/llm.js";
import fs from "fs";
import path from "path";

const LEARNING_INTERVAL = 20; // Learn after every 20 interactions
let interactionCount = 0;

export async function recordInteraction() {
    interactionCount++;
    if (interactionCount >= LEARNING_INTERVAL) {
        interactionCount = 0;
        await evolveSoul();
    }
}

async function evolveSoul() {
    console.log("🧬 Soul evolution: analyzing conversation patterns...");

    const recent = db.prepare(`
        SELECT role, content FROM conversations
        WHERE created_at > datetime('now', '-7 days')
        AND is_summary = 0
        ORDER BY id DESC LIMIT 50
    `).all() as any[];

    if (recent.length < 10) {
        console.log("⏭️  Not enough data for soul evolution");
        return;
    }

    const conversationText = recent
        .reverse()
        .map(m => {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return `${m.role}: ${content.slice(0, 300) || ""}`;
        })
        .join("\n");

    const prompt = `Analyze this conversation history between a user and their AI assistant.

Identify:
1. User corrections (e.g., "Actually, I prefer X")
2. Repeated patterns/requests that indicate unmet needs
3. Positive feedback that should be reinforced

Suggest 1-2 NEW concise rules for the agent's directive file.

CONVERSATION:
${conversationText}

Return ONLY a JSON array of rules (or empty array if no clear patterns):
["Rule 1", "Rule 2"]`;

    try {
        const { message } = await chat([{ role: "user", content: prompt }], undefined, "", 1, MODEL_BEST);
        const raw = message.content ?? "";

        const start = raw.indexOf("[");
        const end = raw.lastIndexOf("]");
        if (start === -1 || end === -1) {
            console.log("✅ Soul evolution: no structured response");
            return;
        }

        const rules = JSON.parse(raw.substring(start, end + 1)) as string[];

        if (rules.length === 0) {
            console.log("✅ Soul evolution: no new rules needed");
            return;
        }

        const soulPath = path.join(process.cwd(), "data", "soul.md");
        const newSection = `\n\n--- AUTO-LEARNED (${new Date().toISOString()}) ---\n` +
            rules.map((r, i) => `${i + 1}. ${r}`).join("\n");

        fs.appendFileSync(soulPath, newSection);
        console.log(`✅ Soul evolved: added ${rules.length} new rule(s)`);
    } catch (err) {
        console.warn("⚠️ Soul learning failed:", err);
    }
}
