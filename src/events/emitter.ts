import { EventEmitter } from "events";
import type { Response } from "express";
import { db } from "../memory/db.js";

export const eventBus = new EventEmitter();

// In-memory SSE clients (active `/api/events` connections).
export const clients: Set<Response> = new Set();

function buildEventMessage(type: string, payload: any): string {
  switch (type) {
    case "briefing_sent":
      return "Morning briefing delivered";
    case "email_scanned":
      return `Daily email scan completed (${payload?.count ?? 0} emails)`;
    case "outreach_sent":
      return `Cold outreach email sent to ${payload?.company ?? "company"}`;
    case "outreach_replied":
      return `Reply detected from ${payload?.company ?? "company"} (target #${payload?.targetId ?? "?"})`;
    case "job_found":
      return `New job found: ${payload?.title ?? "position"} @ ${payload?.company ?? "company"}`;
    case "reminder_fired":
      return `Reminder delivered: ${payload?.message ?? "message"}`;
    case "agent_response":
      return `Agent response: ${String(payload?.summary ?? "").slice(0, 100)}`;
    case "task_started":
      return `Task started: ${payload?.label ?? "task"}`;
    case "task_completed":
      return `Task completed: ${payload?.taskId ?? "task"} (${payload?.success ? "success" : "failed"})`;
    default:
      return String(type);
  }
}

function normalizeMetadata(payload: any): string | null {
  if (payload === undefined || payload === null) return null;
  // Must be a JSON stringified object (or null).
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

export function emitEvent(type: string, payload?: any): void {
  const createdAt = new Date().toISOString();
  const metadata = normalizeMetadata(payload);
  const message = buildEventMessage(type, payload);

  // Persist for dashboard fallback + reconnection.
  db.prepare(
    `INSERT INTO bot_events(type, message, metadata, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(type, message, metadata, createdAt);

  // Broadcast to all connected SSE clients.
  const eventData = {
    type,
    message,
    payload,
    metadata: metadata ? (() => { try { return JSON.parse(metadata) } catch { return null } })() : null,
    created_at: createdAt,
  };

  // Keep `eventBus` for possible future internal listeners.
  eventBus.emit(type, payload);
  eventBus.emit("event", { type, payload });

  for (const client of clients) {
    try {
      client.write(`event: ${type}\n`);
      client.write(`data: ${JSON.stringify(eventData)}\n\n`);
    } catch {
      // If the client connection is already dead, drop it.
      clients.delete(client);
    }
  }
}

