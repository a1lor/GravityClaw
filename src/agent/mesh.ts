import { chat } from "../llm/llm.js";
import { runAgentLoop } from "./agent.js";
import { bot } from "../telegram/bot-instance.js";
import { extractAndSaveFacts } from "./fact-extractor.js";

interface Subtask {
    id: number;
    description: string;
}

/**
 * Runs a mesh workflow by breaking a high-level goal into subtasks
 * and sequentially feeding them to the standard agentic loop.
 */
export async function runMeshWorkflow(chatId: number, goal: string): Promise<void> {
    await bot.api.sendMessage(chatId, `🕸️ **Mesh Workflow Started**\nGoal: _${goal}_\n\nAnalyzing...`, { parse_mode: "Markdown" });

    // Step 1: Decomposition
    const decomposePrompt = `You are a strategic planner. The user has provided a high-level goal.
Break this goal down into a sequence of 3 to 5 actionable subtasks that an AI agent could execute one by one.
Make them concrete, starting with an action verb.

Goal: ${goal}

Return ONLY a JSON array in the exact following structure:
{
  "subtasks": [
    { "id": 1, "description": "Search for news articles about X" },
    { "id": 2, "description": "Summarize the findings and query the graph" },
    { "id": 3, "description": "Send a final written report" }
  ]
}`;

    let plan: Subtask[] = [];
    try {
        const { message } = await chat([{ role: "user", content: decomposePrompt }]);
        const responseJsonStr = message.content?.trim() || "";
        
        // Remove markdown code fences if they exist
        const cleaned = responseJsonStr
            .replace(/```(?:json)?/gi, "")
            .replace(/```/g, "")
            .trim();
            
        // Find the first { and last } to isolate the JSON object
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        
        if (start === -1 || end === -1) {
            throw new Error("No JSON object found in response");
        }
        
        const jsonOnly = cleaned.substring(start, end + 1);
        const result = JSON.parse(jsonOnly);
        
        if (result.subtasks && Array.isArray(result.subtasks)) {
            plan = result.subtasks;
        } else {
            throw new Error("Invalid output format: 'subtasks' array not found");
        }
    } catch (e: any) {
        await bot.api.sendMessage(chatId, `❌ **Mesh Initialization Failed**: Failed to parse subtasks.\n${e.message}`, { parse_mode: "Markdown" });
        return;
    }

    if (plan.length === 0) {
        await bot.api.sendMessage(chatId, "⚠️ Could not derive actionable subtasks from the goal.");
        return;
    }

    const planText = plan.map(p => `${p.id}. ${p.description}`).join("\n");
    await bot.api.sendMessage(chatId, `📋 **Execution Plan**:\n${planText}\n\nExecuting sequentially...`, { parse_mode: "Markdown" });

    // Step 2: Sequential Execution
    for (const task of plan) {
        await bot.api.sendMessage(chatId, `⏳ **Running Subtask ${task.id}**: ${task.description}`, { parse_mode: "Markdown" });
        
        try {
            // Treat each subtask as a fresh prompt to the agent, providing the overarching context
            const subtaskPrompt = `MESH CONTEXT: We are executing a multi-step workflow.
Overall Goal: ${goal}
Current Subtask (${task.id}/${plan.length}): ${task.description}

Please execute this specific subtask now using any necessary tools.`;

            const _res = await runAgentLoop(subtaskPrompt);
            const subtaskResult = typeof _res === "string" ? _res : _res.text;
            
            // Because runAgentLoop might be very long or have embedded tools, we send a success ping.
            await bot.api.sendMessage(chatId, `✅ **Completed Subtask ${task.id}**:\n\n${subtaskResult.slice(0, 1500)}${subtaskResult.length > 1500 ? "..." : ""}`, { parse_mode: "Markdown" });
            
            // Extract facts in background per subtask
            extractAndSaveFacts(subtaskPrompt, subtaskResult).catch(() => {});
        } catch (e: any) {
            await bot.api.sendMessage(chatId, `❌ **Subtask ${task.id} Failed**: ${e.message}\n\nAborting Mesh Workflow.`, { parse_mode: "Markdown" });
            return;
        }
    }

    await bot.api.sendMessage(chatId, `🏁 **Mesh Workflow Completed**\nGoal: _${goal}_`, { parse_mode: "Markdown" });
}
