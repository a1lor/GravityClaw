# Railway Standard Operating Procedures — Gravity Claw v2.0

> **Updated for Railway Volumes** — Secure, persistent storage for production deployments.
> No sensitive data in Docker images. Full data persistence across deploys.

---

## What Changed in v2.0

| v1.0 (Seed Files) | v2.0 (Persistent Volumes) |
|-------------------|---------------------------|
| ❌ Tokens in Docker image | ✅ Tokens only in volume |
| ❌ DB resets on deploy | ✅ DB persists across deploys |
| ❌ Security risk | ✅ Production-grade security |
| Manual seed file management | One-time volume setup |

---

## Your Project Details

Fill these in once, then reference them throughout:

| Key | Your Value |
|-----|------------|
| **Project Name** | GravityClaw |
| **Service Name** | GravityClaw |
| **Environment** | production |
| **Volume Name** | gravityclaw-volume |
| **Volume Mount** | /app/data |
| **Project Directory** | /Users/davidlitvak/Desktop/GravityClaw |

---

## Prerequisites

1. **Railway CLI installed**
   ```bash
   npm install -g @railway/cli
   railway --version
   ```

2. **Logged in**
   ```bash
   railway login --browserless
   ```

3. **Project linked**
   ```bash
   cd /Users/davidlitvak/Desktop/GravityClaw
   railway link
   # Select: GravityClaw (production)
   ```

4. **Environment variables set on Railway**
   ```bash
   railway variables set TELEGRAM_BOT_TOKEN="your-token"
   railway variables set OPENROUTER_API_KEY="your-key"
   railway variables set GOOGLE_CLIENT_ID="your-client-id"
   railway variables set GOOGLE_CLIENT_SECRET="your-client-secret"
   railway variables set PINECONE_API_KEY="your-pinecone-key"
   # Add all other vars from .env
   ```

5. **Railway Volume configured** ✅ (already exists at /app/data)
   ```bash
   railway volume list
   # Should show: gravityclaw-volume mounted at /app/data
   ```

---

## One-Time Setup: Seed the Volume

**Do this ONCE after initial deployment.** See [RAILWAY_VOLUME_SETUP.md](../scripts/RAILWAY_VOLUME_SETUP.md) for detailed instructions.

Quick version:
```bash
# 1. Encode files locally
base64 -i data/memory.db > /tmp/memory.db.b64
base64 -i data/gmail-tokens.json > /tmp/gmail-tokens.json.b64

# 2. SSH into Railway and upload (paste base64 content)
railway ssh

# 3. In Railway shell:
# ... follow RAILWAY_VOLUME_SETUP.md instructions

# 4. Restart
railway service restart
```

---

## The Dev Cycle

```
1. Test Locally  →  2. Deploy  →  3. Verify
```

### Phase 1: Test Locally

Start the local dev server with hot-reload:

```bash
npm run dev
```

**Note:** Local dev uses `/Users/davidlitvak/Desktop/GravityClaw/data/` — separate from Railway volume.

When done, stop the local server (`Ctrl+C`).

---

### Phase 2: Deploy to Railway

Once you're happy with the changes:

**2a. Type-check** to catch errors before deploying:

```bash
npx tsc --noEmit
```

**2b. Set new env vars** (if you added any):

```bash
railway variables set NEW_VAR_NAME="value"
```

**2c. Deploy:**

```bash
railway up --detach
```

This triggers a Docker build on Railway. Takes ~60–90 seconds. **Your data persists** — no reset.

---

### Phase 3: Verify

Wait ~60 seconds for the build to finish, then check logs:

```bash
railway logs --lines 50
```

**All of these should appear:**

- ✅ `💾 SQLite database: /app/data/memory.db`
- ✅ `💾 SQLite memory database ready`
- ✅ `📱 Phone access: http://...` (dashboard)
- ✅ `🤖 Gravity Claw online`
- No crash traces or unhandled errors

**Test Gmail integration:**
Send a message to your bot: "Check for new job emails"

---

## Quick Reference

| Task | Command |
|------|---------|
| Start local dev | `npm run dev` |
| Type-check | `npx tsc --noEmit` |
| Deploy to Railway | `railway up --detach` |
| View live logs | `railway logs --lines 100` |
| Set a new env var | `railway variables set KEY="value"` |
| List all env vars | `railway variables` |
| Open dashboard | `railway open` |
| Check volume status | `railway volume list` |
| SSH into Railway | `railway ssh` |
| Restart service | `railway service restart` |

---

## Data Persistence

### What Persists (in Volume)

✅ `memory.db` — Full SQLite database with conversations, emails, jobs, profile
✅ `gmail-tokens.json` — OAuth tokens (auto-refreshed)
✅ `notes/` — Exported notes and documents
✅ `cv/` — CV and application materials
✅ Pinecone vector memory (cloud-hosted)

### What Resets (Ephemeral)

❌ Logs (use `railway logs` to view)
❌ Temporary files in `/tmp`

---

## Backup Strategy

**Monthly backup recommended:**

```bash
# Download database from Railway
railway ssh "cat /app/data/memory.db | base64" | base64 -d > data/backups/memory-$(date +%Y%m%d).db

# Download Gmail tokens
railway ssh "cat /app/data/gmail-tokens.json" > data/backups/gmail-tokens-$(date +%Y%m%d).json
```

Create backup directory:
```bash
mkdir -p data/backups
echo "data/backups/*.db" >> .gitignore
echo "data/backups/*.json" >> .gitignore
```

---

## Security Notes

✅ **No sensitive data in Docker images** — Tokens and DB only in Railway volume
✅ **Volume data encrypted at rest** — Railway handles encryption
✅ **OAuth tokens auto-refresh** — No manual rotation needed
✅ **Whitelist enforced** — Only your Telegram ID can access the bot

**What's safe to commit:**
- `src/` code
- `soul.md` (personal context, but no secrets)
- `Dockerfile`, `.dockerignore`
- `railway.json`

**NEVER commit:**
- `.env` files
- `data/*.db` files
- `data/*-tokens.json` files

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| **Build failed** | Run `railway logs --lines 100` — look for npm or TypeScript errors |
| **Bot crashes on startup** | Check for missing env vars: `railway variables` |
| **Gmail integration not working** | Verify tokens uploaded to volume: `railway ssh "ls -lh /app/data/"` |
| **Database empty after deploy** | Volume not seeded — see [RAILWAY_VOLUME_SETUP.md](../scripts/RAILWAY_VOLUME_SETUP.md) |
| **Need to rollback** | Fix the issue locally, then `railway up --detach` again |
| **Volume full** | Check usage: `railway volume list`, upgrade if needed |

---

## Migration from v1.0 to v2.0

If you previously used seed files:

1. ✅ Code already updated (Dockerfile, .dockerignore, src/index.ts)
2. ✅ Volume already exists
3. ⚠️ **Action required:** Seed the volume (see [RAILWAY_VOLUME_SETUP.md](../scripts/RAILWAY_VOLUME_SETUP.md))
4. ⚠️ **Action required:** Deploy updated code: `railway up --detach`

---

## AI Agent Skill (for Claude Code / Antigravity)

The Railway deploy skill has been updated to work with volumes. No changes needed to `.agent/` files.

---

**Last updated:** 2026-03-12
**Version:** 2.0 (Persistent Volumes)
