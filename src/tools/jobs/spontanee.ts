import { db } from "../../memory/db.js";
import { chat } from "../../llm/llm.js";
import { buildProfileContext, getAllProfile } from "../../memory/profile.js";

// ── Types ─────────────────────────────────────────────
export interface SpontaneousTarget {
    id: number;
    company: string;
    hr_email: string;
    industry: string;
    status: string;
    sent_at: string | null;
    reply_at: string | null;
    notes: string;
    created_at: string;
}

export interface SpontaneousEmail {
    subject: string;
    body: string;
}

// ── Statements ────────────────────────────────────────
const stmtInsert = db.prepare(
    `INSERT OR IGNORE INTO spontaneous_targets (company, hr_email, industry) VALUES (?, ?, ?)`,
);
const stmtPending = db.prepare(
    `SELECT * FROM spontaneous_targets WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
);
const stmtUpdate = db.prepare(
    `UPDATE spontaneous_targets SET status = ?, notes = ?, sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE sent_at END WHERE id = ?`,
);
const stmtUpdateLetter = db.prepare(
    `UPDATE spontaneous_targets SET email_subject = ?, sent_letter = ? WHERE id = ?`,
);
const stmtReplyAt = db.prepare(
    `UPDATE spontaneous_targets SET reply_at = datetime('now') WHERE id = ?`,
);
const stmtCounts = db.prepare(
    `SELECT status, COUNT(*) as cnt FROM spontaneous_targets GROUP BY status`,
);
const stmtTotalSent = db.prepare(
    `SELECT COUNT(*) as cnt FROM spontaneous_targets WHERE status = 'sent'`,
);
const stmtReplied = db.prepare(
    `SELECT COUNT(*) as cnt FROM spontaneous_targets WHERE reply_at IS NOT NULL`,
);
const stmtDailyCount = db.prepare(
    `SELECT COUNT(*) as cnt FROM spontaneous_targets WHERE date(sent_at) = date('now')`,
);

// ── CRUD ──────────────────────────────────────────────
export function addTarget(company: string, hrEmail: string, industry = ""): boolean {
    const result = stmtInsert.run(company, hrEmail, industry);
    return result.changes > 0;
}

export function getPendingTargets(limit = 5): SpontaneousTarget[] {
    return stmtPending.all(limit) as SpontaneousTarget[];
}

export function updateTargetStatus(id: number, status: string, notes = "", sentLetter?: string, emailSubject?: string): void {
    stmtUpdate.run(status, notes, status, id);
    if (status === 'sent' && sentLetter !== undefined && emailSubject !== undefined) {
        stmtUpdateLetter.run(emailSubject, sentLetter, id);
    }
}

export function markTargetReplied(id: number): void {
    stmtReplyAt.run(id);
    stmtUpdate.run("replied", "", "replied", id);
}

export function getDailySentCount(): number {
    return (stmtDailyCount.get() as { cnt: number }).cnt;
}

// ── Stats ─────────────────────────────────────────────
export function getTargetStats(): string {
    const counts: Record<string, number> = {};
    const rows = stmtCounts.all() as { status: string; cnt: number }[];
    for (const row of rows) counts[row.status] = row.cnt;

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const sent = (stmtTotalSent.get() as { cnt: number }).cnt;
    const replied = (stmtReplied.get() as { cnt: number }).cnt;
    const replyRate = sent > 0 ? `${Math.round((replied / sent) * 100)}%` : "n/a";

    return (
        `📨 <b>Candidatures spontanées</b>\n\n` +
        `📋 Total: <b>${total}</b>\n` +
        `⏳ En attente: <b>${counts["pending"] ?? 0}</b>\n` +
        `📤 Envoyées: <b>${sent}</b>\n` +
        `💬 Réponses: <b>${replied}</b>\n` +
        `❌ Ignorées: <b>${counts["skipped"] ?? 0}</b>\n` +
        `📈 Taux de réponse: <b>${replyRate}</b>`
    );
}

// ── Language detection ────────────────────────────────
function detectLanguage(text: string): 'fr' | 'en' {
    const frenchIndicators = /\b(société|entreprise|recherche|français|poste|travail|chez|dans|avec|pour)\b/i;
    const englishIndicators = /\b(company|business|search|english|position|work|at|in|with|for)\b/i;

    const frenchMatches = (text.match(frenchIndicators) || []).length;
    const englishMatches = (text.match(englishIndicators) || []).length;

    return frenchMatches > englishMatches ? 'fr' : 'en';
}

// ── Email generation ──────────────────────────────────
export async function generateSpontaneousEmail(target: SpontaneousTarget, contextHint?: string): Promise<SpontaneousEmail> {
    const profileCtx = buildProfileContext();
    const profile = getAllProfile();
    const name = profile["name"] || "le candidat";
    const role = profile["occupation"] || "étudiant en alternance";
    const signature = profile["signature"];

    // Detect language from company/industry/context
    const detectionText = `${target.company} ${target.industry} ${contextHint || ''}`;
    const language = detectLanguage(detectionText);

    const isFrench = language === 'fr';

    const prompt = isFrench
        ? `You are a professional career coach specializing in high-end tech recruitment. Write a highly personalized, modern, and structured "candidature spontanée" email in French for ${name}, targeting ${target.company} (industry: ${target.industry || "non précisée"}).\n\n` +
          `CANDIDATE PROFILE:${profileCtx}\n\n` +
          `TARGET:\n- Company: ${target.company}\n- Industry: ${target.industry || "non précisée"}\n\n` +
          `GOLDEN TEMPLATE (Follow this tone, structure, and technical background):\n` +
          `"""\n` +
          `Bonjour [Nom],\n\n` +
          `Actuellement en troisième année à Aivancity School for Technology, Business & Society, je recherche une alternance en IA et Data Science pour la rentrée 2026, avec un rythme 3 sem. entreprise / 1 sem. école. Passionné par l'automatisation et les LLMs, je suis disponible pour un stage dès juin 2026 ou pour une alternance dès septembre 2026.\n\n` +
          `[Paragraphe personnalisé sur l'intérêt pour ${target.company} et son industrie].\n\n` +
          `Lors de mes missions chez OKO France et du projet Beparentalis en AI Clinic, j'ai travaillé sur l'analyse de données, l'optimisation de flux et de bases SQL, la mise en place d'architectures RAG et le fine-tuning de modèles. J'ai également conduit des projets de prototypage LLM avec HuggingFace et développé des scripts d'automatisation en Python.\n\n` +
          `Je peux contribuer concrètement à vos projets de Data Product, au prototypage de solutions IA, et à l'amélioration des pipelines de données. Le coût de cette alternance serait réduit pour votre société grâce au plan d'aide à l'apprentissage (aide de 5000€).\n\n` +
          `Vous trouverez mon CV en pièce jointe. Si vous le souhaitez, je suis disponible pour un échange de 20 minutes afin de discuter de vos besoins.\n` +
          `"""\n\n` +
          `INSTRUCTIONS:\n` +
          `- Write ENTIRELY in French. Use "vouvoiement".\n` +
          `- Use clear paragraph breaks (double newline) to ensure a clean, breathable structure.\n` +
          `- Tone: Ambitious yet humble, professional, and results-oriented.\n` +
          `- Maintain the Aivancity context and technical highlights (OKO France, Beparentalis, RAG, SQL).\n` +
          `- Return JSON with exactly two keys: "subject" and "body". No code fences.\n` +
          `   subject format: "Candidature spontanée — [Role] | [Name]"\n` +
          `   body: only the email body (no subject line)`
        : `You are a professional career coach specializing in high-end tech recruitment. Write a highly personalized, modern, and structured cold outreach email in English for ${name}, targeting ${target.company} (industry: ${target.industry || "not specified"}).\n\n` +
          `CANDIDATE PROFILE:${profileCtx}\n\n` +
          `TARGET:\n- Company: ${target.company}\n- Industry: ${target.industry || "not specified"}\n\n` +
          `GOLDEN TEMPLATE (Follow this tone, structure, and technical background):\n` +
          `"""\n` +
          `Dear [Name],\n\n` +
          `I am currently a third-year student at Aivancity School for Technology, Business & Society, seeking an AI and Data Science apprenticeship starting September 2026, with a 3-week company / 1-week school rhythm. Passionate about automation and LLMs, I am available for an internship from June 2026 or an apprenticeship from September 2026.\n\n` +
          `[Personalized paragraph about interest in ${target.company} and its industry].\n\n` +
          `During my missions at OKO France and the Beparentalis project at AI Clinic, I worked on data analysis, SQL database and workflow optimization, RAG architecture implementation, and model fine-tuning. I also led LLM prototyping projects with HuggingFace and developed automation scripts in Python.\n\n` +
          `I can contribute concretely to your Data Product projects, AI solution prototyping, and data pipeline improvements. The cost of this apprenticeship would be reduced for your company thanks to the apprenticeship support plan (€5000 aid).\n\n` +
          `You will find my CV attached. If you wish, I am available for a 20-minute call to discuss your needs.\n` +
          `"""\n\n` +
          `INSTRUCTIONS:\n` +
          `- Write ENTIRELY in English. Use professional tone.\n` +
          `- Use clear paragraph breaks (double newline) to ensure a clean, breathable structure.\n` +
          `- Tone: Ambitious yet humble, professional, and results-oriented.\n` +
          `- Maintain the Aivancity context and technical highlights (OKO France, Beparentalis, RAG, SQL).\n` +
          `- Return JSON with exactly two keys: "subject" and "body". No code fences.\n` +
          `   subject format: "Application for [Role] — [Name]"\n` +
          `   body: only the email body (no subject line)`;

    const { message } = await chat([{ role: "user", content: prompt }]);
    const raw = message.content ?? "";

    try {
        // Strip out any surrounding whitespace/markdown
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        
        if (start === -1 || end === -1) {
            throw new Error("No JSON found in response");
        }
        
        const jsonOnly = raw.substring(start, end + 1);
        const parsed = JSON.parse(jsonOnly);

        let body = String(parsed.body ?? raw);

        // Clean up formatting artifacts
        body = body
            .replace(/```[\s\S]*?```/g, '')  // Remove code fences
            .replace(/```/g, '')              // Remove stray backticks
            .replace(/\\n/g, '\n')            // Convert literal \n to actual newlines
            .replace(/\\"/g, '"')             // Unescape quotes
            .replace(/&quot;/g, '"')          // HTML entities
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\*\*/g, '')             // Remove markdown bold
            .replace(/\*/g, '')               // Remove markdown italic
            .replace(/\n{3,}/g, '\n\n')       // Normalize multiple newlines
            .trim();

        if (signature) {
            body = body + "\n\n" + signature.trim();
        }

        return {
            subject: String(parsed.subject ?? `Candidature spontanée — ${role} | ${name}`),
            body,
        };
    } catch (err) {
        console.warn("⚠️ JSON parse failed for spontaneous email, using raw fallback:", err);
        return {
            subject: `Candidature spontanée — ${role} | ${name}`,
            body: raw,
        };
    }
}

export async function editSpontaneousEmail(oldSubject: string, oldBody: string, instructions: string): Promise<SpontaneousEmail> {
    const profileCtx = buildProfileContext();
    const profile = getAllProfile();
    const signature = profile["signature"];

    const prompt =
        `You are a professional career coach specializing in tech recruitment. A user wants to refine an outreach email they are sending.\n\n` +
        `OLD SUBJECT: ${oldSubject}\n` +
        `OLD BODY:\n${oldBody}\n\n` +
        `USER INSTRUCTIONS: "${instructions}"\n\n` +
        `CANDIDATE PROFILE:${profileCtx}\n\n` +
        `RE-WRITE RULES:\n` +
        `1. Rewrite the email in French following the user's instructions while keeping the professional, modern, and structured tone.\n` +
        `2. Ensure clear paragraph breaks (double newline) for readability.\n` +
        `3. Maintain the core pitch: Aivancity student status, Sept 2026/June 2026 availability, and the technical project highlights (OKO France, Beparentalis).\n` +
        `4. Ensure the sentence "Vous trouverez mon CV en pièce jointe" is always included.\n` +
        `5. Return JSON with exactly two keys: "subject" and "body".\n` +
        `   subject format: "Candidature spontanée — [Role] | [Name]"\n` +
        `   body: the email body only.`;

    const { message } = await chat([{ role: "user", content: prompt }]);
    const raw = message.content ?? "";

    try {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        
        if (start === -1 || end === -1) {
            throw new Error("No JSON found in response");
        }
        
        const jsonOnly = raw.substring(start, end + 1);
        const parsed = JSON.parse(jsonOnly);

        let body = String(parsed.body);

        // Clean up formatting artifacts
        body = body
            .replace(/```[\s\S]*?```/g, '')
            .replace(/```/g, '')
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        if (signature) {
            body = body + "\n\n" + signature.trim();
        }

        return {
            subject: String(parsed.subject),
            body,
        };
    } catch (err) {
        console.warn("⚠️ JSON parse failed for spontaneous edit, using raw fallback:", err);
        return { subject: oldSubject, body: raw };
    }
}

export function resetSkippedTargets(): number {
    const stmt = db.prepare(`UPDATE spontaneous_targets SET status = 'pending' WHERE status = 'skipped'`);
    const result = stmt.run();
    return result.changes;
}
