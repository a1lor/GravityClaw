import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Memory } from '@/hooks/useMemories'

interface Props {
  memory: Memory
  onEdit: () => void
  onDelete: () => void
}

function categoryColor(cat: string): string {
  const overrides: Record<string, string> = {
    general: '#a78bfa',
    work: '#38bdf8',
    personal: '#4ade80',
    tech: '#F59E0B',
    health: '#f87171',
  }
  return overrides[cat.toLowerCase()] ?? `hsl(${(cat.charCodeAt(0) * 47) % 360}, 60%, 60%)`
}

function formatDate(raw: string): string {
  return new Date(raw).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function MemoryCard({ memory, onEdit, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleTrashClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirmDelete) {
      onDelete()
      setConfirmDelete(false)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  const tags = memory.tags
    ? memory.tags.split(',').map(t => t.trim()).filter(Boolean)
    : []

  const color = categoryColor(memory.category || 'general')

  return (
    <div style={{
      background: '#0f1117',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10,
      padding: '12px 16px',
      marginBottom: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Top row: content + actions */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            fontSize: 13,
            color: '#f1f5f9',
            lineHeight: 1.5,
          } as React.CSSProperties}>
            {memory.content}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); onEdit() }}
            title="Edit"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#4b5563',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleTrashClick}
            title={confirmDelete ? 'Click again to confirm' : 'Delete'}
            style={{
              background: confirmDelete ? 'rgba(248,113,113,0.15)' : 'transparent',
              border: confirmDelete ? '1px solid rgba(248,113,113,0.3)' : 'none',
              color: confirmDelete ? '#f87171' : '#4b5563',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: 4,
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {confirmDelete ? (
              <span>Confirm?</span>
            ) : (
              <Trash2 size={14} />
            )}
          </button>
        </div>
      </div>

      {/* Bottom row: category, tags, date */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {memory.category && (
          <span style={{
            fontSize: 8,
            borderRadius: 4,
            padding: '2px 6px',
            background: `${color}20`,
            color,
            border: `1px solid ${color}40`,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {memory.category}
          </span>
        )}
        {tags.map(tag => (
          <span key={tag} style={{
            fontSize: 10,
            borderRadius: 4,
            padding: '1px 5px',
            background: 'rgba(255,255,255,0.05)',
            color: '#94a3b8',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {tag}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#4b5563', flexShrink: 0 }}>
          {formatDate(memory.created_at)}
        </span>
      </div>
    </div>
  )
}
