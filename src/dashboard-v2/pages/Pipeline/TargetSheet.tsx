import { useState } from 'react'
import { useMoveTarget, useGenerateTarget, useSendOutreach } from '@/hooks/useSpontanee'
import { TaskPoller } from '@/components/TaskPoller'
import type { Target } from '@/hooks/useSpontanee'

interface TargetSheetProps {
  target: Target
  onClose: () => void
}

export function TargetSheet({ target, onClose }: TargetSheetProps) {
  const [notes, setNotes] = useState(target.notes ?? '')
  const [taskId, setTaskId] = useState<string | null>(null)

  const { mutate: moveTarget, isPending: isMovePending } = useMoveTarget()
  const { mutateAsync: generateTarget, isPending: isGenerating } = useGenerateTarget()
  const { mutateAsync: sendOutreach, isPending: isSending } = useSendOutreach()

  async function handleGenerate() {
    try {
      const res = await generateTarget(target.id)
      if (res.taskId) setTaskId(res.taskId)
    } catch {
      // handled by hook
    }
  }

  async function handleSend() {
    try {
      const res = await sendOutreach(target.id)
      if (res.taskId) setTaskId(res.taskId)
    } catch (err: any) {
      alert(err?.message || 'Failed to send')
    }
  }

  function handleSaveNotes() {
    moveTarget({ id: target.id, notes })
  }

  function handleMoveStatus(status: string) {
    moveTarget({ id: target.id, status }, { onSuccess: () => onClose() })
  }

  return (
    <>
      <div
        data-testid="backdrop"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 99,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: '#0f1117',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px 12px 0 0',
          padding: 20,
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 16 }}>{target.company}</div>
          <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 2 }}>{target.email}</div>
          {target.title && (
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{target.title}</div>
          )}
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#1e2433',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#f1f5f9',
              fontSize: 13,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleSaveNotes}
            disabled={isMovePending}
            style={{
              marginTop: 8,
              padding: '6px 14px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Save Notes
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {target.status === 'pending' && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: 'rgba(167,139,250,0.15)',
                border: '1px solid rgba(167,139,250,0.3)',
                color: '#a78bfa',
                cursor: isGenerating ? 'default' : 'pointer',
                opacity: isGenerating ? 0.6 : 1,
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              Generate Draft
            </button>
          )}
          {target.status === 'draft' && (
            <button
              onClick={handleSend}
              disabled={isSending}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: 'rgba(56,189,248,0.1)',
                border: '1px solid rgba(56,189,248,0.3)',
                color: '#38bdf8',
                cursor: isSending ? 'default' : 'pointer',
                opacity: isSending ? 0.6 : 1,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {isSending ? 'Sending…' : '📤 Send via Gmail + CV'}
            </button>
          )}
          {target.status !== 'sent' && target.status !== 'replied' && (
            <button
              onClick={() => handleMoveStatus('sent')}
              disabled={isMovePending}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: 'rgba(56,189,248,0.1)',
                border: '1px solid rgba(56,189,248,0.3)',
                color: '#38bdf8',
                cursor: isMovePending ? 'default' : 'pointer',
                opacity: isMovePending ? 0.6 : 1,
                fontSize: 13,
              }}
            >
              Mark Sent
            </button>
          )}
          {target.status === 'sent' && (
            <button
              onClick={() => handleMoveStatus('replied')}
              disabled={isMovePending}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: 'rgba(74,222,128,0.1)',
                border: '1px solid rgba(74,222,128,0.3)',
                color: '#4ade80',
                cursor: isMovePending ? 'default' : 'pointer',
                opacity: isMovePending ? 0.6 : 1,
                fontSize: 13,
              }}
            >
              Mark Replied
            </button>
          )}
        </div>

        {taskId && (
          <div style={{ marginBottom: 16 }}>
            <TaskPoller
              taskId={taskId}
              onDone={() => setTaskId(null)}
              onError={() => setTaskId(null)}
            />
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: 10,
            background: 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 8,
            color: '#94a3b8', cursor: 'pointer', fontSize: 14,
          }}
        >
          Close
        </button>
      </div>
    </>
  )
}
