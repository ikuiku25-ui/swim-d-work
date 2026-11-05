// 通知の文面（純粋関数。テストは messages.test.ts）
import type { PushMessage } from './webpush.ts'

export type Snapshot = { date: string; start_time: string; place: string; duration_min: number }

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function addDays(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10)
}

/** 11/10（火） */
export function monthDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, day)).getUTCDay()
  return `${m}/${day}（${WEEKDAYS[w]}）`
}

/** 今日／明日／11/10（火） */
export function relDay(d: string, today: string): string {
  if (d === today) return '今日'
  if (d === addDays(today, 1)) return '明日'
  return monthDay(d)
}

/** 日本時間の今日 */
export function todayJst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

function slot(s: Snapshot, today: string): string {
  return [relDay(s.date, today), s.start_time, s.place, `${s.duration_min}分`].filter(Boolean).join(' ')
}

export type QueuedNotification = {
  kind: 'event_added_late' | 'event_changed' | 'event_canceled'
  payload: {
    athlete_name: string
    event: Snapshot
    from?: Snapshot
    reason?: string
    restored?: boolean
  }
}

/** コーチ宛て通知の1行 */
export function coachLine(n: QueuedNotification, today: string): string {
  const p = n.payload
  const who = `${p.athlete_name}さん`
  switch (n.kind) {
    case 'event_added_late':
      return p.from
        ? `${who} ${slot(p.from, today)} → ${slot(p.event, today)} に移動されました（メニュー未設定）`
        : `${who} ${slot(p.event, today)} が追加されました（メニュー未設定）`
    case 'event_canceled':
      return `${who} ${monthDay(p.event.date)} のドライランドが中止されました（理由：${p.reason ?? ''}）`
    case 'event_changed':
      if (p.restored) return `${who} ${monthDay(p.event.date)} のドライランドの中止が取り消されました`
      return p.from
        ? `${who} ${monthDay(p.from.date)} のドライランドが変更されました（${changeText(p.from, p.event)}）`
        : `${who} ${monthDay(p.event.date)} のドライランドが変更されました`
  }
}

function changeText(from: Snapshot, to: Snapshot): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
  const parts: string[] = []
  if (from.date !== to.date || from.start_time !== to.start_time) {
    parts.push(`${md(from.date)} ${from.start_time} → ${md(to.date)} ${to.start_time}`)
  }
  if (from.place !== to.place) parts.push(`場所 ${from.place || 'なし'} → ${to.place || 'なし'}`)
  if (from.duration_min !== to.duration_min) parts.push(`${from.duration_min}分 → ${to.duration_min}分`)
  return parts.join('、') || '内容の変更'
}

/** 同じ宛先にたまった通知を1通にまとめる */
export function combineCoach(list: QueuedNotification[], today: string): PushMessage {
  const lines = list.map((n) => coachLine(n, today))
  return {
    title: list.length === 1 ? 'SWIM D-work' : `SWIM D-work（${list.length}件）`,
    body: lines.join('\n'),
    url: '/coach',
    tag: 'coach-events',
  }
}

export type NightlyItem = { athlete_name: string; start_time: string; place: string; duration_min: number }

/** 毎晩22時：明日メニュー未設定：Aさん 16:00 学校 40分／Bさん 18:30 自宅 30分 */
export function nightlyMessage(items: NightlyItem[]): PushMessage {
  const list = items
    .map((i) => [`${i.athlete_name}さん`, i.start_time, i.place, `${i.duration_min}分`].filter(Boolean).join(' '))
    .join('／')
  return { title: 'SWIM D-work', body: `明日メニュー未設定：${list}`, url: '/coach', tag: 'nightly-check' }
}

/**
 * 選手宛て：メニューが入った／変更された。
 * 初めて知らせる日が1つでもあれば「入りました」、すべて2回目以降なら「変更されました」
 */
export function athleteMenuMessage(items: { date: string; first: boolean }[]): PushMessage {
  const dates = [...new Set(items.map((i) => i.date))].sort()
  const head = monthDay(dates[0])
  const rest = dates.length > 1 ? `ほか${dates.length - 1}日` : ''
  const anyFirst = items.some((i) => i.first)
  const body = anyFirst
    ? dates.length === 1
      ? `${head}のドライランドにメニューが入りました`
      : `${head}${rest}のメニューが入りました`
    : `${head}${rest}のメニューが変更されました`
  return { title: 'SWIM D-work', body, url: '/', tag: 'menu' }
}
