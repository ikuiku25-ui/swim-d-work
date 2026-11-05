/**
 * 日付は 'YYYY-MM-DD' の文字列で扱う（日本時間の暦日）。
 * Date オブジェクトは UTC の 0時として使い、端末のタイムゾーンに左右されないようにする。
 */
export type DateStr = string

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

function toUtc(d: DateStr): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

function fromUtc(dt: Date): DateStr {
  return dt.toISOString().slice(0, 10)
}

/** 日本時間の今日 */
export function todayJst(now: Date = new Date()): DateStr {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function addDays(d: DateStr, n: number): DateStr {
  const dt = toUtc(d)
  dt.setUTCDate(dt.getUTCDate() + n)
  return fromUtc(dt)
}

/** d から n 日分の日付（d を含む） */
export function daysFrom(d: DateStr, n: number): DateStr[] {
  return Array.from({ length: n }, (_, i) => addDays(d, i))
}

/** 0=日曜 … 6=土曜 */
export function weekdayIndex(d: DateStr): number {
  return toUtc(d).getUTCDay()
}

export function weekdayLabel(d: DateStr): string {
  return WEEKDAYS[weekdayIndex(d)]
}

/** 11/10（火） */
export function formatMonthDay(d: DateStr): string {
  const [, m, day] = d.split('-').map(Number)
  return `${m}/${day}（${weekdayLabel(d)}）`
}

/** 2026年11月 */
export function formatYearMonth(month: DateStr): string {
  const [y, m] = month.split('-').map(Number)
  return `${y}年${m}月`
}

/** その月の1日 */
export function startOfMonth(d: DateStr): DateStr {
  return `${d.slice(0, 7)}-01`
}

export function addMonths(d: DateStr, n: number): DateStr {
  const [y, m] = d.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  return fromUtc(dt)
}

export function isSameMonth(a: DateStr, b: DateStr): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/**
 * 月表示のマス目（日曜始まり）。前後の月の日で埋めて、7の倍数の長さにする。
 */
export function monthGrid(month: DateStr): DateStr[] {
  const first = startOfMonth(month)
  const start = addDays(first, -weekdayIndex(first))
  const last = addDays(addMonths(first, 1), -1)
  const end = addDays(last, 6 - weekdayIndex(last))
  const days: DateStr[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return days
}

/** 'HH:MM:SS' または 'HH:MM' → 'HH:MM' */
export function formatTime(t: string): string {
  return t.slice(0, 5)
}

/** 300 → '5時間'、90 → '1時間30分'、40 → '40分' */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}分`
  if (m === 0) return `${h}時間`
  return `${h}時間${m}分`
}
