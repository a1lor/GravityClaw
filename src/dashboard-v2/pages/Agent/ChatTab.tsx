import { useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useCreateDialogue, useDialogues } from '@/hooks/useDialogues'
import { useModels } from '@/hooks/useModels'
import DialogueSidebar from './DialogueSidebar'
import ChatPane from './ChatPane'

export default function ChatTab() {
  const isMobile = useIsMobile()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const { data: dialogues } = useDialogues()
  const { data: models } = useModels()
  const createDialogue = useCreateDialogue()

  async function handleNewChat() {
    const defaultModel = models[0]?.id ?? 'anthropic/claude-3.7-sonnet'
    const title = `Chat ${new Date().toLocaleDateString()}`
    const created = await createDialogue.mutateAsync({ title, model: defaultModel })
    setSelectedId(created.id)
    if (isMobile) setShowMobileSidebar(false)
  }

  function handleSelect(id: number) {
    setSelectedId(id)
    if (isMobile) setShowMobileSidebar(false)
  }

  if (isMobile) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Mobile: no dialogue selected or showing sidebar */}
        {(!selectedId || showMobileSidebar) ? (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <button
                onClick={handleNewChat}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: 'rgba(245,158,11,0.15)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  color: '#F59E0B',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + New Chat
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {dialogues.map(d => (
                <div
                  key={d.id}
                  onClick={() => handleSelect(d.id)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 14, color: '#f1f5f9', marginBottom: 2 }}>
                    {d.title.length > 40 ? d.title.slice(0, 40) + '…' : d.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#4b5563' }}>
                    {d.model.split('/').pop()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ChatPane
            dialogueId={selectedId}
            onBack={() => setShowMobileSidebar(true)}
          />
        )}

        {/* Mobile: show "Conversations" button when dialogue is selected */}
        {selectedId && !showMobileSidebar && (
          <div style={{ display: 'none' }} /> /* handled by ChatPane's Back button */
        )}
      </div>
    )
  }

  // Desktop layout
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
      <DialogueSidebar
        selectedId={selectedId}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        onDeleted={(id) => { if (selectedId === id) setSelectedId(null) }}
      />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedId ? (
          <ChatPane dialogueId={selectedId} />
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#4b5563',
            fontSize: 14,
          }}>
            Select a conversation or create a new one
          </div>
        )}
      </div>
    </div>
  )
}
