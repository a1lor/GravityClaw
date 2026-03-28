import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  role: 'user' | 'assistant' | 'tool'
  content: string
  created_at?: string
  isPending?: boolean
}

function formatTimestamp(raw: string): string {
  return new Date(raw).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const mdStyles = `
.gc-md p { margin: 0 0 8px 0; }
.gc-md p:last-child { margin-bottom: 0; }
.gc-md h1, .gc-md h2, .gc-md h3 { color: #f1f5f9; margin: 12px 0 6px 0; font-size: 1em; font-weight: 700; }
.gc-md ul, .gc-md ol { margin: 6px 0 6px 16px; padding: 0; }
.gc-md li { margin-bottom: 4px; }
.gc-md code { background: rgba(255,255,255,0.08); border-radius: 4px; padding: 1px 5px; font-size: 12px; font-family: 'SF Mono', 'Fira Code', monospace; color: #7dd3fc; }
.gc-md pre { background: #0d1117; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; overflow-x: auto; margin: 8px 0; }
.gc-md pre code { background: none; padding: 0; color: #94a3b8; font-size: 12px; }
.gc-md blockquote { border-left: 3px solid rgba(255,255,255,0.15); margin: 8px 0; padding: 4px 12px; color: #64748b; }
.gc-md strong { color: #f1f5f9; font-weight: 600; }
.gc-md em { color: #cbd5e1; }
.gc-md a { color: #38bdf8; text-decoration: none; }
.gc-md a:hover { text-decoration: underline; }
.gc-md table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
.gc-md th, .gc-md td { border: 1px solid rgba(255,255,255,0.08); padding: 6px 10px; text-align: left; }
.gc-md th { background: rgba(255,255,255,0.04); color: #94a3b8; }
.gc-md hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0; }
`

export default function MessageBubble({ role, content, created_at, isPending }: Props) {
  const [toolExpanded, setToolExpanded] = useState(false)
  const isUser = role === 'user'
  const isTool = role === 'tool'

  // Tool messages: collapsed by default, expandable
  if (isTool) {
    let preview = content?.slice(0, 80) ?? ''
    if (content?.length > 80) preview += '…'
    return (
      <div style={{
        alignSelf: 'flex-start',
        maxWidth: '80%',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setToolExpanded(v => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 11, color: '#4b5563' }}>⚙️</span>
          <span style={{ fontSize: 11, color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {preview}
          </span>
          <span style={{ fontSize: 10, color: '#374151', flexShrink: 0 }}>{toolExpanded ? '▲' : '▼'}</span>
        </button>
        {toolExpanded && (
          <pre style={{
            margin: 0,
            padding: '8px 10px',
            fontSize: 11,
            color: '#64748b',
            overflowX: 'auto',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {content}
          </pre>
        )}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      maxWidth: isUser ? '70%' : '85%',
      background: isUser ? 'rgba(167,139,250,0.15)' : '#0f1117',
      border: isUser ? '1px solid rgba(167,139,250,0.3)' : '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '10px 14px',
      marginLeft: isUser ? 'auto' : undefined,
      alignSelf: isUser ? 'flex-end' : 'flex-start',
    }}>
      <style>{mdStyles}</style>
      {isPending ? (
        <>
          <style>{`@keyframes gc-pulse{0%,80%,100%{opacity:.3}40%{opacity:1}}`}</style>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
            {[0, 0.15, 0.3].map((delay, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#94a3b8',
                  animation: `gc-pulse 1.2s infinite`,
                  animationDelay: `${delay}s`,
                }}
              />
            ))}
          </div>
        </>
      ) : isUser ? (
        <span style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: '#f1f5f9' }}>{content}</span>
      ) : (
        <div className="gc-md" style={{ fontSize: 14, color: '#f1f5f9' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
      {created_at && !isPending && (
        <span style={{ color: '#4b5563', fontSize: 11, marginTop: 4, alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
          {formatTimestamp(created_at)}
        </span>
      )}
    </div>
  )
}
