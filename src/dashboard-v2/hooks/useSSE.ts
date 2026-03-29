import { useEffect, useMemo, useRef, useState } from "react"

export type BotEventType =
  | "briefing_sent"
  | "email_scanned"
  | "outreach_sent"
  | "outreach_replied"
  | "job_found"
  | "reminder_fired"
  | "agent_response"
  | "task_started"
  | "task_completed"
  | string

export interface BotEvent {
  type: BotEventType
  message: string
  metadata: any
  created_at?: string
  payload?: any
}

type SSEStatus = "connecting" | "connected" | "disconnected"

const TOKEN_KEY = "gc_token"

function buildSseUrl(): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? ""
  const u = new URL("/api/events", window.location.origin)
  if (token) u.searchParams.set("token", token)
  return u.toString()
}

function buildBotEventsUrl(limit: number): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? ""
  const u = new URL("/api/bot_events", window.location.origin)
  u.searchParams.set("limit", String(limit))
  if (token) u.searchParams.set("token", token)
  return u.toString()
}

async function fetchRecentBotEvents(limit: number): Promise<BotEvent[]> {
  const res = await fetch(buildBotEventsUrl(limit), { method: "GET" })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  // Server returns newest-first. Flip to oldest-first for append ordering.
  const rows = (await res.json()) as Array<any>
  return rows
    .slice()
    .reverse()
    .map((r) => ({
      type: r.type,
      message: r.message,
      // `/api/bot_events` returns `metadata` as a JSON stringified payload
      // (same data that the SSE stream would otherwise place in `payload`).
      metadata: r.metadata
        ? (() => { try { return JSON.parse(String(r.metadata)) } catch { return null } })()
        : null,
      payload: r.metadata
        ? (() => { try { return JSON.parse(String(r.metadata)) } catch { return null } })()
        : null,
      created_at: r.created_at,
    }))
}

const EVENT_TYPES: BotEventType[] = [
  "briefing_sent",
  "email_scanned",
  "outreach_sent",
  "outreach_replied",
  "job_found",
  "reminder_fired",
  "agent_response",
  "task_started",
  "task_completed",
]

export function useSSE(limit = 20) {
  const [status, setStatus] = useState<SSEStatus>("connecting")
  const [events, setEvents] = useState<BotEvent[]>([])
  const retryRef = useRef(1000)
  const mountedRef = useRef(true)

  const sseUrl = useMemo(() => buildSseUrl(), [])

  useEffect(() => {
    mountedRef.current = true

    // Fallback: load recent events once on mount.
    fetchRecentBotEvents(limit)
      .then((evs) => mountedRef.current && setEvents(evs))
      .catch(() => { /* ignore */ })

    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      setStatus((s) => (s === "connected" ? s : "connecting"))

      es = new EventSource(sseUrl)

      es.onopen = () => {
        if (!mountedRef.current) return
        retryRef.current = 1000
        setStatus("connected")
      }

      es.onerror = () => {
        if (!mountedRef.current) return
        setStatus("disconnected")
        try {
          es?.close()
        } catch { /* ignore */ }

        // Exponential backoff reconnect.
        const delay = retryRef.current
        retryRef.current = Math.min(retryRef.current * 2, 30_000)
        reconnectTimer = setTimeout(() => {
          if (!mountedRef.current) return
          connect()
        }, delay)

        // Attempt to refresh fallback feed on reconnection attempts.
        fetchRecentBotEvents(limit)
          .then((evs) => mountedRef.current && setEvents(evs))
          .catch(() => { /* ignore */ })
      }

      // Listen to canonical event types (server emits `event: <type>`).
      for (const type of EVENT_TYPES) {
        es.addEventListener(type, (evt) => {
          if (!mountedRef.current) return
          try {
            const parsed = JSON.parse(String(evt.data)) as any
            const incoming: BotEvent = {
              type: parsed.type,
              message: parsed.message,
              metadata: parsed.metadata ?? null,
              created_at: parsed.created_at,
              payload: parsed.payload,
            }
            setEvents((prev) => {
              const next = [...prev, incoming]
              return next.slice(-limit)
            })
          } catch {
            // ignore parse errors
          }
        })
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      try {
        es?.close()
      } catch {
        // ignore
      }
    }
  }, [limit, sseUrl])

  return { status, connected: status === "connected", events }
}

