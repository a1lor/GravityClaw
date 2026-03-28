# ── Build stage ───────────────────────────────────────
FROM node:22-alpine AS builder

# Native build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Build dashboard-v2 (React/Vite → dist/dashboard-v2/public/)
WORKDIR /app/src/dashboard-v2
RUN npm ci
RUN npm run build

WORKDIR /app

# ── Runtime stage ─────────────────────────────────────
FROM node:22-alpine AS runtime

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Static dashboard assets (tsc doesn't copy non-TS files to dist/)
COPY src/dashboard/public ./dist/dashboard/public

# Persistent data directory — Railway Volume mounted at /app/data
# Volume persists: memory.db, gmail-tokens.json, notes/, cv/
RUN mkdir -p /app/data/notes /app/data/cv

# Copy soul.md (read-only, safe to include in image)
COPY data/soul.md ./data/

EXPOSE 3200

CMD ["npm", "start"]
