#!/bin/bash
# Seed Railway volume with database and Gmail tokens
# Run this ONCE after first Railway deployment using Railway SSH

set -e

echo "🌱 Seeding Railway volume via SSH..."
echo ""

# Check if required files exist
if [ ! -f "data/memory.db" ]; then
    echo "❌ Error: data/memory.db not found locally"
    exit 1
fi

if [ ! -f "data/gmail-tokens.json" ]; then
    echo "❌ Error: data/gmail-tokens.json not found locally"
    exit 1
fi

echo "📋 Instructions for manual seeding:"
echo ""
echo "1. Encode files locally:"
echo "   base64 -i data/memory.db > /tmp/memory.db.b64"
echo "   base64 -i data/gmail-tokens.json > /tmp/gmail-tokens.json.b64"
echo ""
echo "2. SSH into Railway:"
echo "   railway ssh"
echo ""
echo "3. On Railway shell, paste the base64 content and decode:"
echo "   # For memory.db:"
echo "   cat > /tmp/memory.db.b64 << 'EOF'"
echo "   <paste base64 content>"
echo "   EOF"
echo "   base64 -d /tmp/memory.db.b64 > /app/data/memory.db"
echo ""
echo "   # For gmail-tokens.json:"
echo "   cat > /tmp/gmail-tokens.json.b64 << 'EOF'"
echo "   <paste base64 content>"
echo "   EOF"
echo "   base64 -d /tmp/gmail-tokens.json.b64 > /app/data/gmail-tokens.json"
echo ""
echo "4. Verify:"
echo "   ls -lh /app/data/"
echo "   exit"
echo ""
echo "5. Restart service:"
echo "   railway service restart"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Press ENTER to start encoding files..."

echo ""
echo "📤 Encoding memory.db..."
base64 -i data/memory.db > /tmp/memory.db.b64
echo "✅ Saved to: /tmp/memory.db.b64"

echo ""
echo "🔑 Encoding gmail-tokens.json..."
base64 -i data/gmail-tokens.json > /tmp/gmail-tokens.json.b64
echo "✅ Saved to: /tmp/gmail-tokens.json.b64"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Files encoded! Now opening Railway SSH..."
echo "   Follow the instructions above to complete the seeding."
echo ""

railway ssh
