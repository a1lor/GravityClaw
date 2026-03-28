#!/bin/bash
# Quick script to upload files to Railway volume
# Uses base64 encoding via stdin

set -e

echo "🌱 Uploading files to Railway volume..."

# Upload memory.db
echo "📤 Uploading memory.db..."
cat data/memory.db | base64 | railway ssh "base64 -d > /app/data/memory.db"

# Upload gmail-tokens.json
echo "🔑 Uploading gmail-tokens.json..."
cat data/gmail-tokens.json | base64 | railway ssh "base64 -d > /app/data/gmail-tokens.json"

# Verify
echo ""
echo "📋 Verifying uploads..."
railway ssh "ls -lh /app/data/ && echo '' && echo 'Files in volume:' && ls -1 /app/data/"

echo ""
echo "✅ Upload complete! Restart service with: railway service restart"
