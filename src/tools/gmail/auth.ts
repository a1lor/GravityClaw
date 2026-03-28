import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import http from "http";
import { encryptSecret, decryptSecret } from "../../security/encryption.js";
import { db } from "../../memory/db.js";

const TOKENS_PATH = path.join(process.cwd(), "data", "gmail-tokens.json");
const SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
];
const REDIRECT_PORT = 12350;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

// ── Secure token storage helpers ──────────────────────
function saveTokensSecure(tokens: object): void {
    const json = JSON.stringify(tokens);
    const encrypted = encryptSecret(json);

    // Save encrypted to database
    db.prepare(`
        INSERT OR REPLACE INTO secure_secrets (key_name, iv, auth_tag, encrypted_data)
        VALUES (?, ?, ?, ?)
    `).run('gmail_tokens', encrypted.iv, encrypted.authTag, encrypted.encryptedData);

    console.log("✅ Gmail tokens saved securely (encrypted)");
}

function loadTokensSecure(): object | null {
    // GMAIL_TOKENS env var always takes priority — used to inject/rotate tokens on Railway
    // without SSH access. Set the env var, restart, tokens get written to DB, then remove it.
    if (process.env.GMAIL_TOKENS) {
        console.warn("⚠️ GMAIL_TOKENS env var set — overwriting stored tokens...");
        const plaintext = Buffer.from(process.env.GMAIL_TOKENS, "base64").toString("utf-8");
        const tokens = JSON.parse(plaintext) as object;
        saveTokensSecure(tokens);
        return tokens;
    }

    const row = db.prepare(`
        SELECT iv, auth_tag, encrypted_data FROM secure_secrets WHERE key_name = ?
    `).get('gmail_tokens') as { iv: string; auth_tag: string; encrypted_data: string } | undefined;

    if (!row) {
        // Fallback to legacy plaintext storage for migration
        if (existsSync(TOKENS_PATH)) {
            console.warn("⚠️ Migrating plaintext Gmail tokens to encrypted storage...");
            const plaintext = readFileSync(TOKENS_PATH, "utf-8");
            const tokens = JSON.parse(plaintext) as object;
            saveTokensSecure(tokens);
            return tokens;
        }
        return null;
    }

    const decrypted = decryptSecret({
        iv: row.iv,
        authTag: row.auth_tag,
        encryptedData: row.encrypted_data,
    });

    return JSON.parse(decrypted) as object;
}

// ── Helpers ───────────────────────────────────────────
function getCredentials(): { clientId: string; clientSecret: string } | null {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function createOAuthClient() {
    const creds = getCredentials();
    if (!creds) return null;
    return new google.auth.OAuth2(creds.clientId, creds.clientSecret, REDIRECT_URI);
}

export function getAuthUrl(): string | null {
    const client = createOAuthClient();
    if (!client) return null;
    return client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent",
    });
}

export function isGmailCredentialsConfigured(): boolean {
    return !!getCredentials();
}

export function isGmailTokenized(): boolean {
    // Check encrypted storage first
    const row = db.prepare(`SELECT 1 FROM secure_secrets WHERE key_name = ?`).get('gmail_tokens');
    if (row) return true;
    // Fallback to legacy storage
    return existsSync(TOKENS_PATH) || !!process.env.GMAIL_TOKENS;
}

export function isGmailReady(): boolean {
    return isGmailCredentialsConfigured() && isGmailTokenized();
}

export function saveTokens(tokens: object): void {
    // Save encrypted to database (primary method)
    saveTokensSecure(tokens);

    // Legacy: Also save to file for local development backup
    const json = JSON.stringify(tokens, null, 2);
    writeFileSync(TOKENS_PATH, json);
}

export function getAuthenticatedClient() {
    const client = createOAuthClient();
    if (!client) return null;

    const tokens = loadTokensSecure();
    if (!tokens) return null;

    client.setCredentials(tokens);

    // Auto-save refreshed tokens
    client.on("tokens", (newTokens) => {
        const current = loadTokensSecure() || {};
        saveTokens({ ...current, ...newTokens });
    });

    return client;
}

// ── OAuth callback server ─────────────────────────────
// Starts a temporary HTTP server on REDIRECT_PORT.
// The user opens the auth URL in their browser (same machine).
// Google redirects to localhost, server catches the code, exchanges it.
export function startOAuthCallbackServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url ?? "/", `http://localhost:${REDIRECT_PORT}`);
            const code = url.searchParams.get("code");
            const error = url.searchParams.get("error");

            if (error) {
                res.writeHead(200);
                res.end("Access denied. You can close this tab.");
                server.close();
                reject(new Error(`OAuth denied: ${error}`));
                return;
            }

            if (!code) {
                res.writeHead(200);
                res.end("Waiting for authorization…");
                return;
            }

            try {
                const client = createOAuthClient()!;
                const { tokens } = await client.getToken(code);
                saveTokens(tokens);
                res.writeHead(200);
                res.end(
                    "✅ Gmail connected! You can close this tab and return to Telegram.",
                );
                server.close();
                resolve();
            } catch (err) {
                res.writeHead(500);
                res.end("❌ Authentication failed. Check the bot logs.");
                server.close();
                reject(err);
            }
        });

        server.on("error", (err) => reject(err));

        server.listen(REDIRECT_PORT, "localhost", () => {
            console.log(`🔑 Gmail OAuth callback server on port ${REDIRECT_PORT}`);
        });

        // Timeout after 5 minutes
        setTimeout(
            () => {
                server.close();
                reject(new Error("Gmail OAuth setup timed out"));
            },
            5 * 60 * 1000,
        );
    });
}
