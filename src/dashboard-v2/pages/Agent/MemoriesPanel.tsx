import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface Memory {
  id: number
  content: string
  category: string
  tags: string
  is_archived: number
  created_at: string
  accessed_at: string
  access_count: number
}

function parseTags(raw: string): string[] {
  return (raw || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function splitForPlaceholder(raw: string) {
  return (raw || '').replace(/\n/g, ' ').trim()
}

export function MemoriesPanel({ initialMemoryId }: { initialMemoryId?: string | null }) {
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const listQuery = useQuery({
    queryKey: ['memories'],
    queryFn: () => api.get<Memory[]>('/api/memories?limit=200'),
    staleTime: 30_000,
  })

  const searchQuery = useQuery({
    queryKey: ['memories', 'search', search],
    queryFn: () => api.get<Memory[]>(`/api/memories/search?q=${encodeURIComponent(search)}&limit=60`),
    enabled: search.trim().length > 0,
    staleTime: 30_000,
  })

  const memories = search.trim().length > 0 ? (searchQuery.data ?? []) : (listQuery.data ?? [])
  const selected = memories.find((m) => m.id === selectedId) ?? null

  useEffect(() => {
    const idNum = initialMemoryId ? Number(initialMemoryId) : NaN
    if (!Number.isFinite(idNum)) return
    if (memories.some((m) => m.id === idNum)) setSelectedId(idNum)
  }, [initialMemoryId, memories])

  // Create memory state
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [newTags, setNewTags] = useState('')

  const createMemory = useMutation({
    mutationFn: async () => {
      return api.post<{ id: number }>('/api/memories', {
        content: newContent,
        category: newCategory,
        tags: newTags,
      })
    },
    onSuccess: () => {
      setNewContent('')
      setNewTags('')
      qc.invalidateQueries({ queryKey: ['memories'] })
      qc.invalidateQueries({ queryKey: ['memories', 'search', search] })
    },
  })

  // Edit memory state
  const [editContent, setEditContent] = useState('')
  const [editCategory, setEditCategory] = useState('general')
  const [editTags, setEditTags] = useState('')

  useEffect(() => {
    if (!selected) return
    setEditContent(selected.content)
    setEditCategory(selected.category || 'general')
    setEditTags(selected.tags || '')
  }, [selected])

  const updateMemory = useMutation({
    mutationFn: async () => {
      if (!selected) return
      return api.patch(`/api/memories/${selected.id}`, {
        content: editContent,
        category: editCategory,
        tags: editTags,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memories'] })
      qc.invalidateQueries({ queryKey: ['memories', 'search', search] })
    },
  })

  const deleteMemory = useMutation({
    mutationFn: async () => {
      if (!selected) return
      return api.del(`/api/memories/${selected.id}`)
    },
    onSuccess: () => {
      setSelectedId(null)
      qc.invalidateQueries({ queryKey: ['memories'] })
      qc.invalidateQueries({ queryKey: ['memories', 'search', search] })
    },
  })

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    memories.forEach((m) => {
      parseTags(m.tags).forEach((t) => {
        const key = t.toLowerCase()
        counts[key] = (counts[key] ?? 0) + 1
      })
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
  }, [memories])

  return (
    <div style={{ height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex' }}>
      {/* Left: list */}
      <div style={{ width: 360, borderRight: '1px solid rgba(255,255,255,0.06)', padding: 16, overflow: 'hidden' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
          Memories
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search content/tags…"
            style={{
              flex: 1,
              height: 36,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: '0 12px',
              color: '#e2e8f0',
              outline: 'none',
              fontSize: 12,
            }}
          />
          <button
            onClick={() => setSearch('')}
            style={{
              width: 56,
              height: 36,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              color: '#94a3b8',
              fontSize: 12,
              cursor: 'pointer',
            }}
            title="Clear search"
          >
            Clear
          </button>
        </div>

        <div style={{ overflowY: 'auto', height: 'calc(100% - 68px)' }}>
          {listQuery.isLoading && search.trim().length === 0 && (
            <div style={{ color: '#64748b', padding: 20, fontSize: 12 }}>Loading…</div>
          )}

          {memories.map((m) => {
            const isSelected = m.id === selectedId
            const tags = parseTags(m.tags)
            return (
              <div
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: isSelected ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  background: isSelected ? 'rgba(59,130,246,0.08)' : 'transparent',
                  cursor: 'pointer',
                  marginBottom: 8,
                  opacity: m.is_archived ? 0.6 : 1,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {splitForPlaceholder(m.content)}
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.category || 'general'}
                </div>
                {tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#94a3b8',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 999,
                          padding: '2px 8px',
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {!listQuery.isLoading && memories.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 12 }}>No memories found</div>
          )}
        </div>
      </div>

      {/* Right: CRUD */}
      <div style={{ flex: 1, overflow: 'hidden', padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto' }}>
          {/* Graph-ish summary: top tags */}
          <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
              Graph (tags)
            </div>
            {tagCounts.length === 0 ? (
              <div style={{ fontSize: 12, color: '#64748b' }}>No tag data yet.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tagCounts.map(([t, c]) => (
                  <button
                    key={t}
                    onClick={() => setSearch(t)}
                    style={{
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.18)',
                      borderRadius: 999,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      color: '#F59E0B',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                    title={`Filter by tag: ${t}`}
                  >
                    {t} <span style={{ color: '#94a3b8' }}>· {c}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Create */}
          <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9' }}>Add memory</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>CRUD</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Write a memory…"
                rows={3}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  padding: 12,
                  color: '#e2e8f0',
                  fontSize: 12,
                  outline: 'none',
                  resize: 'vertical',
                }}
              />

              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Category"
                  style={{
                    flex: 1,
                    height: 36,
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: '0 12px',
                    color: '#e2e8f0',
                    outline: 'none',
                    fontSize: 12,
                  }}
                />
                <input
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="Tags (comma-separated)"
                  style={{
                    flex: 1.2,
                    height: 36,
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: '0 12px',
                    color: '#e2e8f0',
                    outline: 'none',
                    fontSize: 12,
                  }}
                />
              </div>

              <button
                onClick={() => createMemory.mutate()}
                disabled={createMemory.isPending || !newContent.trim()}
                style={{
                  height: 40,
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: createMemory.isPending || !newContent.trim() ? 'not-allowed' : 'pointer',
                  opacity: createMemory.isPending || !newContent.trim() ? 0.6 : 1,
                }}
              >
                {createMemory.isPending ? 'Saving…' : 'Save Memory'}
              </button>
            </div>
          </div>

          {/* Editor */}
          <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9' }}>
                {selected ? `Edit memory #${selected.id}` : 'Select a memory'}
              </div>
              {selected && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => updateMemory.mutate()}
                    disabled={updateMemory.isPending}
                    style={{
                      height: 34,
                      background: '#a78bfa',
                      border: 'none',
                      borderRadius: 10,
                      color: '#000',
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: updateMemory.isPending ? 'not-allowed' : 'pointer',
                      opacity: updateMemory.isPending ? 0.6 : 1,
                      padding: '0 12px',
                    }}
                  >
                    {updateMemory.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this memory?')) deleteMemory.mutate()
                    }}
                    disabled={deleteMemory.isPending}
                    style={{
                      height: 34,
                      background: 'rgba(248,113,113,0.12)',
                      border: '1px solid rgba(248,113,113,0.25)',
                      borderRadius: 10,
                      color: '#f87171',
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: deleteMemory.isPending ? 'not-allowed' : 'pointer',
                      opacity: deleteMemory.isPending ? 0.6 : 1,
                      padding: '0 12px',
                    }}
                  >
                    {deleteMemory.isPending ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>

            {!selected ? (
              <div style={{ fontSize: 12, color: '#64748b' }}>Pick a memory on the left to edit it.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={5}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: 12,
                    color: '#e2e8f0',
                    fontSize: 12,
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    style={{
                      flex: 1,
                      height: 36,
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      padding: '0 12px',
                      color: '#e2e8f0',
                      outline: 'none',
                      fontSize: 12,
                    }}
                  />
                  <input
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    style={{
                      flex: 1.2,
                      height: 36,
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      padding: '0 12px',
                      color: '#e2e8f0',
                      outline: 'none',
                      fontSize: 12,
                    }}
                  />
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>Tags are stored as a comma-separated string.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
