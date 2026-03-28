import type { Request, Response, NextFunction } from "express";

function getBearerToken(req: Request): string {
  const raw = String(req.header("authorization") ?? "");
  if (!raw) return "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return (m?.[1] ?? "").trim();
}

function getTokenFromRequest(req: Request): string {
  const q = req.query?.token;
  const queryToken = typeof q === "string" ? q : "";
  return queryToken || getBearerToken(req);
}

export function requireDashboardToken(req: Request, res: Response, next: NextFunction): void {
  const required = (process.env.DASHBOARD_TOKEN ?? "").trim();
  if (!required) return next();

  const provided = getTokenFromRequest(req);
  if (!provided || provided !== required) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

