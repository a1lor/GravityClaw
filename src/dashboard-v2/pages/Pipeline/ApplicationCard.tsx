import type { Application } from '@/hooks/useApplications'

interface ApplicationCardProps {
  application: Application
  onClick: () => void
}

export function ApplicationCard({ application, onClick }: ApplicationCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#0f1117',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: 12,
        cursor: 'pointer',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          color: '#f1f5f9',
          fontSize: 14,
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {application.company}
      </div>
      <div
        style={{
          color: '#94a3b8',
          fontSize: 12,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: application.url ? 6 : 0,
        }}
      >
        {application.position}
      </div>
      {application.url && (
        <a
          href={application.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: '#a78bfa',
            fontSize: 11,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {application.url}
        </a>
      )}
    </div>
  )
}
