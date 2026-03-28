export type PipelineStatus = 'new' | 'applied' | 'interview' | 'offer' | 'rejected' | 'saved' | 'iced'

export const PIPELINE_STAGES: PipelineStatus[] = [
  'new', 'applied', 'interview', 'offer', 'rejected', 'saved', 'iced',
]

export const STAGE_LABELS: Record<PipelineStatus, string> = {
  new: 'New',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  saved: 'Saved',
  iced: '🧊 Iced',
}
