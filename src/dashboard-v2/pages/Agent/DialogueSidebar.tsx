import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useDialogues, usePatchDialogue, useDeleteDialogue } from '@/hooks/useDialogues'
import { useModels, type CuratedModel } from '@/hooks/useModels'

interface Props {
  selectedId: number | null
  onSelect: (id: number) => void
  onNewChat: () => void
  onDeleted?: (id: number) => void
}

function relativeTime(raw: string): string {
  const diff = Date.now() - new Date(raw).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function modelHint(model: string): string {
  const parts = model.split('/')
  return parts[parts.length - 1] ?? model
}

export default function DialogueSidebar({ selectedId, onSelect, onNewChat, onDeleted }: Props) {
  const { data: dialogues } = useDialogues()
  const { data: models } = useModels()
  const patchDialogue = usePatchDialogue()
  const deleteDialogue = useDeleteDialogue()
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const sorted = [...dialogues].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )

  const selectedDialogue = dialogues.find(d => d.id === selectedId)
  const currentModel = selectedDialogue?.model ?? (models[0]?.id ?? '')

  function handleModelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (!selectedId) return
    patchDialogue.mutate({ id: selectedId, model: e.target.value })
  }

  function handleTitleClick(e: React.MouseEvent, id: number, title: string) {
    e.stopPropagation()
    setRenamingId(id)
    setRenameValue(title)
  }

  function handleRenameBlur(id: number) {
    const trimmed = renameValue.trim()
    if (trimmed) {
      patchDialogue.mutate({ id, title: trimmed })
    }
    setRenamingId(null)
  }

  function handleDeleteClick(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    if (confirmDeleteId === id) {
      deleteDialogue.mutate(id, {
        onSuccess: () => {
          setConfirmDeleteId(null)
          onDeleted?.(id)
        },
      })
    } else {
      setConfirmDeleteId(id)
      setTimeout(() => setConfirmDeleteId(null), 3000)
    }
  }

  return (
    <div style={{
      width: 220,
      flexShrink: 0,
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* New Chat button */}
      <div style={{ padding: '12px 12px 8px' }}>
        <button
          onClick={onNewChat}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(245,158,11,0.15)',
            border: '1px solid rgba(245,158,11,0.3)',
            color: '#F59E0B',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + New Chat
        </button>
      </div>

      {/* Model selector */}
      <div style={{ padding: '0 12px 8px' }}>
        <select
          value={currentModel}
          onChange={handleModelChange}
          disabled={!selectedId}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            background: '#1e2433',
            border: '1px solid rgba(255,255,255,0.08)',
            color: selectedId ? '#94a3b8' : '#4b5563',
            fontSize: 11,
            cursor: selectedId ? 'pointer' : 'default',
          }}
        >
          {models.map((m: CuratedModel) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Dialogue list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sorted.map(dialogue => {
          const isActive = dialogue.id === selectedId
          return (
            <div
              key={dialogue.id}
              onClick={() => onSelect(dialogue.id)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderLeft: isActive ? '3px solid #F59E0B' : '3px solid transparent',
                background: isActive ? 'rgba(245,158,11,0.08)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {renamingId === dialogue.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameBlur(dialogue.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRenameBlur(dialogue.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    width: '100%',
                    background: '#0f1117',
                    border: '1px solid rgba(245,158,11,0.4)',
                    borderRadius: 4,
                    color: '#f1f5f9',
                    fontSize: 12,
                    padding: '2px 4px',
                  }}
                />
              ) : (
                <div
                  onClick={e => handleTitleClick(e, dialogue.id, dialogue.title)}
                  title="Click to rename"
                  style={{
                    fontSize: 12,
                    color: isActive ? '#f1f5f9' : '#94a3b8',
                    fontWeight: isActive ? 600 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 160,
                    cursor: 'text',
                  }}
                >
                  {dialogue.title.length > 28
                    ? dialogue.title.slice(0, 28) + '…'
                    : dialogue.title}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#4b5563', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {modelHint(dialogue.model)}
                </span>
                <span style={{ fontSize: 10, color: '#4b5563', flexShrink: 0 }}>
                  {relativeTime(dialogue.updated_at)}
                </span>
                <button
                  onClick={e => handleDeleteClick(e, dialogue.id)}
                  title={confirmDeleteId === dialogue.id ? 'Click again to confirm' : 'Delete'}
                  style={{
                    background: confirmDeleteId === dialogue.id ? 'rgba(248,113,113,0.15)' : 'transparent',
                    border: confirmDeleteId === dialogue.id ? '1px solid rgba(248,113,113,0.3)' : 'none',
                    color: confirmDeleteId === dialogue.id ? '#f87171' : '#374151',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: 4,
                    fontSize: 10,
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  {confirmDeleteId === dialogue.id ? '?' : <Trash2 size={11} />}
                </button>
              </div>
            </div>
          )
        })}
        {sorted.length === 0 && (
          <div style={{ padding: '20px 12px', color: '#4b5563', fontSize: 12, textAlign: 'center' }}>
            No conversations yet
          </div>
        )}
      </div>
    </div>
  )
}
