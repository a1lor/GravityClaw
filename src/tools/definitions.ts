import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import {
    searchMemories,
    listMemories,
    deleteMemory,
} from "../memory/memories.js";
import { executeShellCommand } from "./shell.js";
import { config } from "../config.js";
import { db } from "../memory/db.js";


// Fetch with timeout to prevent tools from hanging indefinitely
function fetchTimeout(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const ms = opts.timeout ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── Tool handler type ────────────────────────────────
export type ToolHandler = (input: Record<string, unknown>) => Promise<string>;

// ── Tool registry ────────────────────────────────────
const toolHandlers = new Map<string, ToolHandler>();
const toolSchemas: ChatCompletionTool[] = [];

function registerTool(
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    handler: ToolHandler,
): void {
    toolSchemas.push({ type: "function", function: { name, description, parameters } });
    toolHandlers.set(name, handler);
}

export function getToolSchemas(): ChatCompletionTool[] {
    return toolSchemas;
}

export async function executeTool(
    name: string,
    input: Record<string, unknown>,
): Promise<string> {
    const handler = toolHandlers.get(name);
    if (!handler) return `Error: Unknown tool "${name}"`;

    console.log(`🔧 Tool call: ${name}(${JSON.stringify(input)})`);
    try {
        const result = await handler(input);
        console.log(`✅ Tool result: ${result.slice(0, 200)}${result.length > 200 ? "…" : ""}`);
        return result;
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Tool error [${name}]:`, errMsg);
        return `Error executing tool "${name}": ${errMsg}`;
    }
}

// ═══════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════

registerTool(
    "ping",
    "Returns 'pong'. Use to test tool calling.",
    { type: "object", properties: {}, required: [] },
    async () => "pong 🏓",
);

registerTool(
    "get_dashboard_url",
    "Returns the Dashboard URL. Call this whenever the user asks for the dashboard, analytics, or statistics page.",
    { type: "object", properties: {}, required: [] },
    async () => {
        const { getDashboardUrl } = await import("../dashboard/server.js");
        const url = config.webappUrl || getDashboardUrl();
        return `Dashboard is available at: ${url}`;
    },
);

const speakSchema = {
    type: "object",
    properties: { text: { type: "string", description: "The text to speak" } },
    required: ["text"],
};
const speakHandler: ToolHandler = async (input) => {
    const text = String(input.text ?? input.content ?? "");
    if (!text) return "Error: text is required.";
    return `[VOICE_PAYLOAD: <voice>${text}</voice>] ✅ Voice message queued. It will be sent after you finish responding.`;
};

registerTool(
    "speak",
    "Sends a voice message to the user via ElevenLabs.",
    speakSchema,
    speakHandler,
);

// ═══════════════════════════════════════════════════════
// Gmail / Jobs
// ═══════════════════════════════════════════════════════

registerTool(
    "check_emails",
    "Check Gmail for recent job-related emails (last 24h).",
    { type: "object", properties: {}, required: [] },
    async () => {
        const { checkJobEmails, isGmailReady } = await import("./gmail/checker.js");
        if (!isGmailReady()) return "Error: Gmail is not connected. User must run /gmail_setup first.";
        const emails = await checkJobEmails();
        if (emails.length === 0) return "No new job-related emails found in the last 24h.";
        return `Found ${emails.length} emails. They have been saved and will appear in the dashboard.`;
    },
);

registerTool(
    "send_email",
    "Send an email on the user's behalf via Gmail. Use ONLY for simple replies or when the user provides the EXACT text. For professional drafting, use 'compose_email' instead.",
    {
        type: "object",
        properties: {
            to: { type: "string", description: "Recipient email address" },
            subject: { type: "string", description: "Email subject line" },
            body: { type: "string", description: "Plain text email body" },
        },
        required: ["to", "subject", "body"],
    },
    async (input) => {
        const { sendEmail } = await import("./gmail/sender.js");
        const { isGmailReady } = await import("./gmail/checker.js");
        if (!isGmailReady()) return "Error: Gmail is not connected. Run /gmail_setup first.";
        const id = await sendEmail(String(input.to), String(input.subject), String(input.body));
        return `✅ Email sent to ${input.to} (message ID: ${id})`;
    },
);


// ════════════════════════════════════════════════════
// SECTION: Email & Communication Tools
// ════════════════════════════════════════════════════

registerTool(
    "compose_email",
    "Develop and draft a professional email based on an intent. Automatically picks a professional subject and structure. Shows a preview to the user for approval before sending. Use this for ANY new professional email or when the user's intent is vague.",
    {
        type: "object",
        properties: {
            to: { type: "string", description: "Recipient email address" },
            intent: { type: "string", description: "The core message or goal (e.g., 'Ask for coffee', 'Follow up on my application')" },
            context: { type: "string", description: "Additional context like previous email content or specific facts to include" },
            attach_cv: {
                type: "string",
                description: "CV to attach: 'alternance_fr', 'alternance_en', 'stage_fr', 'stage_en', or 'none'",
                enum: ["alternance_fr", "alternance_en", "stage_fr", "stage_en", "none"],
                default: "none"
            },
        },
        required: ["to", "intent"],
    },
    async (input) => {
        const { chat } = await import("../llm/llm.js");
        const { getProfileValue } = await import("../memory/profile.js");
        const { session } = await import("../agent/session.js");
        const { requestEmailConfirmation } = await import("../telegram/confirmation.js");
        const { sendEmail } = await import("./gmail/sender.js");

        const chatId = session.getChatId();
        if (!chatId) return "Error: No active chat session found. I can only compose emails during an active conversation.";

        const name = getProfileValue("name") || "David Litvak";
        const signature = getProfileValue("signature");

        const prompt = `You are a professional career coach. Draft a high-quality, professional email for ${name}.
        
INTENT: ${input.intent}
CONTEXT: ${input.context || "None"}

GOLDEN TEMPLATE (Follow this tone, structure, and technical background):
"""
Bonjour [Nom],

Actuellement en troisième année à Aivancity School for Technology, Business & Society, je recherche une alternance en IA et Data Science pour la rentrée 2026, avec un rythme 3 sem. entreprise / 1 sem. école. Passionné par l'automatisation et les LLMs, je suis disponible pour un stage dès juin 2026 ou pour une alternance dès septembre 2026.

[Custom Tailored Paragraph based on Intent/Company].

Lors de mes missions chez OKO France et du projet Beparentalis en AI Clinic, j'ai travaillé sur l'analyse de données, l'optimisation de flux et de bases SQL, la mise en place d'architectures RAG et le fine-tuning de modèles. J'ai également conduit des projets de prototypage LLM avec HuggingFace et développé des scripts d'automatisation en Python.

Je peux contribuer concrètement à vos projets de Data Product, au prototypage de solutions IA, et à l'amélioration des pipelines de données. Le coût de cette alternance serait réduit pour votre société grâce au plan d'aide à l'apprentissage (aide de 5000€).

Vous trouverez mon CV en pièce jointe. Si vous le souhaitez, je suis disponible pour un échange de 20 minutes afin de discuter de vos besoins.
"""

RULES:
1. Generate a professional "subject" and a "body".
2. Use "Vouvoiement" (formal you) for French emails.
3. Tone: Ambitious, professional, and results-oriented.
4. Adapt the template to the specific INTENT while keeping the Aivancity background and technical highlights (OKO France, Beparentalis, RAG, SQL).
5. Match the language of the user's intent (French/English).
6. Return ONLY a JSON object with keys "subject" and "body". No markdown fences.`;

        const { message } = await chat([{ role: "user", content: prompt }]);
        const raw = message.content || "";
        
        let draft: { subject: string; body: string };
        try {
            const start = raw.indexOf("{");
            const end = raw.lastIndexOf("}");
            draft = JSON.parse(raw.substring(start, end + 1));
        } catch {
            return `Error: Failed to generate draft from AI response. Please try being more specific about your intent. AI said: ${raw}`;
        }

        // Append signature if it exists
        if (signature) {
            draft.body = draft.body.trim() + "\n\n" + signature.trim();
        }

        // Handle CV attachment
        let cvPath: string | undefined;
        if (input.attach_cv && String(input.attach_cv) !== "none") {
            const { existsSync } = await import("fs");
            const [jobType, language] = String(input.attach_cv).split("_") as [any, any];
            const { getCV } = await import("./cv-manager.js");
            const cv = getCV(jobType, language);
            if (cv && existsSync(cv.file_path)) {
                cvPath = cv.file_path;
            } else {
                console.warn(`⚠️ CV not found for ${input.attach_cv}, continuing without attachment`);
            }
        }

        console.log(`📨 Requesting confirmation for email to ${input.to}`);
        const approved = await requestEmailConfirmation(chatId, String(input.to), draft.subject, draft.body);

        if (!approved) return "❌ Email cancelled by user.";

        const id = await sendEmail(String(input.to), draft.subject, draft.body, undefined, cvPath);
        return `✅ Email sent successfully to ${input.to}${cvPath ? " (CV attached)" : ""} (ID: ${id})`;
    }
);

registerTool(
    "sync_gmail",
    "Perform a deep scan of Gmail for job applications over the last X days.",
    {
        type: "object",
        properties: {
            days: { type: "number", description: "Number of days to look back (default 7, max 30)" },
        },
        required: [],
    },
    async (input) => {
        const { scanJobEmails, isGmailReady } = await import("./gmail/checker.js");
        if (!isGmailReady()) return "Error: Gmail is not connected.";
        const days = Math.min(Number(input.days) || 7, 30);
        const emails = await scanJobEmails(days);
        return `✅ Deep scan complete. Processed ${emails.length} emails from the last ${days} days.`;
    },
);

// ═══════════════════════════════════════════════════════
// Memory — SQLite long-term facts
// ═══════════════════════════════════════════════════════

registerTool(
    "save_memory",
    "Save a fact, preference, or piece of information to persistent memory. Similarity check is performed automatically.",
    {
        type: "object",
        properties: {
            content: { type: "string", description: "The information to remember" },
            category: {
                type: "string",
                description: "Category for organization (e.g., tech_stack, logistics, preferences, bio, contact)"
            },
            tags: { type: "string", description: "Optional comma-separated tags" },
        },
        required: ["content", "category"],
    },
    async (input) => {
        const content = String(input.content ?? "").trim();
        const category = String(input.category ?? "general").trim();
        if (!content) return "Error: content is required";

        const { findSimilarMemory, upsertMemory } = await import("../memory/vector.js");
        const { updateMemory, saveMemory } = await import("../memory/memories.js");

        const similar = await findSimilarMemory(content, 0.88);
        if (similar) {
            updateMemory(similar.id, content, category, String(input.tags ?? "").trim());
            await upsertMemory(similar.id, content, String(input.tags ?? "").trim());
            return `✅ Updated similar memory (id: ${similar.id})`;
        }

        const id = saveMemory(content, category, String(input.tags ?? "").trim());
        await upsertMemory(id, content, String(input.tags ?? "").trim());
        return `✅ Memory saved (id: ${id})`;
    },
);

registerTool(
    "update_application_status",
    "Update the status of a job application (e.g., Rejection, Interview, Offer).",
    {
        type: "object",
        properties: {
            company: { type: "string", description: "Company name" },
            position: { type: "string", description: "Job title / position" },
            status: { type: "string", description: "New status (e.g., 'Rejected', 'Interview', 'Offer')" },
            outcome: { type: "string", description: "Optional details or snippet from email" },
        },
        required: ["company", "position", "status"],
    },
    async (input) => {
        const { updateApplicationStatus } = await import("./jobs/applications.js");
        updateApplicationStatus(
            String(input.company),
            String(input.position),
            String(input.status),
            String(input.outcome ?? "")
        );
        return `✅ Application status updated for ${input.company}.`;
    },
);


// ════════════════════════════════════════════════════
// SECTION: Job Application & Outreach Tools
// ════════════════════════════════════════════════════

registerTool(
    "generate_french_outreach",
    "Generate a professional personalized French LinkedIn outreach message for a job.",
    {
        type: "object",
        properties: {
            job_description: { type: "string", description: "The full job description or title/company context" },
        },
        required: ["job_description"],
    },
    async (input) => {
        const { getProfileValue } = await import("../memory/profile.js");
        const { chat } = await import("../llm/llm.js");

        const name = getProfileValue("name") || "the candidate";
        const education = getProfileValue("education") || "Student";
        // cv_skills is populated by the CV analyzer (cv-analyzer.ts); tech_stack is a user-set fallback
        const techStack = getProfileValue("cv_skills") || getProfileValue("tech_stack") || "Not specified";
        const projects = getProfileValue("projects") || "Not specified";
        const availability = getProfileValue("availability") || "To be confirmed";

        const prompt = `You are a professional career coach. Generate a 3-paragraph French LinkedIn outreach message for ${name}.
        
USER PROFILE:
- Name: ${name}
- Education: ${education}
- Key Projects: ${projects}
- Tech Stack: ${techStack}
- Availability: ${availability}

JOB CONTEXT:
${input.job_description}

RULES:
1. Always use "Vouvoiement" (formal you).
2. Paragraph 1: Mention interest in the specific position/company.
3. Paragraph 2: MUST mention specific experience or projects relevant to the job based on the profile.
4. Paragraph 3: Mention availability (${availability}).
5. Language: French. Tone: Professional, enthusiastic but humble.
6. RETURN ONLY THE MESSAGE TEXT.`;

        const { message } = await chat([{ role: "user", content: prompt }]);
        return message.content ?? "Error: Failed to generate outreach message.";
    },
);

registerTool(
    "prepare_interview",
    "Generate likely interview questions and model answers for a specific job. Triggered when the user says 'prep me for my interview at X' or 'prepare interview questions'.",
    {
        type: "object",
        properties: {
            job_title: { type: "string", description: "The job title" },
            company: { type: "string", description: "The company name" },
            job_description: { type: "string", description: "The job description or key requirements (optional but improves quality)" },
        },
        required: ["job_title", "company"],
    },
    async (input) => {
        const { getAllProfile, buildProfileContext } = await import("../memory/profile.js");
        const { chat } = await import("../llm/llm.js");

        const profile = getAllProfile();
        const profileCtx = buildProfileContext();
        const name = profile["name"] || "the candidate";

        const jd = input.job_description ? `\nJOB DESCRIPTION:\n${input.job_description}` : "";

        const prompt =
            `You are a senior technical interviewer at ${input.company}. You are preparing 8-10 likely interview questions for ${name} applying to the role of ${input.job_title}.\n\n` +
            `CANDIDATE PROFILE:\n${profileCtx}${jd}\n\n` +
            `INSTRUCTIONS:\n` +
            `1. Generate 8-10 realistic interview questions likely to be asked for this specific role and company.\n` +
            `2. Mix: 3-4 behavioral (STAR format), 3-4 technical, 1-2 culture/fit questions.\n` +
            `3. For each question, provide a strong model answer tailored to the candidate's actual profile.\n` +
            `4. Format each as:\n` +
            `Q: [question]\n` +
            `A: [model answer drawing from the candidate's experience]\n\n` +
            `5. Keep each answer concise (2-4 sentences). Be specific — reference the candidate's actual projects and skills.\n` +
            `6. RETURN ONLY the Q&A list, no preamble.`;

        const { message } = await chat([{ role: "user", content: prompt }]);
        return message.content ?? "Error: Failed to generate interview prep.";
    },
);

registerTool(
    "generate_cover_letter",
    "Generate a tailored cover letter for a specific job. Triggered when the user asks to write a cover letter.",
    {
        type: "object",
        properties: {
            job_title: { type: "string", description: "The job title" },
            company: { type: "string", description: "The company name" },
            job_description: { type: "string", description: "The full job description or key requirements" },
        },
        required: ["job_title", "company", "job_description"],
    },
    async (input) => {
        const { getAllProfile, buildProfileContext } = await import("../memory/profile.js");
        const { chat } = await import("../llm/llm.js");

        const profile = getAllProfile();
        const profileCtx = buildProfileContext();
        const name = profile["name"] || "the candidate";

        const prompt =
            `You are a professional career coach. Write a concise, compelling cover letter for ${name} applying to the role of ${input.job_title} at ${input.company}.\n\n` +
            `CANDIDATE PROFILE:\n${profileCtx}\n\n` +
            `JOB DESCRIPTION:\n${input.job_description}\n\n` +
            `INSTRUCTIONS:\n` +
            `1. Address it formally (no specific recipient name unless given).\n` +
            `2. Paragraph 1: Express genuine interest in the role and company.\n` +
            `3. Paragraph 2: Highlight 2-3 specific experiences/projects from the profile most relevant to this job.\n` +
            `4. Paragraph 3: Brief closing — express enthusiasm and availability.\n` +
            `5. Keep it under 300 words. Professional tone.\n` +
            `6. RETURN ONLY THE COVER LETTER TEXT.`;

        const { message } = await chat([{ role: "user", content: prompt }]);
        return message.content ?? "Error: Failed to generate cover letter.";
    },
);


// ════════════════════════════════════════════════════
// SECTION: Memory Tools
// ════════════════════════════════════════════════════

registerTool(
    "search_memories",
    "Search stored memories by keyword.",
    {
        type: "object",
        properties: {
            query: { type: "string", description: "Search term" },
            limit: { type: "number", description: "Max results (default 10)" },
        },
        required: ["query"],
    },
    async (input) => {
        const query = String(input.query ?? "").trim();
        if (!query) return "Error: query is required";
        const results = searchMemories(query, Number(input.limit) || 10);
        if (results.length === 0) return "No memories found.";
        return results.map((m) => `#${m.id}${m.tags ? ` [${m.tags}]` : ""}: ${m.content}`).join("\n");
    },
);

registerTool(
    "list_memories",
    "List recently accessed memories.",
    {
        type: "object",
        properties: { limit: { type: "number", description: "Max entries (default 20)" } },
        required: [],
    },
    async (input) => {
        const memories = listMemories(Number(input.limit) || 20);
        if (memories.length === 0) return "No memories stored yet.";
        return memories.map((m) => `#${m.id}${m.tags ? ` [${m.tags}]` : ""}: ${m.content}`).join("\n");
    },
);

registerTool(
    "delete_memory",
    "Delete a memory by its numeric ID.",
    {
        type: "object",
        properties: { id: { type: "number", description: "Memory ID to delete" } },
        required: ["id"],
    },
    async (input) => {
        const id = Number(input.id);
        if (!id) return "Error: valid numeric id is required";
        return deleteMemory(id) ? `✅ Memory #${id} deleted.` : `Memory #${id} not found.`;
    },
);

// ═══════════════════════════════════════════════════════
// Knowledge Graph Memory
// ═══════════════════════════════════════════════════════

registerTool(
    "add_knowledge_graph_relation",
    "Add a relation to the Knowledge Graph between two entities. Use this to permanently store structural facts.",
    {
        type: "object",
        properties: {
            sourceEntity: { type: "string", description: "Source entity (e.g. 'David')" },
            sourceType: { type: "string", description: "Type of source (e.g. 'Person', 'Company')" },
            targetEntity: { type: "string", description: "Target entity (e.g. 'GravityClaw')" },
            targetType: { type: "string", description: "Type of target (e.g. 'Project', 'Technology')" },
            relation: { type: "string", description: "Relationship (e.g. 'CREATED', 'WORKS_AT')" }
        },
        required: ["sourceEntity", "sourceType", "targetEntity", "targetType", "relation"],
    },
    async (input) => {
        const { addKnowledgeGraphRelation } = await import("../memory/graph.js");
        const ok = addKnowledgeGraphRelation(
            String(input.sourceEntity), String(input.sourceType),
            String(input.targetEntity), String(input.targetType),
            String(input.relation)
        );
        return ok ? `✅ Relation added.` : `Error: Missing required fields.`;
    },
);

registerTool(
    "query_knowledge_graph",
    "Query the Knowledge Graph to find relations for a specific entity.",
    {
        type: "object",
        properties: { entity: { type: "string", description: "Entity to look up (e.g. 'David')" } },
        required: ["entity"],
    },
    async (input) => {
        const { queryKnowledgeGraph } = await import("../memory/graph.js");
        return queryKnowledgeGraph(String(input.entity));
    },
);

// ═══════════════════════════════════════════════════════
// Encrypted Secrets
// ═══════════════════════════════════════════════════════


// ════════════════════════════════════════════════════
// SECTION: Security Tools
// ════════════════════════════════════════════════════

registerTool(
    "save_encrypted_secret",
    "Encrypt and store a highly sensitive secret (like an API key, password, or token) securely using AES-256-GCM.",
    {
        type: "object",
        properties: {
            key_name: { type: "string", description: "The identifier for this secret (e.g. 'github_token')" },
            secret_value: { type: "string", description: "The plaintext secret to encrypt and store" }
        },
        required: ["key_name", "secret_value"],
    },
    async (input) => {
        const { encryptSecret } = await import("../security/encryption.js");
        const { db } = await import("../memory/db.js");
        const keyName = String(input.key_name).trim().toLowerCase();
        
        try {
            const encrypted = encryptSecret(String(input.secret_value));
            db.prepare(`
                INSERT INTO secure_secrets (key_name, iv, auth_tag, encrypted_data) 
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key_name) DO UPDATE SET 
                    iv = excluded.iv,
                    auth_tag = excluded.auth_tag,
                    encrypted_data = excluded.encrypted_data,
                    updated_at = datetime('now')
            `).run(keyName, encrypted.iv, encrypted.authTag, encrypted.encryptedData);
            return `✅ Secret '${keyName}' encrypted and stored securely.`;
        } catch (e: any) {
            return `Error encrypting secret: ${e.message}`;
        }
    },
);

/**
 * Internal helper — retrieve and decrypt a secret for use by OTHER tools.
 * NEVER use this where the result would flow back into the LLM as a string.
 */
export async function getSecret(keyName: string): Promise<string | null> {
    const { decryptSecret } = await import("../security/encryption.js");
    const { db } = await import("../memory/db.js");
    const name = keyName.trim().toLowerCase();
    const row = db.prepare(`SELECT iv, auth_tag, encrypted_data FROM secure_secrets WHERE key_name = ?`).get(name) as any;
    if (!row) return null;
    return decryptSecret({ iv: row.iv, authTag: row.auth_tag, encryptedData: row.encrypted_data });
}

registerTool(
    "get_decrypted_secret",
    // SECURITY: This tool only confirms existence of a secret. It NEVER returns the plaintext.
    // Use it to verify a secret is stored. To use the secret in an API call, call getSecret() internally.
    "Check whether a named secret exists in the encrypted vault. Returns existence confirmation only — the plaintext is NEVER exposed to you.",
    {
        type: "object",
        properties: { key_name: { type: "string", description: "The identifier to check" } },
        required: ["key_name"],
    },
    async (input) => {
        const { db } = await import("../memory/db.js");
        const keyName = String(input.key_name).trim().toLowerCase();
        const row = db.prepare(`SELECT updated_at FROM secure_secrets WHERE key_name = ?`).get(keyName) as any;
        if (!row) return `Secret '${keyName}' not found in the vault.`;
        return `✅ Secret '${keyName}' exists in the vault (last updated: ${row.updated_at}). The plaintext is not shown for security reasons — it is used internally by other tools only.`;
    },
);

// ═══════════════════════════════════════════════════════
// Location, Weather & Time
// ═══════════════════════════════════════════════════════


// ════════════════════════════════════════════════════
// SECTION: Utility Tools (Weather, Time, etc.)
// ════════════════════════════════════════════════════

registerTool(
    "get_weather",
    "Get the current weather and short forecast for any city.",
    {
        type: "object",
        properties: { city: { type: "string", description: "City name (e.g. 'Paris', 'Tokyo')" } },
        required: ["city"],
    },
    async (input) => {
        try {
            const city = encodeURIComponent(String(input.city));
            // format=j1 returns rich JSON from wttr.in
            const res = await fetchTimeout(`https://wttr.in/${city}?format=j1`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: any = await res.json();
            
            const current = data.current_condition[0];
            const area = data.nearest_area[0];
            const location = `${area.areaName[0].value}, ${area.country[0].value}`;
            const temp = `${current.temp_C}°C (${current.temp_F}°F)`;
            const condition = current.weatherDesc[0].value;
            const wind = `${current.windspeedKmph} km/h`;
            const humidity = `${current.humidity}%`;
            
            return `Weather in ${location}:\nCondition: ${condition}\nTemp: ${temp}\nWind: ${wind}\nHumidity: ${humidity}`;
        } catch (e: any) {
            return `Failed to fetch weather for ${input.city}: ${e.message}`;
        }
    },
);

registerTool(
    "get_local_time",
    "Get the current precise local time in a specific timezone or city.",
    {
        type: "object",
        properties: { timezone: { type: "string", description: "City or Timezone (e.g. 'Europe/Paris', 'Tokyo', 'New York')" } },
        required: ["timezone"],
    },
    async (input) => {
        const tz = String(input.timezone);
        try {
            // We use the free worldtimeapi.org. It expects Continent/City format primarily.
            // But we can also just use the built-in Intl.DateTimeFormat if it recognizes the string
            const formatter = new Intl.DateTimeFormat('fr-FR', {
                timeZone: tz,
                dateStyle: 'full',
                timeStyle: 'short',
                hour12: false
            });
            return `The current time in ${tz} is: ${formatter.format(new Date())}`;
        } catch (e: any) {
            // Fallback to worldtime API if JS native timezone parsing fails (e.g. they passed just 'Paris')
            try {
                const res = await fetchTimeout(`http://worldtimeapi.org/api/timezone/Europe/${tz}`);
                if (!res.ok) throw new Error();
                const data: any = await res.json();
                
                // Format the string returned by fallback into 24-hour French locale
                const dateObj = new Date(data.datetime);
                const formatterFallback = new Intl.DateTimeFormat('fr-FR', {
                    dateStyle: 'full',
                    timeStyle: 'short',
                    hour12: false
                });
                return `The current time in ${tz} is: ${formatterFallback.format(dateObj)}`;
            } catch {
                return `Failed to get time for ${tz}. Make sure to pass a valid IANA timezone like 'Europe/Paris' or 'America/New_York'.`;
            }
        }
    },
);

// ═══════════════════════════════════════════════════════
// Self-Evolution & Core Directives (soul.md)
// ═══════════════════════════════════════════════════════

registerTool(
    "read_soul_document",
    "Read the current contents of your core directives and identity file (soul.md).",
    { type: "object", properties: {}, required: [] },
    async () => {
        try {
            const { readFileSync } = await import("fs");
            const { join } = await import("path");
            const soulPath = join(process.cwd(), "data", "soul.md");
            return readFileSync(soulPath, "utf-8");
        } catch (e: any) {
            return `Error reading soul.md: ${e.message}`;
        }
    },
);

registerTool(
    "update_soul_document",
    "Completely overwrite your core directives and identity file (soul.md). Use this when you learn a fundamental new rule about how you should behave or interact with the user, or when the user explicitly asks you to change your core behavior permanently.",
    {
        type: "object",
        properties: { content: { type: "string", description: "The new complete markdown content for your soul.md file. Retain existing important rules unless explicitly removing them." } },
        required: ["content"],
    },
    async (input) => {
        try {
            const { writeFileSync } = await import("fs");
            const { join } = await import("path");
            const soulPath = join(process.cwd(), "data", "soul.md");
            writeFileSync(soulPath, String(input.content), "utf-8");
            return `✅ "soul.md" successfully updated. The new rules will take effect on your very next message.`;
        } catch (e: any) {
            return `Error updating soul.md: ${e.message}`;
        }
    },
);

// ═══════════════════════════════════════════════════════
// CRM — Job pipeline management
// ═══════════════════════════════════════════════════════

registerTool(
    "list_pipeline",
    "Show the job application pipeline summary — counts of jobs by stage (new, applied, interview, offer, rejected).",
    { type: "object", properties: {}, required: [] },
    async () => {
        const { getPipelineSummaryText } = await import("./jobs/crm.js");
        return getPipelineSummaryText();
    },
);

registerTool(
    "update_job_status",
    "Manually update the pipeline status of a job posting by its ID.",
    {
        type: "object",
        properties: {
            job_id: { type: "string", description: "The job ID (e.g. 'wttj:abc123')" },
            status: {
                type: "string",
                description: "New status: 'new' | 'saved' | 'applied' | 'interview' | 'offer' | 'rejected'",
            },
        },
        required: ["job_id", "status"],
    },
    async (input) => {
        const { updatePipelineStatus } = await import("./jobs/tracker.js");
        const validStatuses = ["new", "saved", "applied", "interview", "offer", "rejected"];
        const status = String(input.status ?? "").toLowerCase();
        if (!validStatuses.includes(status)) return `Error: status must be one of: ${validStatuses.join(", ")}`;
        updatePipelineStatus(String(input.job_id), status);
        return `✅ Job ${input.job_id} moved to "${status}".`;
    },
);

registerTool(
    "apply_to_job",
    "Apply to a job posting by URL. Scrapes the job, detects language, generates a cover letter, saves files, and logs to the pipeline. Works with LinkedIn and Welcome to the Jungle URLs.",
    {
        type: "object",
        properties: {
            url: { type: "string", description: "Full URL of the job posting (LinkedIn or WTTJ)" },
        },
        required: ["url"],
    },
    async (input) => {
        const { runApplyWorkflow } = await import("./jobs/apply.js");
        const result = await runApplyWorkflow(String(input.url));
        if (!result.success) return `Error: ${result.error}`;
        return (
            `✅ Application logged!\n\n` +
            `**${result.title}** @ ${result.company}\n` +
            `🌐 Language: ${result.language === "fr" ? "Français" : "English"}\n` +
            `📁 Folder: ${result.folderPath}\n` +
            `📝 Cover letter saved.\n\n` +
            `---\n${result.coverLetter}`
        );
    },
);


// ════════════════════════════════════════════════════
// SECTION: Pipeline & Tracking Tools
// ════════════════════════════════════════════════════

registerTool(
    "get_pipeline_details",
    "Get detailed job pipeline by status — lists job titles, companies, and links grouped by stage.",
    {
        type: "object",
        properties: {
            status: {
                type: "string",
                description: "Filter by status: 'new' | 'saved' | 'applied' | 'interview' | 'offer' | 'rejected'. Omit for all.",
            },
        },
        required: [],
    },
    async (input) => {
        const { getPipelineByStatus, getPipelineSummaryText } = await import("./jobs/crm.js");
        const filterStatus = String(input.status ?? "").trim().toLowerCase();
        const pipeline = getPipelineByStatus();

        if (filterStatus && filterStatus in pipeline) {
            const jobs = pipeline[filterStatus];
            if (jobs.length === 0) return `No jobs in status "${filterStatus}".`;
            return jobs.map((j, i) => `${i + 1}. ${j.title} @ ${j.company} (${j.location})\n   ${j.url}`).join("\n\n");
        }

        const summary = getPipelineSummaryText();
        const details = Object.entries(pipeline)
            .filter(([, jobs]) => jobs.length > 0)
            .map(([status, jobs]) => {
                const label = { new: "🆕 New", saved: "📌 Saved", applied: "✅ Applied", interview: "🤝 Interview", offer: "🎉 Offer", rejected: "❌ Rejected" }[status] ?? status;
                return `${label}:\n${jobs.map((j) => `  • ${j.title} @ ${j.company}`).join("\n")}`;
            })
            .join("\n\n");

        return `${summary}\n\n${details}`;
    },
);

registerTool(
    "rank_job",
    "Rank a job posting on a scale of 1-10 based on how well it matches the user's profile, skills, and preferences. Accepts a URL (LinkedIn or WTTJ) or a raw job description. Call this whenever the user asks to rank, evaluate, score, or assess a job — including /rank commands.",
    {
        type: "object",
        properties: {
            url: { type: "string", description: "URL of the job posting (LinkedIn or WTTJ). Preferred over raw description." },
            job_description: { type: "string", description: "Raw job description text (used only if no URL is provided)" },
            title: { type: "string", description: "Job title (optional, used if no URL)" },
            company: { type: "string", description: "Company name (optional, used if no URL)" },
        },
        required: [],
    },
    async (input) => {
        const { scrapeJobByUrl } = await import("./jobs/apply.js");
        const { buildProfileContext } = await import("../memory/profile.js");
        const { chat, MODEL_BEST } = await import("../llm/llm.js");
        const { session } = await import("../agent/session.js");
        const selectedModel = session.getForcedModel() ?? MODEL_BEST;

        let title = String(input.title ?? "");
        let company = String(input.company ?? "");
        let description = String(input.job_description ?? "");
        let location = "";
        let jobUrl = String(input.url ?? "").trim();

        // Scrape if URL given
        if (jobUrl) {
            try {
                const job = await scrapeJobByUrl(jobUrl);
                title = job.title;
                company = job.company;
                description = job.description;
                location = job.location;
            } catch (e: any) {
                return `❌ Could not scrape the job URL: ${e.message}`;
            }
        }

        if (!description && !title) {
            return "Error: provide either a job URL or a job description.";
        }

        const profileCtx = buildProfileContext();

        const prompt =
            `You are a career advisor. Score this job from 1-10 for the candidate below.\n\n` +
            `CANDIDATE PROFILE:\n${profileCtx}\n\n` +
            `JOB:\n` +
            (title ? `Title: ${title}\n` : "") +
            (company ? `Company: ${company}\n` : "") +
            (location ? `Location: ${location}\n` : "") +
            (description ? `Description:\n${description.slice(0, 3000)}\n` : "") +
            `\nSCORING CRITERIA (score each 1-10, then give an overall):\n` +
            `1. Skills match — do the required skills align with their profile?\n` +
            `2. Career growth — does this role advance their trajectory?\n` +
            `3. Location / format — remote/on-site/hybrid compatibility?\n` +
            `4. Company fit — culture, size, industry alignment?\n` +
            `5. Compensation signals — if visible, does it match expectations?\n\n` +
            `FORMAT (return exactly this line by line, NO tables):\n` +
            `📊 **Overall: X/10**\n\n` +
            `• **Skills match**: X/10 — [Notes]\n` +
            `• **Career growth**: X/10 — [Notes]\n` +
            `• **Location/format**: X/10 — [Notes]\n` +
            `• **Company fit**: X/10 — [Notes]\n` +
            `• **Compensation**: X/10 — [Notes]\n\n` +
            `**Verdict:** 1-2 sentences on whether to apply.\n` +
            `**Top concern:** The one thing to watch out for.\n` +
            `**Tip:** One specific way to strengthen the application if they apply.`;

        const { message } = await chat([{ role: "user", content: prompt }], undefined, "", 1, MODEL_BEST);
        const result = message.content ?? "Error: failed to generate ranking.";

        const header = title
            ? `🏷 **${title}**${company ? ` @ ${company}` : ""}${location ? ` · ${location}` : ""}\n\n`
            : "";
        return header + result;
    },
);

registerTool(
    "add_spontaneous_target",
    "Add a company to the cold outreach list for candidature spontanée emails.",
    {
        type: "object",
        properties: {
            company: { type: "string", description: "Company name" },
            hr_email: { type: "string", description: "HR or contact email address" },
            industry: { type: "string", description: "Industry/sector (optional)" },
        },
        required: ["company", "hr_email"],
    },
    async (input) => {
        const { addTarget } = await import("./jobs/spontanee.js");
        const added = addTarget(String(input.company), String(input.hr_email), String(input.industry ?? ""));
        return added
            ? `✅ Added ${input.company} (${input.hr_email}) to outreach list.`
            : `⚠️ ${input.company} with ${input.hr_email} already in list.`;
    },
);

registerTool(
    "get_spontanee_stats",
    "Show statistics for candidature spontanée outreach — totals, sent, replies, reply rate.",
    { type: "object", properties: {}, required: [] },
    async () => {
        const { getTargetStats } = await import("./jobs/spontanee.js");
        return getTargetStats();
    },
);

// ═══════════════════════════════════════════════════════
// Manual Email Management
// ═══════════════════════════════════════════════════════


// ════════════════════════════════════════════════════
// SECTION: Email Management Tools
// ════════════════════════════════════════════════════

registerTool(
    "email_add",
    "Manually add an email to job tracking. Use when an email wasn't auto-detected.",
    {
        type: "object",
        properties: {
            job_id: { type: "string", description: "Job posting ID (optional, e.g., linkedin:123456)" },
            from_addr: { type: "string", description: "Sender email address" },
            subject: { type: "string", description: "Email subject" },
            snippet: { type: "string", description: "Brief content preview (optional)" },
            status: {
                type: "string",
                description: "Email status",
                enum: ["positive", "neutral", "rejection"]
            },
        },
        required: ["from_addr", "subject", "status"],
    },
    async (input) => {
        const stmt = db.prepare(`
            INSERT INTO job_emails (from_addr, subject, snippet, status, linked_job_id, email_date)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `);
        stmt.run(
            String(input.from_addr),
            String(input.subject),
            String(input.snippet || ""),
            String(input.status),
            input.job_id ? String(input.job_id) : null
        );
        return `✅ Email added to tracking`;
    }
);

registerTool(
    "email_list",
    "List all tracked emails, optionally filtered by job ID.",
    {
        type: "object",
        properties: {
            job_id: { type: "string", description: "Filter by job posting ID (optional)" },
        },
        required: [],
    },
    async (input) => {
        const query = input.job_id
            ? `SELECT * FROM job_emails WHERE linked_job_id = ? ORDER BY email_date DESC`
            : `SELECT * FROM job_emails ORDER BY email_date DESC LIMIT 20`;

        const emails = input.job_id
            ? db.prepare(query).all(String(input.job_id))
            : db.prepare(query).all();

        if ((emails as any[]).length === 0) {
            return input.job_id ? `No emails found for job ${input.job_id}` : "No emails tracked yet";
        }

        return (emails as any[]).map((e, i) =>
            `${i + 1}. **${e.from_addr}**\n` +
            `   Subject: ${e.subject}\n` +
            `   Status: ${e.status}\n` +
            `   Date: ${e.email_date}\n` +
            `   ID: ${e.id}`
        ).join("\n\n");
    }
);

registerTool(
    "email_delete",
    "Delete a tracked email by its ID. Get ID from email_list.",
    {
        type: "object",
        properties: {
            email_id: { type: "number", description: "Email ID from email_list" },
        },
        required: ["email_id"],
    },
    async (input) => {
        const result = db.prepare(`DELETE FROM job_emails WHERE id = ?`).run(Number(input.email_id));
        return result.changes > 0 ? `✅ Email deleted` : `❌ Email not found`;
    }
);

// ═══════════════════════════════════════════════════════
// Google Calendar
// ═══════════════════════════════════════════════════════

registerTool(
    "list_calendar",
    "List upcoming calendar events. Call when the user asks about their schedule, upcoming events, what they have this week, etc. IMPORTANT: Always format the final output to the user as a clean, bulleted list.",
    {
        type: "object",
        properties: {
            days: { type: "number", description: "Number of days to look ahead (default 7, max 30)" },
        },
        required: [],
    },
    async (input) => {
        const { getUpcomingEvents } = await import("./calendar.js");
        const days = Math.min(Number(input.days) || 7, 30);
        return await getUpcomingEvents(days);
    },
);

registerTool(
    "calendar_today",
    "Show today's calendar events AND gym workout. Call when the user asks 'what do I have today', 'today's schedule', etc.",
    { type: "object", properties: {}, required: [] },
    async () => {
        const { getTodayEvents } = await import("./calendar.js");
        const { getTodayWorkout, formatRoutine } = await import("./gym.js");

        const calendarEvents = await getTodayEvents();
        const workout = getTodayWorkout();

        if (!workout) return calendarEvents;

        return `${calendarEvents}\n\n${formatRoutine(workout)}`;
    },
);

registerTool(
    "search_calendar",
    "Search calendar events by keyword. Call when the user asks about a specific event, class, meeting, etc. IMPORTANT: Always format the final output to the user as a clean, bulleted list.",
    {
        type: "object",
        properties: {
            query: { type: "string", description: "Search keyword (e.g. 'class', 'meeting', 'dentist')" },
            days: { type: "number", description: "Days to search ahead (default 30)" },
        },
        required: ["query"],
    },
    async (input) => {
        const { searchEvents } = await import("./calendar.js");
        const days = Math.min(Number(input.days) || 30, 90);
        return await searchEvents(String(input.query), days);
    },
);

// ═══════════════════════════════════════════════════════
// Gym Schedule
// ═══════════════════════════════════════════════════════

registerTool(
    "gym_today",
    "Show today's gym workout routine. Call when the user asks 'what's my workout today', 'gym today', etc.",
    { type: "object", properties: {}, required: [] },
    async () => {
        const { getTodayWorkout, formatRoutine } = await import("./gym.js");
        const workout = getTodayWorkout();
        if (!workout) return "No gym workout scheduled for today.";
        return formatRoutine(workout);
    },
);

registerTool(
    "gym_view_schedule",
    "View the entire weekly gym schedule.",
    { type: "object", properties: {}, required: [] },
    async () => {
        const { formatAllRoutines } = await import("./gym.js");
        return formatAllRoutines();
    },
);


// ════════════════════════════════════════════════════
// SECTION: Gym Tracker Tools
// ════════════════════════════════════════════════════

registerTool(
    "gym_set_routine",
    "Set or update a gym routine for a specific day. Call this when the user says they changed their routine, want to add a workout, etc.",
    {
        type: "object",
        properties: {
            day: {
                type: "string",
                description: "Day of week: 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'",
                enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            },
            workout_name: { type: "string", description: "Name of the workout (e.g. 'Upper Body', 'Leg Day')" },
            exercises: {
                type: "string",
                description: "JSON array of exercises with format: [{\"name\": \"Bench Press\", \"sets\": 3, \"reps\": \"8-10\", \"notes\": \"optional notes\"}]"
            }
        },
        required: ["day", "workout_name", "exercises"]
    },
    async (input) => {
        const { setRoutineForDay } = await import("./gym.js");
        const dayMap: Record<string, number> = {
            sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
            thursday: 4, friday: 5, saturday: 6
        };
        const dayOfWeek = dayMap[String(input.day).toLowerCase()];
        if (dayOfWeek === undefined) return "Invalid day of week";

        const exercises = JSON.parse(String(input.exercises));
        setRoutineForDay(dayOfWeek, String(input.workout_name), exercises);
        return `✅ Gym routine for ${input.day} updated: ${input.workout_name}`;
    },
);

registerTool(
    "gym_delete_routine",
    "Delete a gym routine for a specific day.",
    {
        type: "object",
        properties: {
            day: {
                type: "string",
                description: "Day of week to delete",
                enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            }
        },
        required: ["day"]
    },
    async (input) => {
        const { deleteRoutineForDay } = await import("./gym.js");
        const dayMap: Record<string, number> = {
            sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
            thursday: 4, friday: 5, saturday: 6
        };
        const dayOfWeek = dayMap[String(input.day).toLowerCase()];
        if (dayOfWeek === undefined) return "Invalid day of week";

        const success = deleteRoutineForDay(dayOfWeek);
        return success ? `✅ Deleted gym routine for ${input.day}` : `⚠️ No routine found for ${input.day}`;
    },
);

// ═══════════════════════════════════════════════════════
// News & RSS
// ═══════════════════════════════════════════════════════

registerTool(
    "get_ai_news",
    "Fetch a curated briefing of the latest AI news. Includes estimates of reading time and links to original sources. Call this when the user asks for 'news', 'AI updates', or 'briefing'.",
    { type: "object", properties: {}, required: [] },
    async () => {
        const { getAINewsBriefing } = await import("./news.js");
        return await getAINewsBriefing();
    },
);

// ═══════════════════════════════════════════════════════
// Web Search & Research
// ═══════════════════════════════════════════════════════


// ════════════════════════════════════════════════════
// SECTION: Web & Search Tools
// ════════════════════════════════════════════════════

registerTool(
    "web_search",
    "Search the web for current information. Use when the user asks to look something up, research a topic, find recent news, or check facts.",
    {
        type: "object",
        properties: {
            query: { type: "string", description: "Search query" },
        },
        required: ["query"],
    },
    async (input) => {
        try {
            const fetch = (await import("node-fetch")).default;
            const response = await fetchTimeout(`https://api.duckduckgo.com/?q=${encodeURIComponent(String(input.query))}&format=json&no_html=1&skip_disambig=1`);
            const data = await response.json() as any;

            if (data.AbstractText) {
                return `**${data.Heading || 'Search Results'}**\n\n${data.AbstractText}\n\nSource: ${data.AbstractURL || 'DuckDuckGo'}`;
            }

            if (data.RelatedTopics && data.RelatedTopics.length > 0) {
                const topics = data.RelatedTopics.slice(0, 5).map((t: any) => {
                    if (t.Text) return `• ${t.Text}`;
                    return null;
                }).filter(Boolean).join('\n');
                return `**Search results for "${input.query}":**\n\n${topics}`;
            }

            return `No detailed results found for "${input.query}". Try rephrasing or being more specific.`;
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            return `Web search failed: ${errMsg}`;
        }
    },
);

registerTool(
    "brainstorm",
    "Generate creative ideas or solutions for a problem. Use when the user asks to brainstorm, ideate, or explore options.",
    {
        type: "object",
        properties: {
            topic: { type: "string", description: "The topic or problem to brainstorm about" },
            context: { type: "string", description: "Additional context or constraints (optional)" },
        },
        required: ["topic"],
    },
    async (input) => {
        const { chat } = await import("../llm/llm.js");
        const { buildProfileContext } = await import("../memory/profile.js");
        const context = input.context ? `\n\nContext: ${input.context}` : "";
        const profile = buildProfileContext();
        const prompt = `Brainstorm creative ideas for: ${input.topic}${context}\n\nCandidate background:\n${profile}\n\nProvide 5-7 diverse, actionable ideas. Be concise and practical.`;

        const { message } = await chat([{ role: "user", content: prompt }], undefined, "", 1, undefined, true);
        return message.content ?? "Failed to generate ideas.";
    },
);

// ═══════════════════════════════════════════════════════
// Notes — Persistent Markdown storage
// ═══════════════════════════════════════════════════════

registerTool(
    "create_note",
    "Create a new persistent Markdown note. Useful for tasks, lists, or long-term information.",
    {
        type: "object",
        properties: {
            name: { type: "string", description: "Title/name of the note (alphanumeric)" },
            content: { type: "string", description: "The full content of the note" },
        },
        required: ["name", "content"],
    },
    async (input) => {
        const { createNote } = await import("../memory/markdown.js");
        const slug = createNote(String(input.name), String(input.content));
        return `✅ Note "${slug}" created.`;
    },
);

registerTool(
    "read_note",
    "Read the full content of a Markdown note by name/slug.",
    {
        type: "object",
        properties: { name: { type: "string", description: "Note name or slug" } },
        required: ["name"],
    },
    async (input) => {
        const { readNote } = await import("../memory/markdown.js");
        const content = readNote(String(input.name));
        if (!content) return `Error: Note "${input.name}" not found.`;
        return content;
    },
);

registerTool(
    "update_note",
    "Completely overwrite the content of an existing note.",
    {
        type: "object",
        properties: {
            name: { type: "string", description: "Note name or slug" },
            content: { type: "string", description: "New content for the note" },
        },
        required: ["name", "content"],
    },
    async (input) => {
        const { updateNote } = await import("../memory/markdown.js");
        const ok = updateNote(String(input.name), String(input.content));
        return ok ? `✅ Note updated.` : `Error: Update failed. Note "${input.name}" may not exist.`;
    },
);

registerTool(
    "append_to_note",
    "Add text to the end of an existing note (or create it if it doesn't exist).",
    {
        type: "object",
        properties: {
            name: { type: "string", description: "Note name" },
            text: { type: "string", description: "Text to append" },
        },
        required: ["name", "text"],
    },
    async (input) => {
        const { appendToNote } = await import("../memory/markdown.js");
        const slug = appendToNote(String(input.name), String(input.text));
        return `✅ Appended to note "${slug}".`;
    },
);

registerTool(
    "list_notes",
    "List all saved Markdown notes.",
    { type: "object", properties: {}, required: [] },
    async () => {
        const { listNotes } = await import("../memory/markdown.js");
        const notes = listNotes();
        if (notes.length === 0) return "No notes found.";
        return `Saved Notes:\n${notes.map((n) => `• ${n}`).join("\n")}`;
    },
);

registerTool(
    "search_notes",
    "Search through the content of all saved Markdown notes for a specific keyword.",
    {
        type: "object",
        properties: { query: { type: "string", description: "Keyword to search for" } },
        required: ["query"],
    },
    async (input) => {
        const { searchNotes } = await import("../memory/markdown.js");
        const results = searchNotes(String(input.query));
        if (results.length === 0) return `No matches found for "${input.query}".`;
        return results.map((r) => `📄 ${r.name}: "${r.excerpt}..."`).join("\n");
    },
);

registerTool(
    "delete_note",
    "Permanently delete a Markdown note by name.",
    {
        type: "object",
        properties: { name: { type: "string", description: "Note name or slug to delete" } },
        required: ["name"],
    },
    async (input) => {
        const { deleteNote } = await import("../memory/markdown.js");
        const ok = deleteNote(String(input.name));
        return ok ? `✅ Note "${input.name}" deleted.` : `Error: Note "${input.name}" not found.`;
    },
);

// ═══════════════════════════════════════════════════════
// Reminders
// ═══════════════════════════════════════════════════════


// ════════════════════════════════════════════════════
// SECTION: Reminder & Calendar Tools
// ════════════════════════════════════════════════════

registerTool(
    "set_reminder",
    "Set a time-based reminder. The bot will send a Telegram message at the specified time. Accepts natural language dates or ISO strings.",
    {
        type: "object",
        properties: {
            message: { type: "string", description: "The reminder text to send" },
            due_at: { type: "string", description: "When to fire the reminder — ISO 8601 datetime (e.g. '2026-03-15T09:00:00') or relative like 'in 2 hours', 'tomorrow 9am'. Convert to ISO before saving." },
        },
        required: ["message", "due_at"],
    },
    async (input) => {
        const { db } = await import("../memory/db.js");
        const message = String(input.message ?? "").trim();
        const dueAt = String(input.due_at ?? "").trim();
        if (!message) return "Error: message is required";
        if (!dueAt) return "Error: due_at is required";

        const parsedDate = new Date(dueAt);
        if (isNaN(parsedDate.getTime())) {
            return `Error: invalid date format. You must provide a valid ISO-8601 string (e.g., '2026-03-15T09:00:00Z'). You provided: '${dueAt}'`;
        }
        if (parsedDate.getTime() <= Date.now()) {
            return `Error: the date provided (${parsedDate.toISOString()}) is in the past. Reminders must be in the future. Check your timezone calculations!`;
        }

        const utcString = parsedDate.toISOString();
        db.prepare("INSERT INTO reminders (message, due_at) VALUES (?, ?)").run(message, utcString);
        return `✅ Reminder set for ${utcString}: "${message}"`;
    },
);

registerTool(
    "list_reminders",
    "List all pending (unsent) reminders.",
    { type: "object", properties: {}, required: [] },
    async () => {
        const { db } = await import("../memory/db.js");
        const rows = db.prepare("SELECT id, message, due_at FROM reminders WHERE sent = 0 ORDER BY due_at ASC").all() as { id: number; message: string; due_at: string }[];
        if (rows.length === 0) return "No pending reminders.";
        return rows.map((r) => `#${r.id} [${r.due_at}]: ${r.message}`).join("\n");
    },
);

// ═══════════════════════════════════════════════════════
// Shell
// ═══════════════════════════════════════════════════════

registerTool(
    "shell",
    "Execute a shell command. User must approve via Telegram before it runs.",
    {
        type: "object",
        properties: { command: { type: "string", description: "Shell command" } },
        required: ["command"],
    },
    async (input) => {
        const command = String(input.command ?? "").trim();
        if (!command) return "Error: command is required";
        return executeShellCommand(command, config.shellTimeoutMs);
    },
);
