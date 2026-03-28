import { useState } from 'react'
import { useMemories, useCreateMemory, usePatchMemory, type Memory } from '@/hooks/useMemories'

interface Props {
  memory?: Memory
  onClose: () => void
}

export default function MemoryEditModal({ memory, onClose }: Props) {
  const { data: allMemories } = useMemories()
  const createMemory = useCreateMemory()
  const patchMemory = usePatchMemory()

  const [content, setContent] = useState(memory?.content ?? '')
  const [category, setCategory] = useState(memory?.category ?? '')
  const [tags, setTags] = useState(memory?.tags ?? '')
  const [error, setError] = useState<string | null>(null)

  const categories = Array.from(new Set(allMemories.map(m => m.category).filter(Boolean)))
  const isEditing = !!memory?.id
  const isBusy = createMemory.isPending || patchMemory.isPending

  async function handleSave() {
    if (!content.trim()) {
      setError('Content is required')
      return
    }
    setError(null)
    try {
      if (isEditing) {
        await patchMemory.mutateAsync({ id: memory!.id, content: content.trim(), category: category.trim(), tags: tags.trim() })
      } else {
        await createMemory.mutateAsync({ content: content.trim(), category: category.trim() || undefined, tags: tags.trim() || undefined })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 480,
          maxWidth: 'calc(100vw - 32px)',
          background: '#1e2433',
          borderRadius: 12,
          padding: 24,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <h3 style={{ margin: '0 0 20px', color: '#f1f5f9', fontSize: 16, fontWeight: 600 }}>
          {isEditing ? 'Edit Memory' : 'Add Memory'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Content */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              Content <span style={{ color: '#f87171' }}>*</span>
            </label>
            <textarea
              rows={4}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Memory content…"
              style={{
                width: '100%',
                background: '#0f1117',
                border: `1px solid ${error && !content.trim() ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8,
                color: '#f1f5f9',
                fontSize: 14,
                padding: '10px 12px',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Category */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              Category
            </label>
            <input
              list="gc-categories"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g. work, personal, tech…"
              style={{
                width: '100%',
                background: '#0f1117',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: '#f1f5f9',
                fontSize: 14,
                padding: '10px 12px',
                boxSizing: 'border-box',
              }}
            />
            <datalist id="gc-categories">
              {categories.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {/* Tags */}
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              Tags
            </label>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="comma,separated"
              style={{
                width: '100%',
                background: '#0f1117',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: '#f1f5f9',
                fontSize: 14,
                padding: '10px 12px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 12, color: '#f87171', fontSize: 13 }}>{error}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isBusy}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#94a3b8',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isBusy}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: isBusy ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.9)',
              border: 'none',
              color: isBusy ? 'rgba(245,158,11,0.6)' : '#0a0e1a',
              fontSize: 13,
              fontWeight: 600,
              cursor: isBusy ? 'default' : 'pointer',
            }}
          >
            {isBusy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
