import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useSettings, usePatchSettings } from '@/hooks/useSettings'

interface SettingsPanelProps {
  onBack: () => void
}

export function SettingsPanel({ onBack }: SettingsPanelProps) {
  const { data: settings, isLoading, isError } = useSettings()
  const patch = usePatchSettings()
  const [edits, setEdits] = useState<Record<string, unknown>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) setEdits(settings)
  }, [settings])

  function handleChange(key: string, value: unknown) {
    setEdits((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    if (!settings) return
    const changed: Record<string, unknown> = {}
    for (const key of Object.keys(edits)) {
      if (edits[key] !== settings[key]) changed[key] = edits[key]
    }
    patch.mutate(changed, {
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
        <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', flex: 1 }}>
          Settings
        </span>
        <button
          onClick={handleSave}
          disabled={patch.isPending}
          style={{
            background: '#a78bfa',
            border: 'none',
            borderRadius: 8,
            padding: '5px 14px',
            fontSize: 13,
            fontWeight: 600,
            color: '#0a0e1a',
            cursor: 'pointer',
            opacity: patch.isPending ? 0.6 : 1,
          }}
        >
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {isLoading && (
          <div style={{ padding: '16px', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
        )}
        {isError && (
          <div style={{ padding: '16px', color: '#f87171', fontSize: 13 }}>
            Failed to load settings.
          </div>
        )}
        {settings &&
          Object.entries(edits).map(([key, value]) => {
            const strVal = String(value ?? '')
            const isLong = strVal.length > 80
            return (
              <div
                key={key}
                style={{
                  padding: '8px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <label
                  htmlFor={`setting-${key}`}
                  style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}
                >
                  {key}
                </label>
                {isLong ? (
                  <textarea
                    id={`setting-${key}`}
                    value={strVal}
                    onChange={(e) => handleChange(key, e.target.value)}
                    rows={3}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      padding: '6px 8px',
                      color: '#f1f5f9',
                      fontSize: 13,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <input
                    id={`setting-${key}`}
                    value={strVal}
                    onChange={(e) => handleChange(key, e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      padding: '6px 8px',
                      color: '#f1f5f9',
                      fontSize: 13,
                    }}
                  />
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}
