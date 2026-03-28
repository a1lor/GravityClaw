import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useSoul, useSaveSoul } from '@/hooks/useSoul'

interface SoulPanelProps {
  onBack: () => void
}

export function SoulPanel({ onBack }: SoulPanelProps) {
  const { data, isLoading } = useSoul()
  const saveSoul = useSaveSoul()
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data?.content !== undefined) setDraft(data.content)
  }, [data?.content])

  function handleSave() {
    saveSoul.mutate(draft, {
      onSuccess: () => {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: '#94a3b8',
            fontSize: 13,
            padding: '2px 4px',
          }}
        >
          <ChevronLeft size={16} aria-hidden />
          Back
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', flex: 1 }}>AI Soul</span>
        <button
          onClick={handleSave}
          disabled={saveSoul.isPending}
          style={{
            background: '#a78bfa',
            border: 'none',
            borderRadius: 8,
            padding: '5px 14px',
            fontSize: 13,
            fontWeight: 600,
            color: '#0a0e1a',
            cursor: 'pointer',
            opacity: saveSoul.isPending ? 0.6 : 1,
          }}
        >
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 8 }}>
        {isLoading ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#f1f5f9',
                fontSize: 13,
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: 1.6,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ textAlign: 'right', fontSize: 11, color: '#4b5563' }}>
              {draft.length} chars
            </div>
          </>
        )}
      </div>
    </div>
  )
}
