# GravityClaw — Completion Plan
**Date:** 2026-03-29
**Status:** Approved

---

## Overview

Five tracks to complete GravityClaw: make the dashboard and bot feel like one unified system, wire CV content into outreach emails, add company discovery, close the reply-tracking loop, and implement the approved scan progress + classifier fix.

---

## Track 1 — Real-time Unification

### Problem
The dashboard and bot coexist but don't feel like one system. The dashboard only reflects state on page load. There's no way to trigger bot actions from the dashboard, and no visibility into what the agent is doing in real time.

### Design

**A. SSE Event Stream (`/api/events`)**

Add a Server-Sent Events endpoint to the Express server. An in-process `EventEmitter` (`src/events/emitter.ts`) is the shared bus — the bot, heartbeat, and agent loop call `emit(type, payload)` after any meaningful action. The dashboard subscribes on mount and processes events to update React Query cache or append to the activity feed without a full re-fetch.

Event types: `briefing_sent`, `email_scanned`, `outreach_sent`, `job_found`, `reminder_fired`, `agent_response`, `task_started`, `task_completed`.

**B. Action Triggers (`POST /api/actions/:action`)**

Named actions the dashboard can fire:
- `send_briefing` — calls `sendHeartbeatNoNews()`
- `scan_emails` — calls `scanJobEmails(1)`
- `outreach_batch` — calls `startBatch` with limit 5

Each action streams progress back via the SSE bus. The dashboard shows a spinner and then a success/error toast using the same SSE event.

**C. Activity Feed**

New table: `bot_events (id, type TEXT, message TEXT, metadata TEXT, created_at DATETIME)`.

Every SSE emit also writes a row. The Home page renders a live-scrolling feed of the last 20 events, updated in real time via SSE. Each event has a type icon and human-readable message.

**Files changed:**
- `src/events/emitter.ts` — new shared EventEmitter singleton
- `src/dashboard/server.ts` — add `/api/events` SSE route + `/api/actions/:action` route
- `src/heartbeat/heartbeat.ts` — emit events after briefing, scan, outreach
- `src/agent/agent.ts` — emit `agent_response` events
- `src/memory/db.ts` — add `bot_events` table migration
- `src/dashboard-v2/pages/Home/index.tsx` — add ActivityFeed component, wire SSE hook
- `src/dashboard-v2/hooks/useSSE.ts` — new SSE subscription hook

---

## Track 2 — CV → Outreach Email Personalization

### Problem
The CV file is attached to outreach emails but the email body is generated from a hardcoded template. Uploading a new CV doesn't change the email content.

### Design

**CV text extraction on upload**

When a CV is uploaded via `POST /api/cvs`, extract the text content from the PDF buffer using `pdf-parse` (already a lightweight dependency candidate). Store extracted text in a new column: `cv_library.extracted_text TEXT`.

**Inject CV text into generation prompt**

In `generateSpontaneousEmail()` (`src/tools/jobs/spontanee.ts`), query `cv_library` for the most relevant CV (same language-matching logic as `pickCvPath`). If `extracted_text` is present, replace the hardcoded GOLDEN TEMPLATE section with:

```
CANDIDATE CV (use this as the authoritative source of skills, experience, and education):
"""
{extracted_text}
"""
```

The golden template tone/structure instructions remain; only the static background facts are replaced by the actual CV content.

**Migration**

Add `extracted_text TEXT` column to `cv_library` via `ALTER TABLE` in `db.ts` init (safe — column addition is non-destructive). Re-extract text for any existing CV on next upload.

**Files changed:**
- `src/memory/db.ts` — add `extracted_text` column to `cv_library`
- `src/dashboard/api/cvManager.ts` — extract PDF text on upload, store in column
- `src/tools/jobs/spontanee.ts` — inject `extracted_text` into generation prompt
- `package.json` — add `pdf-parse` dependency

---

## Track 3 — Outreach Target Discovery

### Problem
The only way to add outreach targets is via a bot command. There's no dashboard UI, no AI-powered company suggestions, and no connection to the existing job pipeline.

### Design

**A. "Add Target" form in OutreachTab**

A simple inline form at the top of OutreachTab: company name, email, industry (optional). Submits to the existing `POST /api/spontanee` endpoint. No modal needed — inline expand/collapse.

**B. AI Company Discovery (`POST /api/spontanee/discover`)**

New endpoint. Takes optional `count` (default 10) and `industry` hint. Calls GPT-4 with the user's profile context and asks for company + HR email suggestions matching the candidate's profile. Returns an array of suggestion objects `{ company, hr_email, industry, reason }`.

The OutreachTab renders these as "suggestion cards" with a one-click "Add" button. Added companies land in the `pending` list immediately.

**C. Pipeline → Outreach Auto-suggest**

In the Pipeline KanbanTab, when a job card is moved to `rejected`, show a small prompt: "Add [company] to cold outreach?" with Accept/Dismiss. On accept, calls `POST /api/spontanee` to add the target.

**Files changed:**
- `src/dashboard/api/spontanee.ts` — add `discoverTargets` handler
- `src/dashboard/server.ts` — register `POST /api/spontanee/discover` route
- `src/dashboard-v2/pages/Pipeline/OutreachTab.tsx` — add inline Add form + suggestion cards
- `src/dashboard-v2/pages/Pipeline/KanbanTab.tsx` — add rejected → outreach prompt
- `src/dashboard-v2/hooks/useSpontanee.ts` — add `useDiscoverTargets` hook

---

## Track 4 — Outreach Reply Tracking

### Problem
`reply_at` exists in the DB but nothing auto-detects replies to cold outreach emails. Status stays `sent` forever even when someone responds.

### Design

Add a `checkOutreachReplies()` function to `src/tools/gmail/checker.ts`. Called at the end of `runDailyEmailScan()` in the heartbeat.

For each target with `status = 'sent'` and `sent_at IS NOT NULL`, search the Gmail inbox for threads from that `hr_email` address where the thread's latest message date > `sent_at`. If found, set `reply_at = datetime('now')` and `status = 'replied'`.

Uses the existing Gmail API client — no new auth scope needed (already reading inbox). Emits a `outreach_replied` SSE event so the dashboard activity feed updates live.

**Files changed:**
- `src/tools/gmail/checker.ts` — add `checkOutreachReplies()` function
- `src/heartbeat/heartbeat.ts` — call `checkOutreachReplies()` after daily email scan

---

## Track 5 — Scan Progress UI + Classification Fix

Implements the approved spec from `2026-03-23-scan-progress-and-classification-design.md` exactly as written.

**A. Scan Progress UI** (`src/dashboard-v2/pages/Inbox/index.tsx`)

When scanning is active, `ScanButton` expands into a full-width card:
- Phase label: `fetching` → "Fetching emails…", `classifying` → "Classifying emails…", `done` → "✓ Done"
- Percentage: use `progress.processed` directly (already 0–100 integer — fix existing incorrect `Math.round(processed/totalEmails*100)` calculation)
- Full-width progress bar with `#38bdf8` fill and smooth CSS transition
- Counter: "X / Y emails · N matched"
- Post-scan: collapses back to button, shows "✓ N new emails found" for 3s then fades

**B. Email Classification Fix** (`src/tools/gmail/checker.ts`)

Three prompt changes in `classifyEmailsWithAI()`:
1. Remove sender restriction — match any person referencing a CV/application, including founders and managers
2. Add `pending` stage for "we'll keep your CV" responses — maps to `status = 'neutral'`, no pipeline sync
3. Add explicit bilingual instruction — French and English terms in examples

**Files changed:**
- `src/dashboard-v2/pages/Inbox/index.tsx`
- `src/tools/gmail/checker.ts`

---

## Implementation Order

| Order | Track | Reason |
|---|---|---|
| 1 | Track 5 | Smallest, approved spec, zero risk |
| 2 | Track 2 | Self-contained, high value, needed before outreach |
| 3 | Track 4 | Small addition on top of existing scan |
| 4 | Track 3 | Builds on Track 2 being done |
| 5 | Track 1 | Largest, touches many files, best done last |

---

## Files Touched Summary

| File | Tracks |
|---|---|
| `src/events/emitter.ts` | 1 (new) |
| `src/dashboard/server.ts` | 1, 3 |
| `src/dashboard/api/spontanee.ts` | 3 |
| `src/dashboard/api/cvManager.ts` | 2 |
| `src/memory/db.ts` | 1, 2 |
| `src/tools/jobs/spontanee.ts` | 2 |
| `src/tools/gmail/checker.ts` | 4, 5 |
| `src/heartbeat/heartbeat.ts` | 1, 4 |
| `src/agent/agent.ts` | 1 |
| `src/dashboard-v2/hooks/useSSE.ts` | 1 (new) |
| `src/dashboard-v2/hooks/useSpontanee.ts` | 3 |
| `src/dashboard-v2/pages/Home/index.tsx` | 1 |
| `src/dashboard-v2/pages/Inbox/index.tsx` | 5 |
| `src/dashboard-v2/pages/Pipeline/OutreachTab.tsx` | 3 |
| `src/dashboard-v2/pages/Pipeline/KanbanTab.tsx` | 3 |
| `package.json` | 2 |

---

## Out of Scope

- AWS/Railway migration
- New authentication system
- Any changes to the Telegram bot personality or soul.md
- Mobile app
