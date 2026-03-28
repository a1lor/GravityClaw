import { db } from "./db.js";

// ── Questions ─────────────────────────────────────────
// Curated to capture the most useful personal context
// without blowing up the system prompt.

export interface ProfileQuestion {
    key: string;
    question: string;
    label: string;
}

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
    {
        key: "name",
        question: "What's your name?",
        label: "Name",
    },
    {
        key: "occupation",
        question: "What do you do for work or study?",
        label: "Occupation",
    },
    {
        key: "location",
        question: "Where are you based?",
        label: "Location",
    },
    {
        key: "projects",
        question: "What are your main ongoing projects or goals right now? (A sentence or two is fine.)",
        label: "Projects",
    },
    {
        key: "education",
        question: "What is your educational background?",
        label: "Education",
    },
    {
        key: "timezone",
        question: "What timezone are you in?",
        label: "Timezone",
    },
    {
        key: "availability",
        question: "What are your working hours or availability?",
        label: "Availability",
    },
    {
        key: "tech_stack",
        question: "What is your primary tech stack or the tools you use most?",
        label: "Tech Stack",
    },
    {
        key: "style",
        question: "How do you prefer I communicate? e.g. casual, brief, technical, detailed…",
        label: "Style",
    },
    {
        key: "background",
        question: "Anything else important about you I should always know? (Reply /skip to leave blank.)",
        label: "Background",
    },
    {
        key: "signature",
        question: "What's your preferred email signature? (e.g., 'Best regards, David'). I'll append it to all outgoing emails.",
        label: "Signature",
    },
];

// ── CRUD ──────────────────────────────────────────────

const stmtGet = db.prepare<[string], { value: string }>(
    "SELECT value FROM profile WHERE key = ?",
);
const stmtSet = db.prepare(
    "INSERT OR REPLACE INTO profile (key, value, updated_at) VALUES (?, ?, datetime('now'))",
);
const stmtAll = db.prepare<[], { key: string; value: string }>(
    "SELECT key, value FROM profile ORDER BY key",
);

export function getProfileValue(key: string): string {
    return stmtGet.get(key)?.value ?? "";
}

export function setProfileValue(key: string, value: string): void {
    stmtSet.run(key, value);
}

export function getAllProfile(): Record<string, string> {
    const rows = stmtAll.all();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function isProfileComplete(): boolean {
    const p = getAllProfile();
    return !!p.name && !!p.occupation;
}

// ── Context builder ───────────────────────────────────
// Returns a compact section injected into the system prompt.
// Kept to ~7 lines max so it never bloats context.

export function buildProfileContext(): string {
    const profile = getAllProfile();
    const lines: string[] = [];

    for (const { key, label } of PROFILE_QUESTIONS) {
        const val = profile[key];
        if (val) lines.push(`- ${label}: ${val}`);
    }

    if (profile.cv_filename) {
        lines.push(`- CV on file: ${profile.cv_filename}`);
    }

    if (profile.cv_skills) {
        lines.push(`- Skills profile: ${profile.cv_skills}`);
    }

    if (lines.length === 0) return "";
    return `\n\n## About You\n${lines.join("\n")}`;
}
