import type { Request, Response } from "express";
import { db } from "../../memory/db.js";
import { existsSync, readFileSync } from "fs";
import path from "path";

export function getStatus(_req: Request, res: Response) {
  try {
    const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
    const isRailway = Boolean(
      publicDomain &&
        (process.env.RAILWAY_ENVIRONMENT ||
          process.env.RAILWAY_PROJECT_ID ||
          process.env.RAILWAY_SERVICE_ID),
    );

    const gmailTokenPath = path.join(process.cwd(), "data", "gmail-tokens.json");
    let gmailConnected = false;
    if (existsSync(gmailTokenPath)) {
      try {
        const tokens = JSON.parse(readFileSync(gmailTokenPath, "utf-8"));
        gmailConnected = !!(tokens.access_token || tokens.refresh_token);
      } catch {
        gmailConnected = false;
      }
    }

    const telegramConnected = !!process.env.TELEGRAM_BOT_TOKEN;

    const memoryCount = (
      db.prepare("SELECT COUNT(*) as c FROM memories WHERE is_archived = 0").get() as any
    ).c as number;
    const jobCount = (
      db.prepare("SELECT COUNT(*) as c FROM job_postings").get() as any
    ).c as number;

    res.json({
      env: isRailway ? "railway" : "local",
      railwayService: process.env.RAILWAY_SERVICE_NAME || null,
      telegramConnected,
      gmailConnected,
      dbPath: path.join(process.cwd(), "data", "memory.db"),
      memoryCount,
      jobCount,
      uptime: Math.floor(process.uptime()),
      nodeVersion: process.version,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
