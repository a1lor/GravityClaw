import { useMemo } from 'react'
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Memory } from '@/hooks/useMemories'

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

interface MemoryNodeData {
  memory: Memory
  color: string
  selected?: boolean
  [key: string]: unknown
}

function MemoryNode({ data }: { data: MemoryNodeData }) {
  const { memory, color, selected } = data
  return (
    <div style={{
      background: color,
      borderRadius: 8,
      padding: '8px 12px',
      maxWidth: 160,
      fontSize: 12,
      color: '#0a0e1a',
      fontWeight: 500,
      border: selected ? '2px solid #F59E0B' : '1px solid rgba(255,255,255,0.2)',
      cursor: 'pointer',
      lineHeight: 1.4,
    }}>
      {memory.content.slice(0, 50)}{memory.content.length > 50 ? '…' : ''}
    </div>
  )
}

const nodeTypes: NodeTypes = { memoryNode: MemoryNode as any }

export function buildGraph(memories: Memory[]): { nodes: any[]; edges: any[] } {
  if (memories.length === 0) return { nodes: [], edges: [] }

  // Group by category
  const groups = new Map<string, Memory[]>()
  for (const m of memories) {
    const cat = m.category || 'general'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(m)
  }

  const categories = Array.from(groups.keys())
  const total = categories.length
  const cx = 600
  const cy = 400
  const radius = 280

  const nodes: any[] = []
  const edges: any[] = []

  categories.forEach((cat, catIdx) => {
    const angle = (catIdx / total) * 2 * Math.PI
    const clusterX = cx + Math.cos(angle) * radius
    const clusterY = cy + Math.sin(angle) * radius
    const mems = groups.get(cat)!
    const cols = Math.ceil(Math.sqrt(mems.length))

    mems.forEach((memory, i) => {
      const row = Math.floor(i / cols)
      const col = i % cols
      const jitterX = Math.sin(memory.id * 7) * 20
      const jitterY = Math.cos(memory.id * 5) * 20

      nodes.push({
        id: String(memory.id),
        type: 'memoryNode',
        position: {
          x: clusterX + (col - cols / 2) * 180 + jitterX,
          y: clusterY + row * 80 + jitterY,
        },
        data: {
          memory,
          color: categoryColor(cat),
        },
      })
    })
  })

  // Build edges for memories sharing ≥1 tag
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const tagsA = memories[i].tags ? memories[i].tags.split(',').map(t => t.trim()).filter(Boolean) : []
      const tagsB = memories[j].tags ? memories[j].tags.split(',').map(t => t.trim()).filter(Boolean) : []
      const intersection = tagsA.filter(t => tagsB.includes(t))
      if (intersection.length > 0) {
        edges.push({
          id: `e-${memories[i].id}-${memories[j].id}`,
          source: String(memories[i].id),
          target: String(memories[j].id),
          style: { stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 },
        })
      }
    }
  }

  return { nodes, edges }
}

interface GraphViewProps {
  memories: Memory[]
  onNodeClick: (memory: Memory) => void
  selectedMemoryId?: number | null
}

export default function GraphView({ memories, onNodeClick, selectedMemoryId }: GraphViewProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraph(memories),
    [memories]
  )

  const nodesWithSelection = useMemo(
    () => initialNodes.map(n => ({
      ...n,
      data: { ...n.data, selected: n.data.memory.id === selectedMemoryId },
    })),
    [initialNodes, selectedMemoryId]
  )

  const [nodes, , onNodesChange] = useNodesState(nodesWithSelection)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      onNodeClick={(_evt, node) => {
        const memory = memories.find(m => String(m.id) === node.id)
        if (memory) onNodeClick(memory)
      }}
      style={{ background: '#0a0e1a', position: 'absolute', inset: 0 }}
    >
      <Background color="rgba(255,255,255,0.04)" gap={24} />
      <Controls />
    </ReactFlow>
  )
}
