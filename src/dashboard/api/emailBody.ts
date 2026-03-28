import type { Request, Response } from "express";
import type { JobEmailRow } from "../../types/db-rows.js";
import { db } from "../../memory/db.js";
import { google } from "googleapis";
import { getAuthenticatedClient, isGmailReady } from "../../tools/gmail/auth.js";

function extractEmailText(payload: any): string | null {
  if (!payload) return null;
  
  const pieces: string[] = [];

  function walk(p: any) {
    if (p.body?.data && p.mimeType === "text/plain") {
      pieces.push(Buffer.from(p.body.data, "base64url").toString("utf-8"));
    } else if (p.body?.data && p.mimeType === "text/html" && pieces.length === 0) {
      // Only collect HTML if we haven't found any plain text yet
      // We'll filter this out later if we find plain text in a different branch
      const raw = Buffer.from(p.body.data, "base64url").toString("utf-8");
      pieces.push(
        raw
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<(br|p|div|li|h[1-6])[^>]*>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/[ \t]+/g, " ")
          .replace(/\n\s*\n/g, "\n\n")
          .trim()
      );
    }
    if (p.parts) {
      for (const part of p.parts) walk(part);
    }
  }

  walk(payload);
  
  // If we found both plain text and HTML (converted), prefer the plain text
  // Actually, Gmail usually gives multipart/alternative. 
  // Let's just return the joined pieces.
  return pieces.length > 0 ? pieces.join("\n\n") : null;
}

export async function getEmailFullBody(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const row = db
    .prepare(`SELECT gmail_message_id, full_body, snippet FROM job_emails WHERE id = ?`)
    .get(id) as Pick<JobEmailRow, "gmail_message_id" | "full_body" | "snippet"> | undefined;
  if (!row) return res.status(404).json({ error: "not found" });

  if (row.full_body) {
    return res.json({ body: row.full_body });
  }

  if (!row.gmail_message_id) {
    return res.json({ body: row.snippet || "" });
  }

  if (!isGmailReady()) {
    return res.json({ body: row.snippet || "", note: "Gmail not connected" });
  }

  try {
    const auth = getAuthenticatedClient();
    if (!auth) return res.json({ body: row.snippet || "" });

    const gmail = google.gmail({ version: "v1", auth });
    const full = await gmail.users.messages.get({
      userId: "me",
      id: row.gmail_message_id,
      format: "full",
    });

    const text = extractEmailText(full.data.payload);
    
    if (!text || text.length < 50) {
      console.warn(`⚠️ Email ${id}: Extraction result looks short (${text?.length ?? 0} chars). Snippet length: ${row.snippet?.length ?? 0}`);
    }

    const body = text && text.length > 40 ? text : row.snippet || "";
    
    db.prepare(`UPDATE job_emails SET full_body = ? WHERE id = ?`).run(body, id);
    console.log(`✅ Email ${id}: Stored ${body.length} chars of body.`);

    res.json({ body });
  } catch (err) {
    console.error("Failed to fetch full email body:", err);
    res.json({ body: row.snippet || "", error: "Gmail fetch failed" });
  }
}
