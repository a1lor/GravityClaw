import { ChevronRight } from 'lucide-react'

interface CommandResultProps {
  icon: React.ElementType
  primary: string
  secondary?: string
  isSelected: boolean
  onClick: () => void
}

export function CommandResult({ icon: Icon, primary, secondary, isSelected, onClick }: CommandResultProps) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        cursor: 'pointer',
        background: isSelected ? 'rgba(167,139,250,0.1)' : 'transparent',
      }}
    >
      <Icon size={16} color="#4b5563" aria-hidden />
      <span
        style={{
          fontSize: 13,
          color: '#f1f5f9',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {primary.length > 50 ? primary.slice(0, 50) + '…' : primary}
      </span>
      {secondary && (
        <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>{secondary}</span>
      )}
      <ChevronRight size={14} color="#4b5563" aria-hidden />
    </div>
  )
}
