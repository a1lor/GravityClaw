import type { Request, Response } from "express";
import { db } from "../../memory/db.js";
import { getTodayCost, getTotalCalls } from "../../usage/tracker.js";

export async function getKpis(_req: Request, res: Response) {
  try {
    const msgs = (db.prepare("SELECT COUNT(*) as c FROM conversations").get() as any).c as number;
    const mems = (db.prepare("SELECT COUNT(*) as c FROM memories WHERE is_archived = 0").get() as any).c as number;
    const jobs = (db.prepare("SELECT COUNT(*) as c FROM job_postings").get() as any).c as number;
    const applied = (db.prepare("SELECT COUNT(*) as c FROM job_postings WHERE pipeline_status IN ('applied','interview','offer','rejected')").get() as any).c as number;
    const sentToday = (db.prepare("SELECT COUNT(*) as c FROM spontaneous_targets WHERE date(sent_at) = date('now')").get() as any).c as number;

    res.json({
      messages: msgs,
      memories: mems,
      jobsTracked: jobs,
      jobsInPipeline: applied,
      sentToday,
      todayCost: await getTodayCost(),
      totalCalls: await getTotalCalls(),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

