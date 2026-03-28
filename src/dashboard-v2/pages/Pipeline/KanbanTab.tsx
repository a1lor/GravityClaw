import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApplications } from '@/hooks/useApplications'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { ApplicationCard } from './ApplicationCard'
import type { Application } from '@/hooks/useApplications'

function ApplicationSheet({
  application,
  onClose,
}: {
  application: Application
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [errorMessage, setErrorMessage] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: (newStatus: string) =>
      api.patch<Application>(`/api/applications/${encodeURIComponent(application.id)}`, {
        status: newStatus,
      }),
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.applications })
      const previous = queryClient.getQueryData<Application[]>(queryKeys.applications)
      queryClient.setQueryData<Application[]>(queryKeys.applications, (old) =>
        (old ?? []).map((a) =>
          a.id === application.id ? { ...a, status: newStatus } : a
        )
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.applications, context.previous)
      }
      setErrorMessage('Move failed')
    },
    onSuccess: () => onClose(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.applications })
    },
  })

  const statuses = ['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn']

  return (
    <>
      <div
        data-testid="backdrop"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 99,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: '#0f1117',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px 12px 0 0',
          padding: 20,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 16 }}>{application.company}</div>
          <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 2 }}>{application.position}</div>
        </div>

        {errorMessage && (
          <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{errorMessage}</div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {statuses.map((status) => {
            const isCurrent = status === application.status
            return (
              <button
                key={status}
                disabled={isCurrent || isPending}
                onClick={() => mutate(status)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: isCurrent || isPending ? 'default' : 'pointer',
                  background: isCurrent ? '#a78bfa' : 'rgba(255,255,255,0.06)',
                  color: isCurrent ? '#000' : '#94a3b8',
                  border: 'none',
                  opacity: isPending && !isCurrent ? 0.5 : 1,
                  fontWeight: isCurrent ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {status}
              </button>
            )
          })}
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: 10,
            background: 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 8,
            color: '#94a3b8', cursor: 'pointer', fontSize: 14,
          }}
        >
          Close
        </button>
      </div>
    </>
  )
}

export function KanbanTab() {
  const { data: applications, isLoading, isError } = useApplications()
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)

  if (isLoading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
        Loading applications...
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#f87171' }}>
        Failed to load applications
      </div>
    )
  }

  if (applications.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#4b5563' }}>
        No applications yet
      </div>
    )
  }

  // Group applications by status
  const columns = applications.reduce<Record<string, Application[]>>((acc, app) => {
    const key = app.status
    if (!acc[key]) acc[key] = []
    acc[key].push(app)
    return acc
  }, {})

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          padding: 16,
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        {Object.entries(columns).map(([status, apps]) => (
          <div
            key={status}
            style={{
              minWidth: 200,
              flex: '0 0 200px',
              background: '#0f1117',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 12,
              alignSelf: 'flex-start',
            }}
          >
            {/* Column header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'capitalize',
                }}
              >
                {status}
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.08)',
                  color: '#64748b',
                }}
              >
                {apps.length}
              </span>
            </div>

            {/* Application cards */}
            {apps.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                onClick={() => setSelectedApp(app)}
              />
            ))}
          </div>
        ))}
      </div>

      {selectedApp && (
        <ApplicationSheet
          application={selectedApp}
          onClose={() => setSelectedApp(null)}
        />
      )}
    </>
  )
}
