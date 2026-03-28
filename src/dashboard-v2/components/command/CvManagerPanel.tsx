import { useState, useRef } from 'react'
import { ChevronLeft, Download, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useCvs, useDeleteCv } from '@/hooks/useCvs'
import { queryKeys } from '@/lib/query-keys'

interface CvManagerPanelProps {
  onBack: () => void
}

function tokenUrl(path: string): string {
  const token = localStorage.getItem('gc_token') ?? ''
  const sep = path.includes('?') ? '&' : '?'
  return token ? `${path}${sep}token=${token}` : path
}

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString()
  } catch {
    return ts
  }
}

export function CvManagerPanel({ onBack }: CvManagerPanelProps) {
  const { data: cvs = [], isLoading } = useCvs()
  const deleteCv = useDeleteCv()
  const qc = useQueryClient()

  const [jobType, setJobType] = useState('')
  const [language, setLanguage] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('job_type', jobType)
      formData.append('language', language)
      formData.append('label', file.name)
      const res = await fetch(tokenUrl('/api/cvs/upload'), { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      await qc.invalidateQueries({ queryKey: queryKeys.cvs })
      setJobType('')
      setLanguage('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: '#94a3b8',
            fontSize: 13,
            padding: '2px 4px',
          }}
        >
          <ChevronLeft size={16} aria-hidden />
          Back
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>CV Manager</span>
      </div>

      {/* CV list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && (
          <div style={{ padding: 16, color: '#94a3b8', fontSize: 13 }}>Loading…</div>
        )}
        {!isLoading && cvs.length === 0 && (
          <div style={{ padding: 16, color: '#4b5563', fontSize: 13 }}>No CVs uploaded yet.</div>
        )}
        {cvs.map((cv) => (
          <div
            key={cv.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              fontSize: 13,
            }}
          >
            <span style={{ color: '#a78bfa', minWidth: 80, flexShrink: 0 }}>{cv.job_type}</span>
            <span style={{ color: '#94a3b8', minWidth: 40, flexShrink: 0 }}>{cv.language}</span>
            <span
              style={{
                color: '#f1f5f9',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {cv.file_name}
            </span>
            <span style={{ color: '#4b5563', fontSize: 11, flexShrink: 0 }}>
              {formatDate(cv.updated_at)}
            </span>
            <a
              href={tokenUrl(`/api/cvs/${cv.id}/download`)}
              target="_blank"
              rel="noreferrer"
              aria-label="Download CV"
              style={{ color: '#38bdf8', display: 'flex', alignItems: 'center' }}
            >
              <Download size={14} aria-hidden />
            </a>
            <button
              onClick={() => deleteCv.mutate(cv.id)}
              aria-label="Delete CV"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}

        {/* Upload section */}
        <div
          style={{
            padding: 16,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 11, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Upload CV
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Job type"
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                padding: '6px 8px',
                color: '#f1f5f9',
                fontSize: 12,
              }}
            />
            <input
              placeholder="Language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                padding: '6px 8px',
                color: '#f1f5f9',
                fontSize: 12,
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}
            />
            <button
              onClick={handleUpload}
              disabled={uploading}
              style={{
                background: '#a78bfa',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: '#0a0e1a',
                cursor: 'pointer',
                opacity: uploading ? 0.6 : 1,
                flexShrink: 0,
              }}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          {uploadError && (
            <div style={{ fontSize: 12, color: '#f87171' }}>{uploadError}</div>
          )}
        </div>
      </div>
    </div>
  )
}
