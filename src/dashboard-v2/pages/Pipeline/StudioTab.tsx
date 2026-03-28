import { useState } from 'react'
import { useLastStudio, useGenerateCoverLetter } from '@/hooks/useStudio'
import { TaskPoller } from '@/components/TaskPoller'

export function StudioTab() {
  const [urlInput, setUrlInput] = useState('')
  const [textInput, setTextInput] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [activeInput, setActiveInput] = useState<'url' | 'text'>('url')

  const { data: lastStudio } = useLastStudio()
  const { mutateAsync, isPending } = useGenerateCoverLetter()

  async function handleGenerateFromUrl() {
    if (!urlInput.trim()) return
    try {
      const res = await mutateAsync({ url: urlInput.trim() })
      setUrlInput('')
      if (res.taskId) setTaskId(res.taskId)
    } catch {
      // error handled by hook
    }
  }

  async function handleGenerateFromText() {
    if (!textInput.trim()) return
    try {
      const res = await mutateAsync({ text: textInput.trim() })
      setTextInput('')
      if (res.taskId) setTaskId(res.taskId)
    } catch {
      // error handled by hook
    }
  }

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {/* Input section */}
      <div
        style={{
          background: '#0f1117',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            color: '#f1f5f9',
            fontSize: 15,
            marginBottom: 16,
          }}
        >
          Generate Cover Letter
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => setActiveInput('url')}
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              fontSize: 12,
              background: activeInput === 'url' ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
              color: activeInput === 'url' ? '#a78bfa' : '#94a3b8',
              border: `1px solid ${activeInput === 'url' ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.08)'}`,
              cursor: 'pointer',
            }}
          >
            From URL
          </button>
          <button
            onClick={() => setActiveInput('text')}
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              fontSize: 12,
              background: activeInput === 'text' ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
              color: activeInput === 'text' ? '#a78bfa' : '#94a3b8',
              border: `1px solid ${activeInput === 'text' ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.08)'}`,
              cursor: 'pointer',
            }}
          >
            From Text
          </button>
        </div>

        {activeInput === 'url' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://..."
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateFromUrl()}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#1e2433',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#f1f5f9',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <button
              onClick={handleGenerateFromUrl}
              disabled={isPending || !urlInput.trim()}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                background: '#a78bfa',
                color: '#000',
                border: 'none',
                cursor: isPending || !urlInput.trim() ? 'default' : 'pointer',
                opacity: isPending || !urlInput.trim() ? 0.6 : 1,
                fontWeight: 600,
                fontSize: 12,
                whiteSpace: 'nowrap',
              }}
            >
              Generate from URL
            </button>
          </div>
        )}

        {activeInput === 'text' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste job description text here..."
              rows={5}
              style={{
                padding: '8px 12px',
                background: '#1e2433',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#f1f5f9',
                fontSize: 14,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleGenerateFromText}
              disabled={isPending || !textInput.trim()}
              style={{
                alignSelf: 'flex-end',
                padding: '8px 14px',
                borderRadius: 8,
                background: '#a78bfa',
                color: '#000',
                border: 'none',
                cursor: isPending || !textInput.trim() ? 'default' : 'pointer',
                opacity: isPending || !textInput.trim() ? 0.6 : 1,
                fontWeight: 600,
                fontSize: 12,
                whiteSpace: 'nowrap',
              }}
            >
              Generate from text
            </button>
          </div>
        )}

        {taskId && (
          <div style={{ marginTop: 12 }}>
            <TaskPoller
              taskId={taskId}
              onDone={() => setTaskId(null)}
              onError={() => setTaskId(null)}
            />
          </div>
        )}
      </div>

      {/* Output section */}
      <div
        style={{
          background: '#0f1117',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            color: '#f1f5f9',
            fontSize: 15,
            marginBottom: 16,
          }}
        >
          Last Output
        </div>

        {!lastStudio ? (
          <div style={{ color: '#4b5563', fontSize: 14 }}>
            No cover letters generated yet
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 500 }}>
                {lastStudio.job.title} @ {lastStudio.job.company}
              </div>
              <div style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>
                {new Date(lastStudio.updated_at).toLocaleString()}
              </div>
            </div>

            <div>
              {lastStudio.files.map((file) => (
                <div
                  key={file.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: '#1e2433',
                    borderRadius: 8,
                    marginBottom: 6,
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#64748b',
                        marginRight: 8,
                        textTransform: 'capitalize',
                      }}
                    >
                      {file.kind}
                    </span>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>{file.name}</span>
                  </div>
                  <a
                    href={`/api/studio/files/${encodeURIComponent(file.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      color: '#a78bfa',
                      textDecoration: 'none',
                    }}
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
