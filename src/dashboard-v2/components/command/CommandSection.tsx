import { CommandResult } from './CommandResult'

interface CommandSectionProps {
  label: string
  results: Array<{ primary: string; secondary?: string }>
  icon: React.ElementType
  selectedOffset: number
  selectedIndex: number
  onActivate: (index: number) => void
}

export function CommandSection({
  label,
  results,
  icon,
  selectedOffset,
  selectedIndex,
  onActivate,
}: CommandSectionProps) {
  if (results.length === 0) return null

  return (
    <div>
      <div
        style={{
          padding: '8px 16px 4px',
          fontSize: 11,
          color: '#4b5563',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {label}
      </div>
      {results.map((result, i) => (
        <CommandResult
          key={i}
          icon={icon}
          primary={result.primary}
          secondary={result.secondary}
          isSelected={selectedOffset + i === selectedIndex}
          onClick={() => onActivate(selectedOffset + i)}
        />
      ))}
    </div>
  )
}
