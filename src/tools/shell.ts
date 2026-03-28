import { exec } from "child_process";
import { promisify } from "util";
import { session } from "../agent/session.js";
import { requestShellConfirmation } from "../telegram/confirmation.js";

const execAsync = promisify(exec);

const MAX_OUTPUT_CHARS = 4_000;
const DEFAULT_TIMEOUT_MS = 30_000;

// ── Secret patterns to redact from output ─────────────
const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[EMAIL_REDACTED]" },
    { pattern: /sk-[a-zA-Z0-9]{32,}/g, replacement: "[API_KEY_REDACTED]" },
    { pattern: /ghp_[a-zA-Z0-9]{36,}/g, replacement: "[GITHUB_TOKEN_REDACTED]" },
    { pattern: /xox[baprs]-[a-zA-Z0-9-]{10,}/g, replacement: "[SLACK_TOKEN_REDACTED]" },
    { pattern: /AIza[0-9A-Za-z-_]{35}/g, replacement: "[GOOGLE_API_KEY_REDACTED]" },
    { pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, replacement: "[JWT_REDACTED]" },
    { pattern: /Bearer\s+[a-zA-Z0-9_-]{20,}/gi, replacement: "Bearer [TOKEN_REDACTED]" },
];

function sanitizeOutput(text: string): string {
    let sanitized = text;
    for (const { pattern, replacement } of SECRET_PATTERNS) {
        sanitized = sanitized.replace(pattern, replacement);
    }
    return sanitized;
}

// ── Dangerous pattern blocklist ───────────────────────
// Runs after user approval as a final safety net against
// LLM-generated commands that could exfiltrate secrets or destroy data.
const BLOCKED_PATTERNS: RegExp[] = [
    /\$[A-Z_]{3,}\s*\|\s*(curl|wget|nc|ncat|socat)\b/i, // env var → network (exfiltration)
    /curl\s+.*\$[A-Z_]/i,                                // curl with env var interpolation
    /wget\s+.*\$[A-Z_]/i,                                // wget with env var interpolation
    /\$[A-Z_]{3,}\s*>>/i,                                // env var → file append (exfiltration)
    /echo\s+.*\$[A-Z_]{3,}/i,                            // echo env vars (can leak secrets)
    /printenv|env\s*\|/i,                                // print all env vars
    /cat\s+.*\.env/i,                                    // read .env files
    /grep\s+.*\.(env|secret|key|token)/i,                // search for secret files
    /rm\s+-[rf]{1,2}\s+[\/~]/,                           // rm -rf / or ~/
    />\s*\/dev\/(?!null)/,                               // writing to devices (not /dev/null)
    /mkfs|fdisk|dd\s+if=/i,                              // disk wipe commands
    /chmod\s+[0-7]*7[0-7]*\s+\/etc/i,                   // chmod on /etc
];

export async function executeShellCommand(
    command: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
    const chatId = session.getChatId();
    if (chatId === null) {
        return "❌ No active Telegram session — cannot request shell confirmation.";
    }

    // Block dangerous patterns regardless of user approval
    const blocked = BLOCKED_PATTERNS.find(p => p.test(command));
    if (blocked) {
        console.warn(`🚫 Shell blocked dangerous pattern in: ${command}`);
        return "❌ Shell command blocked: contains a potentially dangerous pattern (exfiltration or destructive operation).";
    }

    const approved = await requestShellConfirmation(chatId, command);
    if (!approved) return "❌ Shell command denied by user.";

    try {
        const { stdout, stderr } = await execAsync(command, {
            timeout: timeoutMs,
            shell: process.env.SHELL ?? "/bin/zsh",
        });

        let output = "";
        if (stdout.trim()) output += stdout.trim();
        if (stderr.trim()) output += `\n[stderr]\n${stderr.trim()}`;
        if (!output) return "(command completed with no output)";

        // SECURITY: Sanitize output to prevent accidental secret leakage
        output = sanitizeOutput(output);

        if (output.length > MAX_OUTPUT_CHARS) {
            return output.slice(0, MAX_OUTPUT_CHARS) + `\n… [truncated — ${output.length} total chars]`;
        }
        return output;
    } catch (e: unknown) {
        const err = e as { killed?: boolean; code?: number; stderr?: string; stdout?: string };
        if (err.killed) return `❌ Command timed out after ${timeoutMs / 1000}s.`;
        const parts = [
            `❌ Command failed (exit ${err.code ?? "?"})`,
            err.stdout?.trim(),
            err.stderr?.trim(),
        ].filter(Boolean);
        return parts.join("\n");
    }
}
