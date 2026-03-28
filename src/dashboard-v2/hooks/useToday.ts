import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
}

export interface GymEvent {
  name: string
  sets: number
}

export interface TodayData {
  events: CalendarEvent[]
  workout: GymEvent | null
}

interface RawCalEvent {
  summary?: string
  date?: string
  startISO?: string
  endISO?: string
  start?: string
  end?: string
  location?: string
}

interface CalendarApiResponse {
  events: RawCalEvent[]
}

async function fetchToday(): Promise<TodayData> {
  const todayYMD = new Date().toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('-') // → YYYY-MM-DD

  const [calResult, gymResult] = await Promise.allSettled([
    api.get<CalendarApiResponse>('/api/calendar?view=day'),
    api.get<{ today: GymEvent | null }>('/api/gym'),
  ])

  let events: CalendarEvent[] = []
  if (calResult.status === 'fulfilled') {
    const raw = (calResult.value as CalendarApiResponse).events ?? []
    events = raw
      .filter(e => !e.date || e.date === todayYMD)
      .map((e, i) => ({
        id: String(i),
        title: e.summary ?? '(No title)',
        start: e.startISO ?? e.start ?? '',
        end: e.endISO ?? e.end ?? '',
      }))
  }

  return {
    events,
    workout: gymResult.status === 'fulfilled' ? gymResult.value.today : null,
  }
}

export function useToday() {
  return useQuery({
    queryKey: queryKeys.today,
    queryFn: fetchToday,
    staleTime: 5 * 60_000,
  })
}
