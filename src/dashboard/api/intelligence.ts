import type { Request, Response } from "express";
import { db } from "../../memory/db.js";
import { existsSync, readFileSync } from "fs";
import path from "path";

export async function getHomeIntelligence(req: Request, res: Response) {
  try {
    const attentionItems: any[] = [];

    // 1. High-Score New Jobs
    // Look for jobs > 80 score found in the last 48 hours
    const highJobs = db.prepare(`
      SELECT id, title, company, job_score 
      FROM job_postings 
      WHERE job_score >= 80 
      AND found_at > date('now', '-2 days')
      LIMIT 3
    `).all() as any[];

    highJobs.forEach(j => {
      attentionItems.push({
        id: `job-${j.id}`,
        type: 'job-match',
        label: `High match: ${j.title} @ ${j.company} (${j.job_score}%)`,
        urgency: j.job_score >= 90 ? 'high' : 'normal',
        metadata: { jobId: j.id }
      });
    });

    // 2. Pending Recruiter Emails
    // Find emails with negative/neutral status from recruiters that haven't been replied to (coarse check)
    // For now, we'll look for emails where status is 'neutral' or 'negative' and received in last 3 days
    const pendingEmails = db.prepare(`
      SELECT id, subject, from_addr, gmail_thread_id 
      FROM job_emails 
      WHERE status IN ('neutral', 'negative')
      AND created_at > date('now', '-3 days')
      ORDER BY created_at DESC
      LIMIT 3
    `).all() as any[];

    pendingEmails.forEach(e => {
      attentionItems.push({
        id: `email-${e.id}`,
        type: 'follow-up',
        label: `Reply needed: ${e.subject}`,
        urgency: 'high',
        metadata: { threadId: e.gmail_thread_id }
      });
    });

    // 3. Daily Briefing
    const briefingCache = db.prepare(`SELECT content FROM daily_cache WHERE category = 'briefing' AND updated_at = date('now')`).get() as any;
    const summary = briefingCache?.content || "No briefing generated for today yet.";

    // 4. Today's Events (from ICS if available)
    // For now, we'll return an empty list or mock if we want to show the UI works
    const events: any[] = [];

    res.json({
      needsAttention: attentionItems,
      summary,
      events
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
