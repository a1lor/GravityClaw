import type { Request, Response } from "express";
import { db } from "../../memory/db.js";

// Company-based threads.
// We derive companies from job_postings + spontaneous_targets, then attach timeline items
// from job_emails (linked_job_id -> job_postings.company) and spontaneous_targets (sent_letter etc).

function normCompany(s: string): string {
  return s.trim();
}

export function listThreads(req: Request, res: Response) {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 500) : 200;

  try {
    const companies = new Map<string, { company: string; jobs: number; emails: number; outreach: number; last_at: string }>();

    const jobs = db.prepare(
      `SELECT company, MAX(found_at) as last_at, COUNT(*) as cnt
       FROM job_postings
       GROUP BY company`,
    ).all() as any[];

    for (const r of jobs) {
      const company = normCompany(String(r.company || ""));
      if (!company) continue;
      companies.set(company, { company, jobs: Number(r.cnt) || 0, emails: 0, outreach: 0, last_at: String(r.last_at || "") });
    }

    const outreach = db.prepare(
      `SELECT company, MAX(COALESCE(sent_at, created_at)) as last_at, COUNT(*) as cnt
       FROM spontaneous_targets
       GROUP BY company`,
    ).all() as any[];

    for (const r of outreach) {
      const company = normCompany(String(r.company || ""));
      if (!company) continue;
      const existing = companies.get(company) ?? { company, jobs: 0, emails: 0, outreach: 0, last_at: "" };
      existing.outreach = (existing.outreach || 0) + (Number(r.cnt) || 0);
      const last = String(r.last_at || "");
      if (!existing.last_at || (last && last > existing.last_at)) existing.last_at = last;
      companies.set(company, existing);
    }

    // Count emails linked directly via linked_job_id
    const emailRows = db.prepare(
      `SELECT jp.company as company, MAX(je.created_at) as last_at, COUNT(*) as cnt
       FROM job_emails je
       LEFT JOIN job_postings jp ON jp.id = je.linked_job_id
       WHERE jp.company IS NOT NULL AND jp.company != ''
       GROUP BY jp.company`,
    ).all() as any[];

    for (const r of emailRows) {
      const company = normCompany(String(r.company || ""));
      if (!company) continue;
      const existing = companies.get(company) ?? { company, jobs: 0, emails: 0, outreach: 0, last_at: "" };
      existing.emails = (existing.emails || 0) + (Number(r.cnt) || 0);
      const last = String(r.last_at || "");
      if (!existing.last_at || (last && last > existing.last_at)) existing.last_at = last;
      companies.set(company, existing);
    }

    // Also count unlinked emails by fuzzy-matching company name in from_addr
    const unlinkedEmails = db.prepare(
      `SELECT id, from_addr, created_at FROM job_emails WHERE (linked_job_id IS NULL OR linked_job_id = '')`
    ).all() as any[];

    for (const e of unlinkedEmails as any[]) {
      const fromLower = (e.from_addr || "").toLowerCase();
      for (const [companyKey, companyData] of companies) {
        const cLower = companyKey.toLowerCase().replace(/[^a-z0-9]/g, "");
        const fromNorm = fromLower.replace(/[^a-z0-9]/g, "");
        if (cLower.length > 3 && fromNorm.includes(cLower)) {
          companyData.emails = (companyData.emails || 0) + 1;
          const last = String(e.created_at || "");
          if (!companyData.last_at || (last && last > companyData.last_at)) companyData.last_at = last;
          break;
        }
      }
    }

    let items = Array.from(companies.values());
    if (q) items = items.filter((c) => c.company.toLowerCase().includes(q));
    items.sort((a, b) => (b.last_at || "").localeCompare(a.last_at || ""));
    res.json(items.slice(0, limit));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function getThread(req: Request, res: Response) {
  const company = normCompany(decodeURIComponent(String(req.params.company ?? "")));
  if (!company) return res.status(400).json({ error: "company required" });

  try {
    const jobs = db.prepare(
      `SELECT id, title, location, url, pipeline_status, found_at, applied_at
       FROM job_postings
       WHERE company = ?
       ORDER BY found_at DESC
       LIMIT 50`,
    ).all(company);

    const emails = db.prepare(
      `SELECT je.id, je.from_addr, je.subject, je.snippet, je.status, je.email_date, je.created_at, je.linked_job_id
       FROM job_emails je
       JOIN job_postings jp ON jp.id = je.linked_job_id
       WHERE jp.company = ?
       ORDER BY je.created_at DESC
       LIMIT 100`,
    ).all(company);

    const outreach = db.prepare(
      `SELECT id, hr_email, status, sent_at, reply_at, notes, email_subject, sent_letter, created_at
       FROM spontaneous_targets
       WHERE company = ?
       ORDER BY created_at DESC
       LIMIT 100`,
    ).all(company);

    // Build a unified timeline
    const timeline: any[] = [];
    for (const j of jobs as any[]) {
      timeline.push({ type: "job", at: j.found_at, data: j });
      if (j.applied_at) timeline.push({ type: "job_applied", at: j.applied_at, data: j });
    }
    for (const e of emails as any[]) {
      timeline.push({ type: "email", at: e.created_at || e.email_date, data: e });
    }
    for (const o of outreach as any[]) {
      timeline.push({ type: "outreach", at: o.sent_at || o.created_at, data: o });
      if (o.reply_at) timeline.push({ type: "outreach_reply", at: o.reply_at, data: o });
    }
    timeline.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));

    res.json({ company, jobs, emails, outreach, timeline });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

