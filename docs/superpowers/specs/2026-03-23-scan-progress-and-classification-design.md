# Scan Progress UI & Email Classification Fix

**Date:** 2026-03-23
**Status:** Approved

---

## Overview

Two improvements to the GravityClaw inbox scan flow:

1. **Progress UI** — Make the scan progress bar prominent and readable during scanning
2. **Classification fix** — Broaden the LLM prompt to catch emails missed due to sender restrictions and language limitations

---

## 1. Scan Progress UI

### Problem

The `ScanButton` component already polls `/api/emails/scan/progress` and renders a progress bar, but the display is visually small and easy to miss — the bar and stats appear below a tiny button with minimal styling.

### Design

When scanning is active, the `ScanButton` expands into a full-width card that replaces the button text:

```
┌─────────────────────────────────┐
│  ⏳ CLASSIFYING EMAILS…         │
│  ████████████░░░░░░  62%        │
│  124 / 200 emails · 8 matched   │
└─────────────────────────────────┘
```

**Components:**
- **Phase label** (14px, prominent): maps phases to human-readable text:
  - `fetching` → "Fetching emails…"
  - `metadata` → "Reading headers…"
  - `classifying` → "Classifying emails…"
  - `done` → "✓ Done"
  - `error` → "❌ Error"
- **Percentage number** (20px bold): render `progress.processed` directly as the percentage — it is already a 0–100 integer maintained by the backend (not a raw email count). During the metadata phase it tracks 0→50; during classifying it tracks 50→100. **Implementation note:** the existing code computes `Math.round((progress.processed / progress.totalEmails) * 100)` which produces incorrect values because `totalEmails` is not 100. Replace with `pct = progress.processed`.
- **Progress bar**: full-width, fills with `#38bdf8` (existing brand color), smooth CSS transition
- **Counter line** (11px, muted): "X / Y emails · N matched" — note that `scanProgress.totalEmails` changes meaning mid-scan: during metadata it reflects the full paginated message count; during classifying it resets to the count of emails that passed the domain filter. This denominator jump is expected and acceptable.
- **Post-scan**: collapses back to the scan button + shows "✓ N new emails found" for 3 seconds then fades

**Files changed:**
- `src/dashboard-v2/pages/Inbox/index.tsx` — restyle the `ScanButton` component's scanning state

No backend changes needed — progress polling infrastructure already works correctly.

---

## 2. Email Classification Fix

### Problem

The LLM classifier prompt in `src/tools/gmail/checker.ts` has three issues:

1. **Sender restriction**: only matches emails from "HR departments, recruiters, or hiring platforms" — filters out direct responses from founders, managers, and associates who reply to applications personally
2. **Missing stage**: no stage for "on hold / we'll keep your CV" responses — these default to `NO` and are discarded
3. **French-only focus**: prompt uses French terms only; English-language responses may be missed

### Design

**Prompt changes** (in `classifyEmailsWithAI()`, `src/tools/gmail/checker.ts`):

1. Remove sender restriction. New wording: *"any person or company who references a CV, candidature, application, or job opening that David applied to — including founders, managers, associates, hiring managers, or automated systems"*

2. Add `"pending"` to the stage list: *for responses that express interest but are not ready to proceed — e.g. "we'll keep your CV on file", "we're not ready yet but will reach out", "pas encore prêts mais votre profil nous intéresse", "nous garderons votre candidature"*

3. Explicit bilingual instruction: *"Emails may be written in French or English. Apply the same rules to both languages."* Include key terms in both languages in the examples.

**Implementation notes for `pending` stage:**

- `stageToStatus()` in `classifyEmailsWithAI()` already maps any stage that is not `interview`, `offer`, `test`, or `rejection` to `"neutral"` — so `pending` will store `status = 'neutral'` in `job_emails` without any code change to that function.
- The pipeline sync is a ternary chain (not a switch): unknown stages resolve to `null`, skipping the `syncEmailToPipeline` call entirely. No code change needed — `pending` emails correctly leave the pipeline stage unchanged (job stays `applied`).
- No DB schema changes needed — `job_emails.stage` is TEXT with no constraints.

**Updated stage → DB mapping:**

| Stage | `status` | `action_needed` | Pipeline sync |
|---|---|---|---|
| `acknowledgment` | `neutral` | `none` | `applied` |
| `pending` | `neutral` | `none` | no change (stays `applied`) |
| `interview` | `positive` | `reply` | `interview` |
| `test` | `positive` | `test` | no change |
| `rejection` | `negative` | `none` | `rejected` |
| `offer` | `positive` | `reply` | `offer` |
| `follow-up` | `neutral` | `reply` | — |

**Domain blocklist (`isExcludedSender`) — explicitly out of scope:**

The upstream `isExcludedSender()` filter (lines 20–35 of `checker.ts`) silently drops emails from domains like `no-reply`, `noreply`, `notifications@`, and `info@` before they reach the LLM. This filter is intentionally left unchanged — it correctly blocks newsletter/automated noise. If a genuine recruiter ever sends from a `noreply@` address, that is an edge case to handle separately.

**Files changed:**
- `src/tools/gmail/checker.ts` — update `classifyEmailsWithAI()` prompt string only

---

## Files Touched

| File | Change |
|---|---|
| `src/dashboard-v2/pages/Inbox/index.tsx` | Restyle `ScanButton` scanning state |
| `src/tools/gmail/checker.ts` | Expand LLM classification prompt |

---

## Out of Scope

- Backend progress endpoint: already works, no changes needed
- Database schema: no migrations needed (`stage` is TEXT, `pending` fits existing column)
- Frontend rebuild + Railway deploy: required after both changes are complete
