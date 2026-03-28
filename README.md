# 🪐 GravityClaw

> An autonomous AI job-hunting agent built with TypeScript, Telegram, and GPT-4. It crawls job boards, manages recruiter email conversations, generates tailored cover letters, and presents everything through a real-time dashboard — so you never miss an opportunity.

---

## ✨ What It Does

GravityClaw is a **personal AI agent** that runs 24/7 on Railway and handles the entire job-search pipeline:

| Agent Capability | Description |
|---|---|
| 🔍 **Job Discovery** | Scrapes job boards and scores listings using AI based on your profile |
| 📧 **Email Intelligence** | Syncs Gmail, threads recruiter conversations, and flags replies needing attention |
| ✍️ **Cover Letter Studio** | Generates tailored cover letters for any posting with background AI processing |
| 🧠 **Persistent Memory** | Stores and evolves memories using Pinecone vector search |
| 📅 **Calendar Awareness** | Connects to Apple iCloud Calendar via CalDAV to surface upcoming interviews |
| 📣 **Spontaneous Outreach** | Proactively drafts cold outreach to companies you haven't applied to yet |
| ⏰ **Reminders** | Set reminders directly in chat — checked every minute via heartbeat cron |
| 🖥️ **Live Dashboard** | Real-time web dashboard showing KPIs, pipeline status, inbox, and agent activity |

---

## 🏗️ Architecture

```
GravityClaw/
├── src/
│   ├── agent/          # Core GPT-4 agent loop + tool orchestration
│   ├── tools/          # Tool definitions (Gmail, calendar, memory, jobs...)
│   ├── memory/         # SQLite DB + Pinecone vector store + memory evolution
│   ├── heartbeat/      # Cron scheduler (reminders, daily briefing, job polling)
│   ├── dashboard/      # Express REST API serving the web dashboard
│   └── dashboard-v2/   # React-based dashboard UI (Vite)
├── data/
│   ├── soul.md         # The agent's persona, values, and directives
│   └── memory.db       # SQLite database (gitignored)
├── Dockerfile
└── railway.toml
```

**Tech Stack:**
- **Runtime:** Node.js 20 + TypeScript
- **AI:** OpenAI GPT-4o (agent) + `text-embedding-3-small` (memory embeddings)
- **Vector DB:** Pinecone
- **Database:** SQLite (`better-sqlite3`)
- **Interface:** Telegram Bot API
- **Email:** Gmail API (OAuth2)
- **Calendar:** Apple iCloud CalDAV
- **Dashboard:** Express + React (Vite) + TypeScript
- **Deployment:** Railway (with persistent volume for SQLite)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- An OpenAI API key
- A Pinecone account + index
- A Gmail account with OAuth2 credentials
- A Railway account (for deployment)

### Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-username/GravityClaw.git
cd GravityClaw

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in your values in .env

# 4. Run the agent
npm run dev

# 5. Run the dashboard (separate terminal)
cd src/dashboard-v2 && npm install && npm run dev
```

---

## 🔑 Environment Variables

See [`.env.example`](.env.example) for all required variables. Key ones:

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `OPENAI_API_KEY` | OpenAI API key |
| `PINECONE_API_KEY` | Pinecone API key |
| `PINECONE_INDEX` | Name of your Pinecone index |
| `GMAIL_CLIENT_ID` | Gmail OAuth2 client ID |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth2 client secret |
| `APPLE_CALENDAR_URL` | Your iCloud CalDAV URL |
| `DASHBOARD_TOKEN` | Bearer token to protect the dashboard |

---

## 🌐 Deployment (Railway)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway up

# Add persistent volume for SQLite database
railway volume add --mount /app/data
```

Set all environment variables in your Railway project dashboard under **Variables**.

---

## 🖥️ Dashboard

The web dashboard runs on port `3200` and provides:
- **Home:** KPI overview + "Needs Attention" intelligence feed
- **Pipeline:** AI-scored job listings with Kanban-style stage tracking
- **Inbox:** Threaded Gmail conversations with split-pane view
- **Agent:** Live chat with the AI + memory browser
- **⌘K Command Bar:** Global search across jobs, emails, and memories

Protected by a `DASHBOARD_TOKEN` bearer token in production.

---

## 📁 Key Files

| File | Purpose |
|---|---|
| `data/soul.md` | The agent's core identity and behavioural directives |
| `src/agent/agent.ts` | Main agent loop — processes messages, calls tools |
| `src/memory/db.ts` | All SQLite interactions + schema setup |
| `src/heartbeat/heartbeat.ts` | Cron jobs: daily briefing, job polling, reminders |
| `src/dashboard/server.ts` | Express API powering the dashboard |

---

## ⚠️ Disclaimer

This project is built for personal use and interfaces with real email accounts and external APIs. Never commit real credentials — always use environment variables.

---

*Built by David Litvak — because job hunting deserved a smarter system.*
