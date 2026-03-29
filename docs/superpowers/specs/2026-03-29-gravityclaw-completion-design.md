# GravityClaw — Completion Plan
**Date:** 2026-03-29
**Status:** Approved

---

## Overview

Five tracks to complete GravityClaw: make the dashboard and bot feel like one unified system, wire CV content into outreach emails, add company discovery, close the reply-tracking loop, and implement the scan progress UI + classifier fix.

---

## Track 1 — Real-time Unification

### Problem
The dashboard and bot coexist but don't feel like one system. The dashboard only reflects state on page load. There's no way to trigger bot actions from the dashboard, and no visibility into what the agent is doing in real time.

### Design

**A. SSE Event Stream (`/api/events`)**

Add a Server-Sent Events endpoint to the Express server. An in-process `EventEmitter` (`src/events/emitter.ts`) is the shared bus — the bot, heartbeat, and agent loop call `emit(type, payload)` after any meaningful action. The dashboard subscribes on mount and processes events to update React Query cache or append to the activity feed without a full re-fetch.

Event types (canonical list):
- `briefing_sent` — morning briefing delivered
- `email_scanned` — daily Gmail scan completed, payload: `{ count: number }`
- `outreach_sent` — cold outreach email sent, payload: `{ company: string }`
- `outreach_replied` — reply detected to cold outreach, payload: `{ company: string, targetId: number }`
- `job_found` — new job posting discovered, payload: `{ title: string, company: string }`
- `reminder_fired` — reminder delivered to user, payload: `{ message: string }`
- `agent_response` — agent completed a turn, payload: `{ summary: string }`
- `task_started` — background task started, payload: `{ taskId: string, label: string }`
- `task_completed` — background task finished, payload: `{ taskId: string, success: boolean }`

**SSE connection lifecycle:**

The `/api/events` handler must:
1. Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Connection: keep-alive`
2. Add the response object to an in-memory `clients: Set<Response>` on the emitter
3. On `req.on('close')`, remove the response from `clients` to prevent memory leaks on page reload
4. Send a `keep-alive` comment (`: ping`) every 30 seconds to prevent proxy/browser timeouts

If a `POST /api/actions/:action` is fired while no SSE client is connected, the action still executes — it writes a `bot_events` row and the dashboard can read it on next reconnect. The UI should show a "connecting…" state on the activity feed when SSE is not established, and fall back to a one-time fetch of recent `bot_events` rows.

**B. Action Triggers (`POST /api/actions/:action`)**

Named actions the dashboard can fire:
- `send_briefing` — calls `sendHeartbeatNoNews()`
- `scan_emails` — calls `scanJobEmails(1)`
- `outreach_batch` — calls `startBatch` with limit 5

Each action runs async and emits an SSE event on completion. The dashboard shows a loading state on the trigger button, resolved by the corresponding SSE completion event (or a 30s timeout fallback).

**C. Activity Feed**

New table:
```sql
CREATE TABLE IF NOT EXISTS bot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,  -- JSON string, nullable
  created_at DATETIME DEFAULT (datetime('now'))
)
```

`metadata` is always a JSON object stringified, or NULL. Schema per event type:
- `email_scanned`: `{ "count": 3 }`
- `outreach_sent`: `{ "company": "Acme", "targetId": 12 }`
- `outreach_replied`: `{ "company": "Acme", "targetId": 12 }`
- `job_found`: `{ "title": "ML Engineer", "company": "Acme", "jobId": 42 }`
- `reminder_fired`: `{ "message": "Call recruiter" }`
- `agent_response`: `{ "summary": "Drafted follow-up for Acme" }`
- `task_started`/`task_completed`: `{ "taskId": "abc123", "label": "Outreach batch" }`
- `briefing_sent`, `reminder_fired` with no extra data: `null`

Every SSE emit also inserts a `bot_events` row. The Home page renders a live-scrolling feed of the last 20 events, updated in real time via SSE. Each event type maps to an icon and a human-readable message string.

**`agent.ts` emit location:** The emit call goes at the end of the agent loop's response handler, after the assistant message is saved to the conversation. Payload summary is the first 100 chars of the assistant's message content.

**Files changed:**
- `src/events/emitter.ts` — new shared EventEmitter singleton + `clients` Set + `emitEvent()` helper
- `src/dashboard/server.ts` — add `/api/events` SSE route (with lifecycle handling) + `/api/actions/:action` route
- `src/heartbeat/heartbeat.ts` — emit events after briefing, scan, outreach
- `src/agent/agent.ts` — emit `agent_response` after each completed turn
- `src/memory/db.ts` — add `bot_events` table migration
- `src/dashboard-v2/pages/Home/index.tsx` — add ActivityFeed component, wire SSE hook
- `src/dashboard-v2/hooks/useSSE.ts` — new SSE subscription hook with reconnect logic

---

## Track 2 — CV → Outreach Email Personalization

### Problem
The CV file is attached to outreach emails but the email body is generated from a hardcoded template. Uploading a new CV doesn't change the email content.

### Design

**CV text extraction on upload**

When a CV is uploaded via `POST /api/cvs`, extract the text content from the PDF buffer using `pdf-parse`. Store extracted text in a new column: `cv_library.extracted_text TEXT`.

Add both `pdf-parse` and `@types/pdf-parse` to `package.json` dependencies (the package does not ship bundled TypeScript declarations). Enforce a 5 MB max file size on the upload handler (multer `limits.fileSize` is already set to 10 MB in server.ts — tighten to 5 MB for CV uploads specifically, or add a guard in cvManager.ts).

**Inject CV text into generation prompt**

In `generateSpontaneousEmail()` (`src/tools/jobs/spontanee.ts`), query `cv_library` for the most relevant CV (same language-matching logic as `pickCvPath`). If `extracted_text` is present, replace the hardcoded GOLDEN TEMPLATE section with:

```
CANDIDATE CV (use this as the authoritative source of skills, experience, and education):
"""
{extracted_text}
"""
```

The golden template tone/structure instructions (JSON format, paragraph breaks, vouvoiement, etc.) remain. Only the static background facts are replaced by the actual CV content. If no `extracted_text` is available (old upload pre-migration), fall back to the existing hardcoded template.

**Migration**

Add `extracted_text TEXT` column to `cv_library` via `ALTER TABLE` in `db.ts` init (safe — non-destructive). Existing CV rows get `extracted_text = NULL` and fall back to the hardcoded template until re-uploaded.

**Files changed:**
- `src/memory/db.ts` — add `extracted_text` column to `cv_library`
- `src/dashboard/api/cvManager.ts` — extract PDF text on upload, enforce 5 MB limit, store in column
- `src/tools/jobs/spontanee.ts` — inject `extracted_text` into generation prompt, fall back to template if NULL
- `package.json` — add `pdf-parse` and `@types/pdf-parse` dependencies

---

## Track 3 — Outreach Target Discovery

### Problem
The only way to add outreach targets is via a bot command. There's no dashboard UI, no AI-powered company suggestions, and no connection to the existing job pipeline.

### Design

**A. "Add Target" form in OutreachTab**

A simple inline form at the top of OutreachTab: company name (required), HR email (required, validated as RFC 5322 email format before submit), industry (optional). Submits to the existing `POST /api/spontanee` endpoint. Inline expand/collapse — no modal.

**B. AI Company Discovery (`POST /api/spontanee/discover`)**

New endpoint. **Must be registered before any parameterized spontanee routes in server.ts** (e.g., before `GET /api/spontanee/:id`) to prevent Express matching `/discover` as a parameter value.

Takes optional `count` (default 10) and `industry` hint. Calls GPT-4 with the user's profile context and asks for company + HR email suggestions. Returns an array: `{ company: string, hr_email: string, industry: string, reason: string }[]`.

**Email validation:** The backend validates each returned `hr_email` against a basic regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) before returning it to the frontend. Entries that fail validation are either discarded or returned with `hr_email: ""` so the user must fill it in manually before adding. This prevents hallucinated non-email strings from entering the DB.

The OutreachTab renders suggestions as cards with a one-click "Add" button. Added companies land in the `pending` list immediately.

**C. Pipeline → Outreach Auto-suggest**

In KanbanTab, when a job card is moved to `rejected`, show an inline prompt: "Add [company] to cold outreach?" with Accept / Dismiss. Dismiss state is stored in `localStorage` keyed by `outreach_dismissed_{jobId}` so it does not re-appear after page reload. On accept, calls `POST /api/spontanee`.

**Files changed:**
- `src/dashboard/api/spontanee.ts` — add `discoverTargets` handler with email validation
- `src/dashboard/server.ts` — register `POST /api/spontanee/discover` route **before** parameterized spontanee routes
- `src/dashboard-v2/pages/Pipeline/OutreachTab.tsx` — add inline Add form + suggestion cards
- `src/dashboard-v2/pages/Pipeline/KanbanTab.tsx` — add rejected → outreach prompt with localStorage dismiss
- `src/dashboard-v2/hooks/useSpontanee.ts` — add `useDiscoverTargets` hook

---

## Track 4 — Outreach Reply Tracking

### Problem
`reply_at` exists in the DB but nothing auto-detects replies to cold outreach emails. Status stays `sent` forever even when someone responds.

### Design

Add a `checkOutreachReplies()` function to `src/tools/gmail/checker.ts`. Called at the end of `runDailyEmailScan()` in the heartbeat.

**Gmail search strategy:**

1. Fetch all targets with `status = 'sent' AND sent_at IS NOT NULL` in a single DB query.
2. Group targets into batches of 10. For each batch, build a single Gmail search query:
   `from:(email1 OR email2 OR ...) after:{unix_epoch_of_earliest_sent_at_in_batch}`
   This avoids one API call per target and stays well within Gmail quota (250 units/sec; `messages.list` costs 5 units).
3. For each matching message, check if `message.internalDate > target.sent_at` **AND** the message is not from the bot's own sent address (exclude self-sent messages). This handles the off-by-one: the sent outreach itself lives in Gmail Sent, not Inbox — searching Inbox from that address will only surface genuine replies.
4. If a match is found for a target, set `reply_at = datetime('now')` and `status = 'replied'`.

Emits an `outreach_replied` SSE event per reply detected. **Note:** if Track 1 (SSE emitter) is not yet implemented, stub the emit call as a no-op import: `import { emitEvent } from '../events/emitter.js'` — the function will be implemented in Track 1. Do not block Track 4 on Track 1.

**Files changed:**
- `src/tools/gmail/checker.ts` — add `checkOutreachReplies()` function
- `src/heartbeat/heartbeat.ts` — call `checkOutreachReplies()` after daily email scan

---

## Track 5 — Scan Progress UI + Classification Fix

### Problem
The scan progress bar is visually small and easy to miss. The email classifier misses direct replies from founders and managers, doesn't handle "we'll keep your CV" responses, and only matches French.

### Design

**A. Scan Progress UI** (`src/dashboard-v2/pages/Inbox/index.tsx`)

The `ScanButton` component polls `/api/emails/scan/progress`. The `progress.processed` field is already a 0–100 integer maintained by the backend (during `metadata` phase it tracks 0→50; during `classifying` it tracks 50→100). The existing code incorrectly computes `Math.round((progress.processed / progress.totalEmails) * 100)` — this treats `processed` as a raw count divided by a denominator that is not 100, producing wrong values. **Fix: replace with `pct = progress.processed` directly.**

When scanning is active, `ScanButton` expands into a full-width card:

```
┌─────────────────────────────────┐
│  ⏳ CLASSIFYING EMAILS…         │
│  ████████████░░░░░░  62%        │
│  124 / 200 emails · 8 matched   │
└─────────────────────────────────┘
```

- **Phase label** (14px prominent): maps phases to human-readable text:
  - `fetching` → "Fetching emails…"
  - `metadata` → "Reading headers…"
  - `classifying` → "Classifying emails…"
  - `done` → "✓ Done"
  - `error` → "❌ Error"
- **Percentage** (20px bold): `progress.processed` directly (0–100 integer)
- **Progress bar**: full-width, fills with `#38bdf8`, smooth CSS transition
- **Counter** (11px muted): "X / Y emails · N matched" — note `totalEmails` denominator changes meaning mid-scan (this is expected and acceptable)
- **Post-scan**: collapses back to button, shows "✓ N new emails found" for 3 seconds then fades

No backend changes needed.

**B. Email Classification Fix** (`src/tools/gmail/checker.ts`)

Three changes to the prompt in `classifyEmailsWithAI()`:

1. **Remove sender restriction**: replace "HR departments, recruiters, or hiring platforms" with: *"any person or company who references a CV, candidature, application, or job opening that David applied to — including founders, managers, associates, hiring managers, or automated systems"*

2. **Add `pending` stage**: *"for responses that express interest but are not ready to proceed — e.g. 'we'll keep your CV on file', 'we're not ready yet but will reach out', 'pas encore prêts mais votre profil nous intéresse', 'nous garderons votre candidature'"*. Maps to `status = 'neutral'`, no pipeline sync (existing fallback handles unknown stages correctly — no code change to `stageToStatus()` needed).

3. **Explicit bilingual instruction**: *"Emails may be written in French or English. Apply the same rules to both languages."* Include key terms in both languages in examples.

**Domain blocklist (`isExcludedSender`) stays unchanged** — correctly blocks `no-reply`, `noreply`, `notifications@`, `info@` noise before LLM.

**Files changed:**
- `src/dashboard-v2/pages/Inbox/index.tsx` — restyle ScanButton scanning state
- `src/tools/gmail/checker.ts` — update `classifyEmailsWithAI()` prompt string only

---

## Implementation Order

| Order | Track | Reason |
|---|---|---|
| 1 | Track 5 | Smallest, self-contained, zero risk |
| 2 | Track 2 | Self-contained, high value, needed before outreach |
| 3 | Track 3 | Builds on Track 2 (CV extraction) being done |
| 4 | Track 4 | Small addition; stub SSE emit if Track 1 not yet done |
| 5 | Track 1 | Largest, touches many files, wires everything together last |

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
