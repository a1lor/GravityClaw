import type { Request, Response } from "express";
import { db } from "../../memory/db.js";

export function globalSearch(req: Request, res: Response) {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json([]);

  try {
    const pattern = `%${q}%`;
    const results: any[] = [];

    // 1. Search Jobs
    const jobs = db.prepare(`
      SELECT id, title, company, url
      FROM job_postings
      WHERE title LIKE ? OR company LIKE ? OR description LIKE ?
      LIMIT 10
    `).all(pattern, pattern, pattern) as any[];

    jobs.forEach(j => {
      results.push({
        type: 'job',
        id: j.id,
        title: j.title,
        subtitle: j.company,
        url: j.url
      });
    });

    // 2. Search Emails
    const emails = db.prepare(`
      SELECT id, subject, from_addr, gmail_message_id
      FROM job_emails
      WHERE subject LIKE ? OR from_addr LIKE ? OR snippet LIKE ?
      LIMIT 10
    `).all(pattern, pattern, pattern) as any[];

    emails.forEach(e => {
      results.push({
        type: 'email',
        id: e.id,
        title: e.subject,
        subtitle: e.from_addr,
        url: e.gmail_message_id ? `https://mail.google.com/mail/u/0/#inbox/${e.gmail_message_id}` : undefined
      });
    });

    // 3. Search Memories
    const memories = db.prepare(`
      SELECT id, content, category
      FROM memories
      WHERE content LIKE ? OR tags LIKE ?
      LIMIT 10
    `).all(pattern, pattern) as any[];

    memories.forEach(m => {
      results.push({
        type: 'memory',
        id: m.id,
        title: m.content.length > 60 ? m.content.slice(0, 60) + '...' : m.content,
        subtitle: `Memory • ${m.category}`,
      });
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
