import { google } from "googleapis";
import { getAuthenticatedClient } from "./auth.js";
import fs from "fs";
import path from "path";

/**
 * Encodes a header string (like Subject) to handle non-ASCII characters (RFC 2047).
 */
function encodeHeader(text: string): string {
    // If it's already pure ASCII, no need to encode
    if (/^[\x00-\x7F]*$/.test(text)) return text;
    return `=?utf-8?B?${Buffer.from(text).toString("base64")}?=`;
}

/**
 * Send an email via Gmail on the user's behalf, with optional attachment.
 */
export async function sendEmail(
    to: string,
    subject: string,
    body: string,
    replyToMessageId?: string,
    attachmentPath?: string,
): Promise<string> {
    const auth = getAuthenticatedClient();
    if (!auth) throw new Error("Gmail not connected. Run /gmail_setup in Telegram first.");

    const gmail = google.gmail({ version: "v1", auth });

    const safeSubject = encodeHeader(subject);
    let raw = "";

    if (!attachmentPath) {
        // Simple text-only message
        const lines = [
            `To: ${to}`,
            `Subject: ${safeSubject}`,
            `Content-Type: text/plain; charset=utf-8`,
            `MIME-Version: 1.0`,
            ...(replyToMessageId ? [`In-Reply-To: ${replyToMessageId}`, `References: ${replyToMessageId}`] : []),
            "",
            body,
        ];
        raw = Buffer.from(lines.join("\r\n")).toString("base64");
    } else {
        // Multipart message for attachment
        if (!fs.existsSync(attachmentPath)) {
            console.warn(`⚠️ Attachment not found at ${attachmentPath}, sending text-only.`);
            return sendEmail(to, subject, body, replyToMessageId);
        }

        const boundary = "__GRAVITY_CLAW_BOUNDARY__";
        const fileName = path.basename(attachmentPath);
        const fileContent = fs.readFileSync(attachmentPath).toString("base64");
        
        // Simple MIME type detection
        const ext = path.extname(attachmentPath).toLowerCase();
        const contentType = ext === ".pdf" ? "application/pdf" : "application/octet-stream";

        const lines = [
            `To: ${to}`,
            `Subject: ${safeSubject}`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            ...(replyToMessageId ? [`In-Reply-To: ${replyToMessageId}`, `References: ${replyToMessageId}`] : []),
            "",
            `--${boundary}`,
            `Content-Type: text/plain; charset=utf-8`,
            "Content-Transfer-Encoding: 7bit",
            "",
            body,
            "",
            `--${boundary}`,
            `Content-Type: ${contentType}; name="${fileName}"`,
            `Content-Description: ${fileName}`,
            `Content-Disposition: attachment; filename="${fileName}"; size=${fs.statSync(attachmentPath).size}`,
            `Content-Transfer-Encoding: base64`,
            "",
            fileContent,
            "",
            `--${boundary}--`
        ];
        raw = Buffer.from(lines.join("\r\n")).toString("base64");
    }

    // Gmail API requires URL-safe base64
    const safeRaw = raw
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: safeRaw },
    });

    return res.data.id ?? "sent";
}
