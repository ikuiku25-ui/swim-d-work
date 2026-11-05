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
  changed_from: ChangedFrom | null
  change_ack_at: string | null
  updated_at: string
  /** メニューが入っていれば、その更新日時など（なければ null） */
  menu: { event_id: string; updated_at: string; notified_at: string | null } | null
  /** 実施記録があれば、記録開始・完了の状態（なければ null） */
  record: { started: boolean; completed_at: string | null } | null
}

/** メニュー設定後に変わった項目の、変更前の値 */
export type ChangedFrom = { date: string; start_time: string; place: string; duration_min: number }

export const EVENT_COLUMNS =
  'id, athlete_id, kind, date, start_time, place, duration_min, status, cancel_reason, changed_from, change_ack_at, updated_at, menu:menus(event_id, updated_at, notified_at), record:records(started, completed_at)'

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

export type MenuState = 'none' | 'set' | 'in_progress' | 'done'

/** ドライランド枠の状態：メニュー未設定／設定済み／実施中（記録開始・未完了）／実施済み（完了） */
export function menuState(e: Pick<CalendarEvent, 'menu' | 'record'>): MenuState {
  if (!e.menu) return 'none'
  if (e.record?.completed_at) return 'done'
  if (e.record?.started) return 'in_progress'
  return 'set'
}

export const menuStateLabel: Record<MenuState, string> = {
  none: 'メニュー未設定',
  set: 'メニューあり',
  in_progress: '実施中',
  done: '実施済み',
}

/** 変更ありの表示：'11/10 16:00 学校 40分 → 11/12 17:00 自宅 40分' のうち変わった項目だけ */
export function describeChange(
  from: ChangedFrom,
  to: Pick<CalendarEvent, 'date' | 'start_time' | 'place' | 'duration_min'>,
): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
  const parts: string[] = []
  if (from.date !== to.date || from.start_time !== to.start_time.slice(0, 5)) {
    parts.push(`${md(from.date)} ${from.start_time} → ${md(to.date)} ${to.start_time.slice(0, 5)}`)
  }
  if (from.place !== to.place) parts.push(`場所 ${from.place || 'なし'} → ${to.place || 'なし'}`)
  if (from.duration_min !== to.duration_min) parts.push(`${from.duration_min}分 → ${to.duration_min}分`)
  return parts.join('、')
}

/** メニューを保存したあと、まだ選手に知らせていないか（初回未通知、または通知後に内容を変えた） */
export function isUnnotified(e: Pick<CalendarEvent, 'menu'>): boolean {
  if (!e.menu) return false
  return !e.menu.notified_at || e.menu.updated_at > e.menu.notified_at
}

/** notify-menu の結果を、コーチ向けの文にする */
export function notifyResultText(athletes: { name: string; delivered: number }[]): string {
  if (athletes.length === 0) return '通知する対象がありませんでした。'
  const ok = athletes.filter((a) => a.delivered > 0).map((a) => `${a.name}さん`)
  const none = athletes.filter((a) => a.delivered === 0).map((a) => `${a.name}さん`)
  const parts: string[] = []
  if (ok.length) parts.push(`${ok.join('、')}に通知しました。`)
  if (none.length) parts.push(`${none.join('、')}は通知の設定がまだのため、端末には届いていません（アプリを開けばメニューは見えます）。`)
  return parts.join('')
}
