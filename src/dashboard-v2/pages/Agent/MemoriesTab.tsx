import { useState, useEffect, useRef } from 'react'
import { useMemories, useSearchMemories, useDeleteMemory, type Memory } from '@/hooks/useMemories'
import MemoryCard from './MemoryCard'
import MemoryEditModal from './MemoryEditModal'

export default function MemoriesTab() {
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [editingMemory, setEditingMemory] = useState<Memory | undefined>(undefined)
  const [showModal, setShowModal] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const deleteMemory = useDeleteMemory()

  // Debounce search input 400ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(searchInput)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  const isSearching = debouncedQ.length >= 2
  const { data: allMemories, isLoading: allLoading, isError: allError } = useMemories()
  const { data: searchResults, isLoading: searchLoading, isError: searchError } = useSearchMemories(debouncedQ)

  const rawMemories = isSearching ? searchResults : allMemories
  const isLoading = isSearching ? searchLoading : allLoading
  const isError = isSearching ? searchError : allError

  // Derive unique categories from allMemories (always from full list, not filtered)
  const categories = Array.from(new Set(allMemories.map(m => m.category).filter(Boolean))).sort()

  // Client-side category filter
  const memories = categoryFilter
    ? rawMemories.filter(m => m.category === categoryFilter)
    : rawMemories

  function handleEdit(memory: Memory) {
    setEditingMemory(memory)
    setShowModal(true)
  }

  function handleAddNew() {
    setEditingMemory(undefined)
    setShowModal(true)
  }

  function handleCloseModal() {
    setShowModal(false)
    setEditingMemory(undefined)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Search + Add bar */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
      }}>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search memories…"
          style={{
            flex: 1,
            background: '#1e2433',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            color: '#f1f5f9',
            fontSize: 13,
            padding: '8px 12px',
          }}
        />
        <button
          onClick={handleAddNew}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: 'rgba(245,158,11,0.15)',
            border: '1px solid rgba(245,158,11,0.3)',
            color: '#F59E0B',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          + Add Memory
        </button>
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          flexShrink: 0,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => setCategoryFilter('')}
            style={{
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 11,
              cursor: 'pointer',
              border: !categoryFilter ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.08)',
              background: !categoryFilter ? 'rgba(245,158,11,0.12)' : 'transparent',
              color: !categoryFilter ? '#F59E0B' : '#94a3b8',
            }}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
              style={{
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: 11,
                cursor: 'pointer',
                border: categoryFilter === cat ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: categoryFilter === cat ? 'rgba(245,158,11,0.12)' : 'transparent',
                color: categoryFilter === cat ? '#F59E0B' : '#94a3b8',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Memory list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {isLoading && (
          <div style={{ textAlign: 'center', color: '#4b5563', padding: 32 }}>Loading…</div>
        )}
        {isError && (
          <div style={{ textAlign: 'center', color: '#f87171', padding: 32 }}>Failed to load memories</div>
        )}
        {!isLoading && !isError && memories.length === 0 && (
          <div style={{ textAlign: 'center', color: '#4b5563', padding: 32, fontSize: 14 }}>
            {isSearching ? 'No memories found' : 'No memories yet'}
          </div>
        )}
        {!isLoading && !isError && memories.map(memory => (
          <MemoryCard
            key={memory.id}
            memory={memory}
            onEdit={() => handleEdit(memory)}
            onDelete={() => deleteMemory.mutate(memory.id)}
          />
        ))}
      </div>

      {showModal && (
        <MemoryEditModal
          memory={editingMemory}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}
