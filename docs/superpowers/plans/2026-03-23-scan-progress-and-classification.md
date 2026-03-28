# Scan Progress UI & Email Classification Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the inbox scan progress bar prominent and readable, and fix the LLM classifier to catch emails from founders/associates and emails in English or with "pending" responses.

**Architecture:** Two independent edits — (1) restyle the `ScanButton` React component in the frontend, (2) rewrite the LLM prompt string in the backend Gmail checker. No new files, no schema changes, no backend endpoint changes.

**Tech Stack:** React 18 + TypeScript (frontend), Node.js/TypeScript + better-sqlite3 (backend), Gemini Flash via internal `chat()` wrapper, Vite build, PM2 process manager, Railway deployment.

---

## File Map

| File | What changes |
|---|---|
| `src/dashboard-v2/pages/Inbox/index.tsx` | Restyle `ScanButton` scanning state (lines 462–502) |
| `src/tools/gmail/checker.ts` | Replace the prompt string inside `classifyEmailsWithAI()` (lines 66–109) |

---

## Task 1: ScanButton — Prominent Progress Card

**Files:**
- Modify: `src/dashboard-v2/pages/Inbox/index.tsx` (lines 462–502)

### Context

The `ScanButton` component currently renders a tiny 2px-tall progress bar with 10px gray text below the scan button. The `pct` calculation is also wrong: it divides `progress.processed` (already a 0–100 integer) by `progress.totalEmails` (which is a raw email count, not 100), producing incorrect percentages.

The fix replaces the scanning state with a full-width card showing a large % number, a taller progress bar, the phase label, and a counter line.

- [ ] **Step 1: Replace the `ScanButton` return block**

In `src/dashboard-v2/pages/Inbox/index.tsx`, find this block (lines 462–502):

```typescript
  const phaseLabel: Record<string, string> = {
    idle: 'Starting…', fetching: 'Fetching emails…',
    metadata: 'Reading…', classifying: 'AI classifying…',
    done: 'Done!', error: 'Error',
  }
  const pct = progress && progress.totalEmails > 0
    ? Math.round((progress.processed / progress.totalEmails) * 100) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        onClick={startScan} disabled={scanning}
        style={{
          height: 32, padding: '0 14px',
          background: scanning ? 'rgba(56,189,248,0.05)' : 'rgba(56,189,248,0.10)',
          border: '1px solid rgba(56,189,248,0.25)', borderRadius: 8,
          color: scanning ? '#4b5563' : '#38bdf8',
          fontSize: 11, fontWeight: 900, cursor: scanning ? 'not-allowed' : 'pointer',
          letterSpacing: 0.5, transition: 'all 0.2s', whiteSpace: 'nowrap',
        }}
      >
        {scanning ? '⏳ SCANNING…' : '⟳ SCAN EMAILS'}
      </button>
      {scanning && progress && (
        <div style={{ fontSize: 10, color: '#64748b', textAlign: 'center' }}>
          <div>{phaseLabel[progress.phase] ?? progress.phase}</div>
          {pct !== null && (
            <div style={{ marginTop: 3 }}>
              <div style={{ height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: '#38bdf8', transition: 'width 0.5s' }} />
              </div>
              <div style={{ marginTop: 2, color: '#475569' }}>{progress.processed}/{progress.totalEmails} · {progress.matched} matched</div>
            </div>
          )}
        </div>
      )}
      {progress?.phase === 'done' && !scanning && (
        <div style={{ fontSize: 10, color: '#4ade80', textAlign: 'center' }}>✓ {progress.matched} new</div>
      )}
    </div>
  )
```

Replace it with:

```typescript
  const phaseLabel: Record<string, string> = {
    idle: 'Starting…',
    fetching: 'Fetching emails…',
    metadata: 'Reading headers…',
    classifying: 'Classifying emails…',
    done: '✓ Done',
    error: '❌ Error',
  }
  // progress.processed is already a 0–100 integer maintained by the backend.
  // Do NOT divide by totalEmails — that produces wrong values.
  const pct = progress ? progress.processed : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      {scanning && progress ? (
        <div style={{
          background: 'rgba(56,189,248,0.07)',
          border: '1px solid rgba(56,189,248,0.20)',
          borderRadius: 10,
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
              {phaseLabel[progress.phase] ?? progress.phase}
            </span>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#38bdf8', lineHeight: 1 }}>
              {pct}%
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#38bdf8', transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: '#475569' }}>
            {progress.totalEmails > 0 ? `${progress.totalEmails} emails` : 'Loading…'} · {progress.matched} matched
          </div>
        </div>
      ) : (
        <button
          onClick={startScan} disabled={scanning}
          style={{
            height: 32, padding: '0 14px',
            background: 'rgba(56,189,248,0.10)',
            border: '1px solid rgba(56,189,248,0.25)', borderRadius: 8,
            color: '#38bdf8',
            fontSize: 11, fontWeight: 900, cursor: 'pointer',
            letterSpacing: 0.5, transition: 'all 0.2s', whiteSpace: 'nowrap',
          }}
        >
          ⟳ SCAN EMAILS
        </button>
      )}
      {progress?.phase === 'done' && !scanning && (
        <div style={{ fontSize: 10, color: '#4ade80', textAlign: 'center' }}>
          ✓ {progress.matched} new emails found
        </div>
      )}
    </div>
  )
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/davidlitvak/Desktop/GravityClaw/src/dashboard-v2 && npx tsc --noEmit 2>&1
```

Expected: no new errors (pre-existing errors in Pipeline pages are acceptable — they are unrelated).

- [ ] **Step 3: Commit**

```bash
cd /Users/davidlitvak/Desktop/GravityClaw
git add src/dashboard-v2/pages/Inbox/index.tsx
git commit -m "feat(inbox): expand scan progress into prominent full-width card with correct % display"
```

---

## Task 2: Expand Email Classification Prompt

**Files:**
- Modify: `src/tools/gmail/checker.ts` (lines 66–109, the `prompt` const inside `classifyEmailsWithAI`)

### Context

The current prompt restricts matches to emails from "HR departments, recruiters, or hiring platforms" — filtering out founders, associates, and managers who respond directly. It also has no `pending` stage for "we'll keep your CV on file" responses, and no explicit bilingual instruction.

- [ ] **Step 1: Replace the prompt string**

In `src/tools/gmail/checker.ts`, find this block (lines 66–109):

```typescript
    const prompt = `You are reviewing emails for David Litvak, a student searching for an ALTERNANCE (apprenticeship contract) or STAGE (internship) in Data Science / AI in France.

Your job: identify ONLY emails that are DIRECT RESPONSES to alternance/stage applications he submitted to companies.

Mark as a match ONLY if the email is clearly from an HR department, recruiter, or hiring platform confirming they received his application, inviting him to interview, asking him to take a test, rejecting him, or making an offer for an alternance or stage position.

INCLUDE:
- "Nous avons bien reçu votre candidature" / "We received your application"
- Interview invitations (entretien, assessment, test technique)
- Requests to take a quiz, test, coding challenge, personality assessment, or any evaluation
- Recruiter asking to schedule a call or continue the conversation
- Rejections ("votre candidature n'a pas été retenue", "unfortunately")
- Offers for alternance/stage positions
- Direct follow-ups on a submitted application from a company HR/recruiter
- Automated acknowledgments from ATS/HR platforms (Workday, SmartRecruiters, Greenhouse, Lever, Taleo, iCIMS, BambooHR, Welcome to the Jungle) about HIS specific application

EXCLUDE — mark as "NO":
- Job alerts, job recommendations, "new jobs for you"
- LinkedIn notifications, Glassdoor, Indeed, WTTJ digest/promo emails
- Newsletters, marketing, promotional emails
- Cold recruiter outreach (someone contacting him first, not a response to his application)
- Transactional emails (orders, shipping, subscriptions, billing, password resets)
- Social media notifications
- Emails from friends, family, professors, classmates
- School/university administrative emails
- SaaS product updates, developer tool notifications
- Any email NOT specifically about an alternance or stage application he submitted

Be STRICT. When in doubt, mark as "NO". Only real application responses should pass.

For each email, respond with its index and:
- stage: "acknowledgment", "interview", "test", "rejection", "offer", "follow-up", or "NO"
- company: company name (empty string if NO)
- position: position title if known (empty string if unknown or NO)
- action: what David needs to do. One of:
  - "reply" — recruiter expects a response (schedule interview, answer questions, confirm availability)
  - "test" — needs to complete a quiz, coding challenge, assessment, or personality test
  - "none" — no action needed (acknowledgment, rejection, or informational)

Respond with ONLY a JSON array, no explanation. Example:
[{"index":0,"stage":"acknowledgment","company":"BPCE","position":"Data Scientist alternance","action":"none"},{"index":1,"stage":"test","company":"Thales","position":"ML Engineer stage","action":"test"},{"index":2,"stage":"NO","company":"","position":"","action":"none"}]

Emails:
${emailList}`;
```

Replace it with:

```typescript
    const prompt = `You are reviewing emails for David Litvak, a student searching for an ALTERNANCE (apprenticeship contract) or STAGE (internship) in Data Science / AI in France.

Emails may be written in French or English — apply the same rules to both languages equally.

Your job: identify emails that are responses to alternance/stage/job applications he submitted, or direct contact from someone at a company regarding his CV or candidature. This includes responses from HR departments, recruiters, hiring managers, founders, associates, managers, or anyone at a company referencing his CV, candidature, or application.

INCLUDE:
- Any message referencing his CV or candidature: "votre candidature", "votre CV", "your application", "your resume", "mon associé m'a transmis votre candidature"
- Confirmations that an application was received: "Nous avons bien reçu votre candidature" / "We received your application"
- Interview invitations (entretien, assessment, test technique, interview, call)
- Requests to complete a quiz, test, coding challenge, personality assessment, or evaluation
- Recruiters or hiring managers asking to schedule a call or continue the conversation
- Rejections: "votre candidature n'a pas été retenue", "nous ne donnons pas suite", "unfortunately we won't be moving forward", "we regret to inform"
- Offers for alternance/stage/job positions
- Responses that express interest but are not ready yet: "nous garderons votre CV", "nous vous recontacterons", "pas encore prêts", "we'll keep your profile on file", "we'll reach out when ready", "votre profil nous intéresse mais…"
- Automated acknowledgments from ATS/HR platforms (Workday, SmartRecruiters, Greenhouse, Lever, Taleo, iCIMS, BambooHR, Welcome to the Jungle) about HIS specific application

EXCLUDE — mark as "NO":
- Job alerts, job recommendations, "new jobs for you", "offres qui pourraient vous intéresser"
- LinkedIn notifications, Glassdoor, Indeed, WTTJ digest/promo emails
- Newsletters, marketing, promotional emails
- Cold recruiter outreach (someone contacting him first with no reference to a prior application)
- Transactional emails (orders, shipping, subscriptions, billing, password resets)
- Social media notifications
- Emails from friends, family, professors, classmates
- School/university administrative emails
- SaaS product updates, developer tool notifications
- Any email with no reference to a CV, candidature, or application he submitted

Be STRICT on the EXCLUDE list. When in doubt whether an email is a real response to an application he submitted, mark as "NO".

For each email, respond with its index and:
- stage: "acknowledgment", "pending", "interview", "test", "rejection", "offer", "follow-up", or "NO"
  - acknowledgment: application received and being reviewed
  - pending: company is interested but not ready to proceed yet — keeping CV on file, will reach out later
  - interview: invitation to interview or schedule a call
  - test: assessment, coding challenge, or evaluation requested
  - rejection: explicitly not moving forward
  - offer: job/alternance/stage offer made
  - follow-up: recruiter or company checking in with a question
- company: company name (empty string if NO)
- position: position title if known (empty string if unknown or NO)
- action: what David needs to do — one of:
  - "reply" — a response is expected (schedule interview, answer questions, confirm availability)
  - "test" — needs to complete an assessment or challenge
  - "none" — no action needed (acknowledgment, pending, rejection, or informational)

Respond with ONLY a JSON array, no explanation. Example:
[{"index":0,"stage":"acknowledgment","company":"BPCE","position":"Data Scientist alternance","action":"none"},{"index":1,"stage":"pending","company":"Startup IA","position":"Alternance Data","action":"none"},{"index":2,"stage":"test","company":"Thales","position":"ML Engineer stage","action":"test"},{"index":3,"stage":"NO","company":"","position":"","action":"none"}]

Emails:
${emailList}`;
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/davidlitvak/Desktop/GravityClaw && npx tsc --noEmit 2>&1
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/davidlitvak/Desktop/GravityClaw
git add src/tools/gmail/checker.ts
git commit -m "feat(classifier): broaden email classification — bilingual, include founders/managers, add pending stage"
```

---

## Task 3: Build, Restart & Deploy

- [ ] **Step 1: Rebuild the frontend**

```bash
cd /Users/davidlitvak/Desktop/GravityClaw/src/dashboard-v2 && npm run build 2>&1
```

Expected: `✓ built in ~15s` with no errors.

- [ ] **Step 2: Restart PM2**

```bash
pm2 restart gravityclaw --update-env 2>&1
```

Expected: `[gravityclaw](0) ✓` with status `online`.

- [ ] **Step 3: Deploy to Railway**

```bash
cd /Users/davidlitvak/Desktop/GravityClaw && railway up 2>&1
```

Expected: `Uploading…` then build link printed. Wait for Railway to show the service as live.

- [ ] **Step 4: Verify PM2 logs look clean**

```bash
pm2 logs gravityclaw --lines 20 --nostream 2>&1
```

Expected: no crash errors; bot online message visible.
