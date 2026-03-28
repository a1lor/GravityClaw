import { config } from "../config.js";
import { session } from "./session.js";
import { chat, type ChatCompletionMessageParam } from "../llm/llm.js";
import { getToolSchemas, executeTool } from "../tools/definitions.js";
import { getMcpToolSchemas, executeMcpTool, isMcpTool } from "../mcp/bridge.js";
import { getRecentHistory, saveMessage } from "../memory/conversations.js";
import { buildMemoryContext } from "../memory/memories.js";
import { buildSemanticRecall, upsertConversation } from "../memory/vector.js";
import { extractAndSaveFacts } from "./fact-extractor.js";
import { buildProfileContext } from "../memory/profile.js";

// ── Task 4: Relevance Filter ──────────────────────────
function getRelevantCategories(message: string): string[] {
    const text = message.toLowerCase();
    const categories: string[] = ["preferences", "bio", "general", "identity", "worldview", "relationships"];

    if (/\b(job|work|alternance|stage|apply|posting)\b/i.test(text)) {
        categories.push("tech_stack", "logistics");
    }
    if (/\b(email|gmail|message|contact|application)\b/i.test(text)) {
        categories.push("contact", "application_history");
    }
    return [...new Set(categories)];
}

// ── Task 5: Long-Term Summary ─────────────────────────
export async function handleLongTermSummary(force = false): Promise<string | undefined> {
    const { getConversationCount, getFullHistory, clearHistory } = await import("../memory/conversations.js");
    const count = getConversationCount();

    if (!force && count < 200) return undefined;

    console.log(`🧹 Conversation history too long (${count} rows). Summarizing…`);
    const history = getFullHistory();
    if (history.length === 0) return undefined;

    const historyText = history.map((h) => `${h.role}: ${h.content}`).join("\n");

    const { message } = await chat([
        {
            role: "user",
            content: `Summarize the key takeaways, decisions, and outcomes from this conversation history for long-term memory. Only include facts that are not already known. Be concise.\n\n${historyText}`,
        },
    ]);

    const summary = message.content;
    let finalId: number | undefined;
    if (summary) {
        const { saveMemory } = await import("../memory/memories.js");
        const { upsertMemory } = await import("../memory/vector.js");
        const id = saveMemory(summary, "conversation_summary", "auto-summarized");
        await upsertMemory(id, summary, "auto-summarized");
        console.log(`✅ Saved conversation summary #${id}`);
        finalId = id;
    }

    const { replaceWithSummary } = await import("../memory/conversations.js");
    replaceWithSummary(summary || "History compacted.");
    
    return summary || undefined;
}

// ── Agentic loop ─────────────────────────────────────
export async function runAgentLoop(
    userMessage: string,
    opts?: { forceModel?: string; imageBase64?: string; dialogueId?: number | null },
): Promise<string | { text: string; reasoning?: string }> {
    // Load recent conversation history from SQLite
    const dialogueId = opts?.dialogueId ?? null;
    const history = getRecentHistory(config.maxHistoryTurns, dialogueId);

    // Persist user message immediately (text only, no image data)
    const userId = saveMessage("user", userMessage, undefined, undefined, dialogueId);

    // Task 4: Relevance Filter for SQLite memories
    const relevantCats = getRelevantCategories(userMessage);
    const { listByCategories, buildMemoryContext: formatMemories } = await import("../memory/memories.js");

    // Build memory context: core profile + task-relevant SQLite facts + semantically similar past exchanges
    const [sqliteMemories, semanticRecall] = await Promise.all([
        Promise.resolve(formatMemories(listByCategories(relevantCats, 15))),
        process.env.MISTRAL_API_KEY ? buildSemanticRecall(userMessage, 5) : Promise.resolve(""),
    ]);
    const memoryContext = buildProfileContext() + sqliteMemories + semanticRecall;

    const localTools = getToolSchemas();
    const mcpTools = getMcpToolSchemas();
    const tools = [...localTools, ...mcpTools];
    let iterations = 0;
    let accumulatedVoice = "";

    // Build user message — with optional image attachment for vision
    const userMsgContent: ChatCompletionMessageParam = opts?.imageBase64
        ? {
            role: "user",
            content: [
                { type: "text", text: userMessage },
                { type: "image_url", image_url: { url: opts.imageBase64 } },
            ] as any,
        }
        : { role: "user", content: userMessage };

    const messages: ChatCompletionMessageParam[] = [
        ...history,
        userMsgContent,
    ];

    while (iterations < config.maxAgentIterations) {
        iterations++;
        console.log(`🔄 Agent loop — iteration ${iterations}/${config.maxAgentIterations}`);
        accumulatedVoice = ""; // Reset each iteration to prevent duplicate payloads across turns

        // Context window safety cap — gracefully drop oldest complete tool blocks to prevent token explosion
        const MAX_LOOP_MESSAGES = 60;
        if (messages.length > MAX_LOOP_MESSAGES) {
            let excess = messages.length - MAX_LOOP_MESSAGES;
            // Iterate forwards (skipping early history) to find and drop whole tool-call blocks safely
            for (let i = 5; i < messages.length - 1 && excess > 0; i++) {
                const msg = messages[i];
                if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
                    const blockLength = 1 + msg.tool_calls.length;
                    // Ensure the next N messages are the corresponding tool results
                    const nextMessages = messages.slice(i + 1, i + blockLength);
                    const isCompleteBlock = nextMessages.every(m => m.role === "tool");
                    
                    if (isCompleteBlock) {
                        messages.splice(i, blockLength);
                        excess -= blockLength;
                        i--; // Adjust index since we shifted the array
                        console.log(`📐 Context cap: dropped a tool-call block of size ${blockLength} to save tokens.`);
                    }
                }
            }
        }

        const response = await chat(messages, tools, memoryContext, iterations, opts?.forceModel ?? session.getForcedModel() ?? undefined);
        const { message, reasoning } = response;

        // ── Tool calls ────────────────────────────────
        if (message.tool_calls && message.tool_calls.length > 0) {
            // Persist the assistant message with tool calls
            const assistantMsg: any = {
                role: "assistant",
                content: message.content ?? "",
                tool_calls: message.tool_calls.map((tc: any) => ({
                    id: tc.id,
                    type: "function" as const,
                    function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                    },
                })),
            };
            messages.push(assistantMsg);
            saveMessage("assistant", assistantMsg.content, JSON.stringify(assistantMsg.tool_calls), undefined, dialogueId);

            // Execute tools in parallel
            const toolResults = await Promise.all(
                message.tool_calls.map(async (toolCall) => {
                    const tcAny = toolCall as any;
                    const func = tcAny.function ?? tcAny;
                    const funcName: string = func.name;
                    const argsStr: string = func.arguments ?? "{}";

                    let result = "";
                    try {
                        const args = JSON.parse(argsStr);

                        if (isMcpTool(funcName)) {
                            result = await executeMcpTool(funcName, args);
                        } else {
                            result = await executeTool(funcName, args);
                        }
                    } catch (e: any) {
                        result = `Error executing tool "${funcName}": ${e.message}`;
                        console.error(`❌ Tool execution error [${funcName}]:`, e);
                    }

                    // Extract voice payload if any tool returned it
                    const voiceMatch = result.match(/\[VOICE_PAYLOAD:\s*(<voice>[\s\S]*?<\/voice>)\s*\]/);
                    if (voiceMatch) {
                        accumulatedVoice += `\n${voiceMatch[1]}`;
                        result = result.replace(voiceMatch[0], "").trim();
                    }

                    // Task 3: Token Optimization — Truncate tool results to 4000 chars
                    const LIMIT = 4000;
                    let finalResult: string;
                    if (result.length > LIMIT) {
                        const isJson = result.trimStart().startsWith("[") || result.trimStart().startsWith("{");
                        finalResult = result.slice(0, LIMIT) + (isJson
                            ? "\n... [JSON truncated — ask for fewer results]"
                            : "\n... [Output truncated]");
                    } else {
                        finalResult = result;
                    }

                    return {
                        role: "tool" as const,
                        tool_call_id: toolCall.id,
                        content: finalResult,
                        name: funcName,
                    };
                })
            );

            // Add all results to history and persist them
            for (const res of toolResults) {
                messages.push(res as any);
                saveMessage("tool", res.content, undefined, res.tool_call_id, dialogueId);
            }

            continue;
        }

        // ── Final response ────────────────────────────
        const assistantText = message.content ?? "(No response)";
        let finalResponse = assistantText;
        if (accumulatedVoice) finalResponse += accumulatedVoice;

        // Persist the final text response to SQLite history
        const assistantId = saveMessage("assistant", assistantText, undefined, undefined, dialogueId);

        // ── Background Ops ─────────────────────────────
        upsertConversation(userId, "user", userMessage).catch((e) => console.warn("⚠️ Background op failed [User Upsert]:", e instanceof Error ? e.message : String(e)));
        upsertConversation(assistantId, "assistant", assistantText).catch((e) => console.warn("⚠️ Background op failed [Assistant Upsert]:", e instanceof Error ? e.message : String(e)));
        
        // Fix #7: Only run expensive fact extraction if the message might contain personal info
        const textLower = userMessage.toLowerCase();
        const seemsPersonal = textLower.match(/\b(i|my|me|mine|we|our|love|hate|prefer|want|need)\b/) || userMessage.length > 60;
        if (seemsPersonal) {
            extractAndSaveFacts(userMessage, assistantText).catch((e) => console.warn("⚠️ Background op failed [Fact Extraction]:", e instanceof Error ? e.message : String(e)));
        }
        
        handleLongTermSummary().catch((e) => console.warn("⚠️ Background op failed [Long-Term Summary]:", e instanceof Error ? e.message : String(e))); // Task 5

        // Track interaction for soul learning
        const { recordInteraction } = await import("./soul-learner.js");
        recordInteraction().catch((e) => console.warn("⚠️ Background op failed [Soul Learning]:", e instanceof Error ? e.message : String(e)));

        if (reasoning) return { text: finalResponse, reasoning };
        return finalResponse;
    }

    // Safety limit reached
    console.warn(`⚠️ Agent loop hit max iterations (${config.maxAgentIterations})`);
    return "⚠️ I hit my iteration limit while processing your request. Please try rephrasing or breaking your request into smaller parts.";
}
