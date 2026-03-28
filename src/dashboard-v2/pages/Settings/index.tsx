import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useIsMobile } from '@/hooks/useIsMobile'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Status {
  telegramConnected: boolean
  gmailConnected: boolean
  env: string
  railwayService?: string
  uptime?: number
  memoryCount?: number
  jobCount?: number
  nodeVersion?: string
}

// ─── Connectivity tab ────────────────────────────────────────────────────────

function ConnectivityTab() {
  const { data: st } = useQuery<Status>({
    queryKey: ['status'],
    queryFn: () => api.get<Status>('/api/status'),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })

  const [tokenVal, setTokenVal] = useState(() => localStorage.getItem('gc_token') ?? '')
  const [copied, setCopied] = useState(false)

  function formatUptime(s?: number) {
    if (s == null) return '—'
    return s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  }

  function dot(ok?: boolean) {
    return <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? '#22c55e' : '#f87171', display: 'inline-block', marginRight: 8 }} />
  }

  const rows = [
    { label: 'Telegram Bot', ok: st?.telegramConnected, note: st?.telegramConnected ? 'Connected' : 'Not connected' },
    { label: 'Gmail OAuth', ok: st?.gmailConnected, note: st?.gmailConnected ? 'Connected' : 'Not connected' },
    { label: 'Deployment', ok: true, note: st?.env === 'railway' ? `Railway${st.railwayService ? ' · ' + st.railwayService : ''}` : 'Local' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 12 }}>Connections</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
              {dot(r.ok)}
              <span style={{ flex: 1, fontSize: 12, color: '#e2e8f0' }}>{r.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: r.ok ? '#22c55e' : '#f87171' }}>{r.note}</span>
                {r.label === 'Gmail OAuth' && (
                  <button
                    onClick={async () => {
                      try {
                        const { url } = await api.post<{ url: string }>('/api/gmail/reconnect', {})
                        window.open(url, '_blank')
                      } catch (err) {
                        alert('Failed to start Gmail reconnection')
                      }
                    }}
                    style={{
                      background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
                      borderRadius: 4, padding: '2px 8px', color: '#93c5fd', fontSize: 10,
                      fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    Reconnect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { label: 'UPTIME', val: formatUptime(st?.uptime), color: '#e2e8f0' },
          { label: 'MEMORIES', val: st?.memoryCount ?? '—', color: '#f59e0b' },
          { label: 'JOBS', val: st?.jobCount ?? '—', color: '#3b82f6' },
          { label: 'NODE', val: st?.nodeVersion ?? '—', color: '#e2e8f0' },
        ].map(k => (
          <div key={k.label} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: k.color }}>{String(k.val)}</div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 10 }}>Dashboard Token</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={tokenVal}
            onChange={e => setTokenVal(e.target.value)}
            placeholder="token…"
            style={{ flex: 1, height: 38, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: '0 12px', fontFamily: 'monospace', fontSize: 12, outline: 'none' }}
          />
          <button
            onClick={() => { localStorage.setItem('gc_token', tokenVal); window.location.reload() }}
            style={{ padding: '0 14px', background: '#2563eb', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Apply
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(tokenVal).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }}
            style={{ padding: '0 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── AI Soul tab ──────────────────────────────────────────────────────────────

function SoulTab({ compact = false }: { compact?: boolean }) {
  const { data: soul } = useQuery({
    queryKey: ['soul'],
    queryFn: () => api.get<{ content: string }>('/api/soul'),
    staleTime: 60_000,
  })
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (soul?.content != null) setText(soul.content)
  }, [soul?.content])

  const save = useMutation({
    mutationFn: () => api.put<void>('/api/soul', { content: text }),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1500) },
  })

  return (
    <div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
        Modify the agent's core directives (<code style={{ color: '#f59e0b' }}>soul.md</code>).
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={compact ? 8 : 16}
        style={{
          width: '100%', background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.1)', color: '#f59e0b',
          borderRadius: 10, padding: 16, fontFamily: 'monospace', fontSize: 12,
          lineHeight: 1.6, outline: 'none', resize: 'vertical', boxSizing: 'border-box',
        }}
      />
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        style={{
          marginTop: 12, padding: '8px 20px', background: '#2563eb', border: 'none',
          borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
          cursor: save.isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {save.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
      </button>
    </div>
  )
}

// ─── Appearance tab ───────────────────────────────────────────────────────────

function AppearanceTab() {
  const [theme, setTheme] = useState(() => localStorage.getItem('gc_theme') ?? 'dark')

  function pick(t: string) {
    setTheme(t)
    localStorage.setItem('gc_theme', t)
    // The v2 dashboard uses a CSS data-theme attribute (future: wire to root)
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        Choose your preferred theme for the GravityClaw dashboard.
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {[{ val: 'dark', label: '🌙 Dark Mode' }, { val: 'light', label: '☀️ Light Mode' }].map(t => (
          <button
            key={t.val}
            onClick={() => pick(t.val)}
            style={{
              flex: 1, height: 44, borderRadius: 10, fontSize: 13, fontWeight: theme === t.val ? 700 : 500,
              cursor: 'pointer',
              background: theme === t.val ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
              border: theme === t.val ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
              color: theme === t.val ? '#f59e0b' : '#94a3b8',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

const PROFILE_FIELDS: { key: string; label: string; multiline?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'occupation', label: 'Occupation' },
  { key: 'location', label: 'Location' },
  { key: 'projects', label: 'Projects', multiline: false },
  { key: 'education', label: 'Education' },
  { key: 'timezone', label: 'Timezone' },
  { key: 'availability', label: 'Availability' },
  { key: 'tech_stack', label: 'Tech Stack', multiline: true },
  { key: 'cv_skills', label: 'CV Skills', multiline: true },
  { key: 'background', label: 'Background', multiline: true },
  { key: 'style', label: 'Style', multiline: true },
  { key: 'signature', label: 'Signature', multiline: true },
]

const READONLY_FIELDS: { key: string; label: string }[] = [
  { key: 'cv_path', label: 'CV Path' },
  { key: 'cv_profile_extracted', label: 'CV Profile Extracted' },
]

function ProfileTab() {
  const { data: profile, isLoading } = useQuery<Record<string, string>>({
    queryKey: ['profile'],
    queryFn: () => api.get<Record<string, string>>('/api/profile'),
    staleTime: 30_000,
  })

  const [fields, setFields] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) setFields(profile)
  }, [profile])

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, string> = {}
      for (const { key } of PROFILE_FIELDS) {
        payload[key] = fields[key] ?? ''
      }
      return api.patch<void>('/api/profile', payload)
    },
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#e2e8f0',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  if (isLoading) {
    return <div style={{ color: '#64748b', fontSize: 13 }}>Loading profile…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
        Edit your personal profile. These values are injected into the agent's context on every request.
      </div>

      {PROFILE_FIELDS.map(f => (
        <div key={f.key}>
          <div style={labelStyle}>{f.label}</div>
          {f.multiline ? (
            <textarea
              rows={4}
              value={fields[f.key] ?? ''}
              onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          ) : (
            <input
              type="text"
              value={fields[f.key] ?? ''}
              onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
              style={{ ...inputStyle, height: 38 }}
            />
          )}
        </div>
      ))}

      {/* Read-only fields */}
      {READONLY_FIELDS.some(f => profile?.[f.key]) && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Read-only</div>
          {READONLY_FIELDS.filter(f => profile?.[f.key]).map(f => (
            <div key={f.key}>
              <div style={labelStyle}>{f.label}</div>
              <div style={{
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                fontSize: 12,
                color: '#64748b',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
              }}>
                {profile?.[f.key] || '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={{
            padding: '8px 20px',
            background: '#F59E0B',
            border: 'none',
            borderRadius: 8,
            color: '#0a0e1a',
            fontSize: 13,
            fontWeight: 700,
            cursor: save.isPending ? 'not-allowed' : 'pointer',
            opacity: save.isPending ? 0.7 : 1,
          }}
        >
          {save.isPending ? 'Saving…' : 'Save Profile'}
        </button>
        {saved && (
          <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>Saved ✓</span>
        )}
        {save.isError && (
          <span style={{ fontSize: 13, color: '#f87171' }}>Save failed</span>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'connectivity', label: 'Connectivity' },
  { id: 'profile', label: 'Profile' },
  { id: 'soul', label: 'AI Soul' },
  { id: 'appearance', label: 'Appearance' },
]

export default function SettingsPage() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('connectivity')

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', background: '#080a10' }}>
        {/* Mobile: horizontal tab pills */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0a0d14', flexShrink: 0 }}>
          {/* User pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 14 }}>D</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>David Litvak</div>
              <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 500 }}>Premium Agent</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '7px 4px', borderRadius: 8, border: 'none',
                  background: t.id === tab ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                  color: t.id === tab ? '#93c5fd' : '#64748b',
                  fontSize: 11, fontWeight: t.id === tab ? 700 : 400, cursor: 'pointer',
                  borderBottom: t.id === tab ? '2px solid #3b82f6' : '2px solid transparent',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {tab === 'connectivity' && <ConnectivityTab />}
          {tab === 'profile' && <ProfileTab />}
          {tab === 'soul' && <SoulTab compact />}
          {tab === 'appearance' && <AppearanceTab />}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Left nav */}
      <div style={{ width: 200, borderRight: '1px solid rgba(255,255,255,0.06)', padding: 16, flexShrink: 0 }}>
        {/* User pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16 }}>D</span>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>David Litvak</div>
            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 500 }}>Premium Agent</div>
          </div>
        </div>

        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 12px', borderRadius: 8, marginBottom: 4, border: 'none',
              background: t.id === tab ? 'rgba(59,130,246,0.1)' : 'transparent',
              color: t.id === tab ? '#93c5fd' : '#64748b',
              fontSize: 13, fontWeight: t.id === tab ? 600 : 400, cursor: 'pointer',
              borderLeft: t.id === tab ? '2px solid #3b82f6' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        {tab === 'connectivity' && <ConnectivityTab />}
        {tab === 'profile' && <ProfileTab />}
        {tab === 'soul' && <SoulTab />}
        {tab === 'appearance' && <AppearanceTab />}
      </div>
    </div>
  )
}
