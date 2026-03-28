import { useState, useCallback } from 'react'
import { useMemories, type Memory } from '@/hooks/useMemories'
import GraphView from './GraphView'

function formatDate(raw: string): string {
  return new Date(raw).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function GraphTab() {
  const { data: memories, isLoading, isError } = useMemories()
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null)

  const handleNodeClick = useCallback((memory: Memory) => {
    setSelectedMemory(prev => prev?.id === memory.id ? null : memory)
  }, [])

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563' }}>
        Loading…
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171' }}>
        Failed to load memories
      </div>
    )
  }

  if (memories.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontSize: 14 }}>
        No memories to display
      </div>
    )
  }

  return (
    <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}>
      {/* ReactFlow canvas */}
      <div style={{ flex: 1, position: 'relative', height: '100%', minHeight: 0, minWidth: 0 }}>
        <GraphView
          memories={memories}
          onNodeClick={handleNodeClick}
          selectedMemoryId={selectedMemory?.id ?? null}
        />
        {/* Count overlay */}
        <div style={{
          position: 'absolute',
          top: 12,
          right: 12,
          fontSize: 11,
          color: '#4b5563',
          pointerEvents: 'none',
          zIndex: 5,
        }}>
          {memories.length} memories
        </div>
      </div>

      {/* Selected memory detail panel */}
      {selectedMemory && (
        <div style={{
          width: 300,
          flexShrink: 0,
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          background: '#0f1117',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Memory Detail</span>
            <button
              onClick={() => setSelectedMemory(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#4b5563',
                cursor: 'pointer',
                fontSize: 16,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {selectedMemory.category && (
              <div style={{ marginBottom: 12 }}>
                <span style={{
                  fontSize: 10,
                  borderRadius: 4,
                  padding: '2px 8px',
                  background: 'rgba(245,158,11,0.15)',
                  color: '#F59E0B',
                  border: '1px solid rgba(245,158,11,0.3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}>
                  {selectedMemory.category}
                </span>
              </div>
            )}
            <p style={{ fontSize: 13, color: '#f1f5f9', lineHeight: 1.6, margin: '0 0 12px' }}>
              {selectedMemory.content}
            </p>
            {selectedMemory.tags && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                {selectedMemory.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                  <span key={tag} style={{
                    fontSize: 10,
                    borderRadius: 4,
                    padding: '1px 6px',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#4b5563' }}>
              {formatDate(selectedMemory.created_at)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
