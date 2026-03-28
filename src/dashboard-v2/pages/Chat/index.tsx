import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { MessageCircle, Send, Plus, Zap, ChevronDown } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Dialogue {
  id: number
  title: string
  model: string
  created_at: string
}

interface Message {
  id: number
  role: 'user' | 'assistant' | 'agent' | 'tool'
  content: string
  created_at: string
}

interface Model {
  id: string
  label: string
}

interface Exchange {
  model: string
  total_tokens: number
  cost_usd: number
  created_at: string
  tier: string
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useDialogues() {
  return useQuery({
    queryKey: ['dialogues'],
    queryFn: () => api.get<Dialogue[]>('/api/dialogues'),
    staleTime: 30_000,
  })
}

function useMessages(dialogueId: number | null) {
  return useQuery({
    queryKey: ['messages', dialogueId],
    queryFn: () => api.get<Message[]>(`/api/dialogues/${dialogueId}/messages?limit=100`),
    enabled: dialogueId != null,
    staleTime: 0,
  })
}

function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: () => api.get<Model[]>('/api/models'),
    staleTime: Infinity,
  })
}

function useExchanges() {
  return useQuery({
    queryKey: ['exchanges'],
    queryFn: () => api.get<Exchange[]>('/api/exchanges'),
    staleTime: 5_000,
    refetchInterval: 10_000,
  })
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ModelPicker({
  models,
  selected,
  onChange,
}: {
  models: Model[]
  selected: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const label = models.find(m => m.id === selected)?.label ?? selected.split('/').pop()

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: 8, color: '#93c5fd', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        {label} ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
            background: '#0f1117', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, overflow: 'hidden', minWidth: 220,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
        >
          {models.map(m => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', fontSize: 12, cursor: 'pointer',
                background: m.id === selected ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: m.id === selected ? '#93c5fd' : '#94a3b8',
                border: 'none',
              }}
            >
              {m.label ?? m.id}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  const text = (msg.content ?? '').trim()
  if (!text) return null
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      <div
        style={{
          maxWidth: '72%', padding: '10px 14px', borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: isUser ? '#2563eb' : '#0f1117',
          border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
          color: isUser ? '#fff' : '#e2e8f0',
        }}
      >
        {text}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '10px 14px', alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%', background: '#475569',
            animation: 'gc-dot 1.2s infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  )
}

const QUICK_ACTIONS = [
  { label: '🔍 Jobs', query: '🔍 Check for new jobs' },
  { label: '📧 Gmail', query: '📧 Read my latest emails' },
  { label: '🌅 Morning', query: '🌅 Give me my morning brief' },
  { label: '📅 Calendar', query: "📅 What do I have today?" },
]

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ChatPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(
    () => Number(localStorage.getItem('gc_dialogue_id')) || null
  )
  const [model, setModel] = useState<string>(
    () => localStorage.getItem('gc_model') || 'google/gemini-2.0-flash-001'
  )
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingMsg, setPendingMsg] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const dialogues = useDialogues()
  const messages = useMessages(selectedId)
  const models = useModels()
  const exchanges = useExchanges()

  // Auto-select first dialogue
  useEffect(() => {
    if (dialogues.data && dialogues.data.length > 0 && selectedId == null) {
      const first = dialogues.data[0]
      setSelectedId(first.id)
      localStorage.setItem('gc_dialogue_id', String(first.id))
      setModel(first.model || model)
    }
  }, [dialogues.data])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.data, pendingMsg])

  const createDialogue = useMutation({
    mutationFn: (title: string) =>
      api.post<Dialogue>('/api/dialogues', { title, model }),
    onSuccess: (d) => {
      setSelectedId(d.id)
      localStorage.setItem('gc_dialogue_id', String(d.id))
      qc.invalidateQueries({ queryKey: ['dialogues'] })
    },
  })

  async function sendMessage(text: string) {
    if (!text.trim() || sending || selectedId == null) return
    setInput('')
    setSending(true)
    setPendingMsg(text)
    try {
      const res = await api.post<{ text: string }>(`/api/dialogues/${selectedId}/messages`, { message: text })
      setPendingMsg(null)
      qc.invalidateQueries({ queryKey: ['messages', selectedId] })
      qc.invalidateQueries({ queryKey: ['exchanges'] })
      qc.invalidateQueries({ queryKey: ['kpis'] })
      // append agent response directly to cache for snappy UX
      void res
    } catch {
      setPendingMsg(null)
    }
    setSending(false)
  }

  const isMobile = useIsMobile()
  const [showDialogues, setShowDialogues] = useState(false)

  const visibleMessages = (messages.data ?? []).filter(
    m => (m.role === 'user' || m.role === 'assistant' || m.role === 'agent') && m.content?.trim()
  )

  const activeDialogue = (dialogues.data ?? []).find(d => d.id === selectedId)

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden', position: 'relative' }}>

      {/* ── Dialogue list ──────────────────────────────────────── */}
      <div style={{
        width: isMobile ? '100%' : 220,
        flexShrink: 0,
        borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
        display: isMobile ? (showDialogues ? 'flex' : 'none') : 'flex',
        flexDirection: 'column', overflow: 'hidden',
        position: isMobile ? 'absolute' : 'relative',
        top: isMobile ? 0 : undefined,
        left: isMobile ? 0 : undefined,
        bottom: isMobile ? 0 : undefined,
        zIndex: isMobile ? 20 : undefined,
        background: isMobile ? '#090c14' : undefined,
      }}>
        <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: 1 }}>DIALOGUES</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                const title = prompt('New dialogue name:', 'New chat') ?? 'New chat'
                createDialogue.mutate(title)
              }}
              title="New dialogue"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center' }}
            >
              <Plus size={14} />
            </button>
            {isMobile && (
              <button
                onClick={() => setShowDialogues(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {(dialogues.data ?? []).map(d => (
            <button
              key={d.id}
              onClick={() => {
                setSelectedId(d.id)
                localStorage.setItem('gc_dialogue_id', String(d.id))
                setModel(d.model || model)
                if (isMobile) setShowDialogues(false)
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                background: d.id === selectedId ? 'rgba(59,130,246,0.1)' : 'transparent',
                borderLeft: d.id === selectedId ? '2px solid #3b82f6' : '2px solid transparent',
                border: 'none', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: d.id === selectedId ? '#93c5fd' : '#94a3b8',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.title || `Dialogue ${d.id}`}
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(d.model ?? '').split('/').pop()}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main chat area ─────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{
          height: 52, borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px', flexShrink: 0, gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, overflow: 'hidden' }}>
            {isMobile ? (
              <button
                onClick={() => setShowDialogues(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: '#94a3b8', fontSize: 12, flexShrink: 0 }}
              >
                <MessageCircle size={13} stroke="#94a3b8" />
                <ChevronDown size={12} stroke="#94a3b8" />
              </button>
            ) : (
              <MessageCircle size={14} stroke="#475569" />
            )}
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeDialogue?.title?.toUpperCase() ?? 'CHAT'}
            </span>
          </div>
          <ModelPicker
            models={models.data ?? []}
            selected={model}
            onChange={id => {
              setModel(id)
              localStorage.setItem('gc_model', id)
            }}
          />
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {messages.isLoading && (
            <div style={{ color: '#475569', fontSize: 12, textAlign: 'center', padding: 32 }}>Loading…</div>
          )}
          {!messages.isLoading && visibleMessages.length === 0 && !pendingMsg && (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <Zap size={28} stroke="#F59E0B" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>
                Hey David, how can I help you?
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>Send a message or pick a quick action below.</div>
            </div>
          )}
          {visibleMessages.map(m => <Bubble key={m.id} msg={m} />)}
          {pendingMsg && (
            <>
              <Bubble msg={{ id: -1, role: 'user', content: pendingMsg, created_at: '' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
                <div style={{ background: '#0f1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px 16px 16px 4px' }}>
                  <TypingDots />
                </div>
              </div>
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px 12px', flexShrink: 0 }}>
          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {QUICK_ACTIONS.map(a => (
              <button
                key={a.label}
                onClick={() => sendMessage(a.query)}
                disabled={sending}
                style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 11,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#64748b', cursor: sending ? 'not-allowed' : 'pointer',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
              placeholder="Ask anything…"
              disabled={sending || selectedId == null}
              style={{
                flex: 1, height: 40, background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                padding: '0 14px', color: '#e2e8f0', fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={sending || !input.trim() || selectedId == null}
              style={{
                width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: sending ? 'rgba(37,99,235,0.4)' : '#2563eb', border: 'none', cursor: sending ? 'not-allowed' : 'pointer',
              }}
            >
              <Send size={14} stroke="#fff" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Live Activity (desktop only) ───────────────────────── */}
      {!isMobile && <div style={{
        width: 200, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 12px 8px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: 1 }}>LIVE ACTIVITY</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {(exchanges.data ?? []).slice(0, 15).map((ex, i) => {
            const shortModel = ex.model.split('/').pop()
            const t = new Date(ex.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            const tierColor = ex.tier === 'smart' ? '#f87171' : ex.tier === 'cheap' ? '#fbbf24' : '#4ade80'
            return (
              <div key={i} style={{ padding: '6px 8px', borderRadius: 6, marginBottom: 2, background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ fontSize: 10, color: '#475569' }}>[{t}] <span style={{ color: tierColor, fontWeight: 700 }}>{shortModel}</span></div>
                <div style={{ fontSize: 10, color: '#374151', marginTop: 1 }}>{ex.total_tokens} tok · ${ex.cost_usd.toFixed(4)}</div>
              </div>
            )
          })}
          {(exchanges.data ?? []).length === 0 && (
            <div style={{ fontSize: 10, color: '#374151', padding: '8px' }}>No recent activity</div>
          )}
        </div>
      </div>}

      {/* Keyframe for dot animation */}
      <style>{`
        @keyframes gc-dot {
          0%, 60%, 100% { opacity: 0.2; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
