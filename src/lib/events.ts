import { z } from 'zod'
import type { DateStr } from './date'

export type EventKind = 'dryland' | 'swim' | 'meet'
export type EventStatus = 'normal' | 'canceled'

export type CalendarEvent = {
  id: string
  athlete_id: string
  kind: EventKind
  date: DateStr
  start_time: string
  place: string
  duration_min: number
  status: EventStatus
  cancel_reason: string | null
  changed_from: unknown
  change_ack_at: string | null
  completed_at: string | null
  updated_at: string
}

export const EVENT_COLUMNS =
  'id, athlete_id, kind, date, start_time, place, duration_min, status, cancel_reason, changed_from, change_ack_at, completed_at, updated_at'

export const kindLabel: Record<EventKind, string> = {
  dryland: 'ドライランド',
  swim: '水中練習',
  meet: '試合',
}

/** 種類ごとの色（背景・文字・枠） */
export const kindStyle: Record<EventKind, { dot: string; chip: string }> = {
  dryland: { dot: 'bg-orange-500', chip: 'border-orange-300 bg-orange-50 text-orange-900' },
  swim: { dot: 'bg-sky-500', chip: 'border-sky-300 bg-sky-50 text-sky-900' },
  meet: { dot: 'bg-rose-600', chip: 'border-rose-300 bg-rose-50 text-rose-900' },
}

/** 予定の入力内容（DB の CHECK 制約と同じ範囲） */
export const eventInputSchema = z.object({
  kind: z.enum(['dryland', 'swim', 'meet'], { message: '種類を選んでください' }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付を入力してください'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, '開始時刻を入力してください'),
  place: z.string().trim().max(50, '場所は50文字までです'),
  duration_min: z.coerce
    .number({ message: '時間を分で入力してください' })
    .int('時間は分（整数）で入力してください')
    .min(1, '時間は1分以上にしてください')
    .max(600, '時間は600分（10時間）までです'),
})

export type EventInput = z.infer<typeof eventInputSchema>

export const cancelReasonSchema = z
  .string()
  .trim()
  .min(1, '中止の理由を入力してください')
  .max(100, '理由は100文字までです')

/** コピーされるのは枠（種類・時刻・場所・時間）だけ */
export type EventTemplate = Pick<EventInput, 'kind' | 'start_time' | 'place' | 'duration_min'>

export function toTemplate(e: Pick<CalendarEvent, 'kind' | 'start_time' | 'place' | 'duration_min'>): EventTemplate {
  return { kind: e.kind, start_time: e.start_time.slice(0, 5), place: e.place, duration_min: e.duration_min }
}

/** 貼り付け：選んだ日ごとに1件ずつ（既存の予定は上書きしない） */
export function pasteRows(t: EventTemplate, dates: DateStr[]): EventInput[] {
  return [...new Set(dates)].sort().map((date) => ({ ...t, date }))
}

/** 1日の予定を開始時刻順に（同時刻は作成順のまま） */
export function sortByTime<T extends Pick<CalendarEvent, 'start_time'>>(events: T[]): T[] {
  return [...events].sort((a, b) => a.start_time.localeCompare(b.start_time))
}

export function groupByDate<T extends Pick<CalendarEvent, 'date' | 'start_time'>>(
  events: T[],
): Map<DateStr, T[]> {
  const map = new Map<DateStr, T[]>()
  for (const e of sortByTime(events)) {
    const list = map.get(e.date) ?? []
    list.push(e)
    map.set(e.date, list)
  }
  return map
}
