import { useState, useRef, useEffect } from 'react'
import { useDialogueMessages, useSendMessage, type DialogueMessage } from '@/hooks/useDialogues'
import MessageBubble from './MessageBubble'

interface Props {
  dialogueId: number
  onBack?: () => void
}

export default function ChatPane({ dialogueId, onBack }: Props) {
  const { data: serverMessages, isLoading } = useDialogueMessages(dialogueId)
  const sendMessage = useSendMessage()
  const [localMessages, setLocalMessages] = useState<DialogueMessage[]>([])
  const [isPendingReply, setIsPendingReply] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [pendingContent, setPendingContent] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync server messages to local state when not pending.
  // Filter out tool/system rows — only render user + assistant bubbles.
  useEffect(() => {
    if (!isPendingReply) {
      setLocalMessages(
        serverMessages.filter(m => m && (m.role === 'user' || m.role === 'assistant'))
      )
    }
  }, [serverMessages, isPendingReply])

  // Auto-scroll on messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages, isPendingReply])

  async function handleSend() {
    const content = inputValue.trim()
    if (!content || sendMessage.isPending || isPendingReply) return

    const userMsg: DialogueMessage = {
      id: Date.now(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }

    setInputValue('')
    setSendError(null)
    setPendingContent(content)
    setLocalMessages(prev => [...prev, userMsg])
    setIsPendingReply(true)

    try {
      const result = await sendMessage.mutateAsync({ id: dialogueId, message: content })
      // Guard: assistantMessage may be null if the backend query found nothing
      if (result.assistantMessage) {
        setLocalMessages(prev => [...prev, result.assistantMessage])
      }
      setIsPendingReply(false)
      setPendingContent(null)
    } catch (err) {
      setIsPendingReply(false)
      setPendingContent(null)
      setSendError(err instanceof Error ? err.message : 'Failed to send')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleRetry() {
    if (!pendingContent) return
    setSendError(null)
    setLocalMessages(prev => {
      // Remove last user message (the failed one)
      const idx = [...prev].reverse().findIndex(m => m.role === 'user')
      if (idx === -1) return prev
      const realIdx = prev.length - 1 - idx
      return prev.slice(0, realIdx)
    })
    setInputValue(pendingContent)
    setPendingContent(null)
  }

  const isBusy = isPendingReply || sendMessage.isPending

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      {/* Back button (mobile) */}
      {onBack && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <button
            onClick={onBack}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: 13,
              cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            ← Back
          </button>
        </div>
      )}

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
      }}>
        {isLoading && (
          <div style={{ textAlign: 'center', color: '#4b5563', padding: 32 }}>Loading…</div>
        )}
        {!isLoading && localMessages.length === 0 && !isPendingReply && (
          <div style={{ textAlign: 'center', color: '#4b5563', padding: 32, fontSize: 14 }}>
            Start a conversation
          </div>
        )}
        {localMessages.map(msg => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            created_at={msg.created_at}
          />
        ))}
        {isPendingReply && (
          <MessageBubble role="assistant" content="" isPending={true} />
        )}
        {sendError && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8 }}>
            <span style={{ color: '#f87171', fontSize: 13, flex: 1 }}>Error: {sendError}</span>
            {pendingContent && (
              <button
                onClick={handleRetry}
                style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}
              >
                Retry
              </button>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        flexShrink: 0,
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
      }}>
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isBusy}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={2}
          style={{
            flex: 1,
            background: '#1e2433',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            color: '#f1f5f9',
            fontSize: 14,
            padding: '10px 12px',
            resize: 'none',
            fontFamily: 'inherit',
            opacity: isBusy ? 0.6 : 1,
          }}
        />
        <button
          onClick={handleSend}
          disabled={isBusy || !inputValue.trim()}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            background: isBusy || !inputValue.trim() ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.9)',
            border: 'none',
            color: isBusy || !inputValue.trim() ? 'rgba(245,158,11,0.5)' : '#0a0e1a',
            fontSize: 13,
            fontWeight: 600,
            cursor: isBusy || !inputValue.trim() ? 'default' : 'pointer',
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
