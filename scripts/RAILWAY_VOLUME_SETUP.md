# Railway Volume Setup — One-Time Manual Process

This guide walks you through seeding your Railway volume with the database and Gmail tokens **securely** (no sensitive data in Docker images).

## Prerequisites

✅ Railway volume exists at `/app/data` (check with `railway volume list`)
✅ Code deployed to Railway (run `railway up --detach`)
✅ Local files ready: `data/memory.db`, `data/gmail-tokens.json`

---

## Method 1: Direct SSH Upload (Recommended)

### Step 1: Prepare local files
```bash
# From your project root
cd /Users/davidlitvak/Desktop/GravityClaw

# Encode files to base64 for safe transfer
base64 -i data/memory.db > /tmp/memory.db.b64
base64 -i data/gmail-tokens.json > /tmp/gmail-tokens.json.b64
```

### Step 2: SSH into Railway
```bash
railway ssh
```

### Step 3: Upload memory.db
In the Railway SSH session, run:
```bash
# Create a temp file and paste the base64 content
cat > /tmp/memory.db.b64 << 'EOF'
# Now paste the content from /tmp/memory.db.b64 on your local machine
# (Open /tmp/memory.db.b64 in a text editor, copy all, paste here)
EOF

# Decode and move to volume
base64 -d /tmp/memory.db.b64 > /app/data/memory.db
rm /tmp/memory.db.b64
```

### Step 4: Upload gmail-tokens.json
Still in Railway SSH:
```bash
cat > /tmp/gmail-tokens.json.b64 << 'EOF'
# Paste content from /tmp/gmail-tokens.json.b64
EOF

base64 -d /tmp/gmail-tokens.json.b64 > /app/data/gmail-tokens.json
rm /tmp/gmail-tokens.json.b64
```

### Step 5: Verify and exit
```bash
ls -lh /app/data/
# Should show: memory.db, gmail-tokens.json, soul.md, notes/, cv/

exit
```

### Step 6: Restart Railway service
```bash
railway service restart
```

---

## Method 2: Quick One-Liner (If SSH Supports Piping)

Try this faster method if your Railway SSH supports stdin:

```bash
# From local terminal
cat data/memory.db | base64 | railway ssh "base64 -d > /app/data/memory.db"
cat data/gmail-tokens.json | base64 | railway ssh "base64 -d > /app/data/gmail-tokens.json"

railway ssh "ls -lh /app/data/"
railway service restart
```

---

## Verification

Check the Railway logs to ensure everything works:

```bash
railway logs --lines 50
```

Look for:
- ✅ `💾 SQLite database: /app/data/memory.db`
- ✅ `💾 SQLite memory database ready`
- ✅ `🤖 Gravity Claw online`
- ✅ No Gmail auth errors

Test Gmail integration by messaging your bot: "Check for new job emails"

---

## Cleanup

After successful upload, remove the local base64 files:

```bash
rm /tmp/memory.db.b64 /tmp/gmail-tokens.json.b64
```

---

## Security Notes

✅ **Tokens never in Docker image** — Only in Railway's persistent volume
✅ **Volume data persists** — Survives redeploys
✅ **No seed files in git** — `.gitignore` excludes `data/*.json` and `data/*.db`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `base64: command not found` | Railway's Alpine image has `base64`, try `which base64` |
| Permission denied on `/app/data/` | Volume not mounted, run `railway volume list` |
| Database locked error | Stop the service first: `railway service stop` |
| Gmail tokens invalid | Re-authenticate locally, then re-upload |

---

## Backup Strategy

Since the volume persists, periodically back it up:

```bash
# Download from Railway
railway ssh "cat /app/data/memory.db" | base64 -d > data/memory-backup-$(date +%Y%m%d).db
railway ssh "cat /app/data/gmail-tokens.json" > data/gmail-tokens-backup.json
```
