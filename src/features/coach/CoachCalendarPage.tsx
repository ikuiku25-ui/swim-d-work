import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { addDays, daysFrom, formatDuration, formatMonthDay, formatTime, todayJst } from '../../lib/date'
import { describeChange, groupByDate, kindLabel, menuState, menuStateLabel, type CalendarEvent } from '../../lib/events'
import type { AthleteListItem } from '../../lib/types'
import { useAthletes } from '../athletes/useAthletes'
import { useEventsInRange } from '../calendar/useEvents'
import { useSwipe } from '../calendar/useSwipe'

/** コーチのホーム：全選手の予定を選手別に色分け。未設定・変更あり・中止を強調 */
export function CoachCalendarPage() {
  const today = todayJst()
  const [params, setParams] = useSearchParams()
  const start = params.get('from') ?? today
  const days = daysFrom(start, 7)
  const athletes = useAthletes()
  const events = useEventsInRange(days[0], days[6])
  const [filter, setFilter] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const byId = new Map((athletes.data ?? []).map((a) => [a.id, a]))
  const visibleAthletes = (athletes.data ?? []).filter((a) => showInactive || a.is_active)
  const visibleIds = new Set(visibleAthletes.map((a) => a.id))
  const list = (events.data ?? []).filter(
    (e) => visibleIds.has(e.athlete_id) && (!filter || e.athlete_id === filter),
  )
  const byDate = groupByDate(list)
  const unsetCount = list.filter((e) => e.kind === 'dryland' && e.status === 'normal' && !e.menu).length
  const changedCount = list.filter((e) => e.changed_from).length

  const go = (n: number) => {
    const next = addDays(start, n)
    setParams(next === today ? {} : { from: next }, { replace: true })
  }
  const swipe = useSwipe(() => go(7), () => go(-7))

  return (
    <div className="space-y-3" {...swipe}>
      <h1 className="text-xl font-bold">全員カレンダー</h1>

      <div className="flex flex-wrap gap-2">
        <FilterChip active={!filter} onClick={() => setFilter(null)} label="全員" />
        {visibleAthletes.map((a) => (
          <FilterChip
            key={a.id}
            active={filter === a.id}
            onClick={() => setFilter(filter === a.id ? null : a.id)}
            label={a.display_name}
            color={a.color}
          />
        ))}
      </div>
      {(athletes.data ?? []).some((a) => !a.is_active) && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          停止中の選手も表示する
        </label>
      )}

      {(unsetCount > 0 || changedCount > 0) && (
        <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900 ring-1 ring-amber-200">
          この7日間：{unsetCount > 0 && `メニュー未設定 ${unsetCount}件`}
          {unsetCount > 0 && changedCount > 0 && '／'}
          {changedCount > 0 && `変更あり ${changedCount}件`}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => go(-7)} className="px-3 py-2 text-sky-700">
          ◀ 前の7日
        </button>
        {start !== today && (
          <button type="button" onClick={() => setParams({}, { replace: true })} className="text-sm text-sky-700">
            今日に戻る
          </button>
        )}
        <button type="button" onClick={() => go(7)} className="px-3 py-2 text-sky-700">
          次の7日 ▶
        </button>
      </div>

      {(events.isError || athletes.isError) && <p className="text-sm text-red-600">予定を読み込めませんでした。</p>}
      {athletes.data?.length === 0 && (
        <p className="text-sm text-slate-500">まだ選手がいません。「選手管理」から招待してください。</p>
      )}

      <ol className="space-y-3">
        {days.map((d) => (
          <li key={d} className="rounded-xl bg-white p-3 shadow-sm">
            <h2 className={`mb-2 font-bold ${d === today ? 'text-sky-700' : 'text-slate-700'}`}>
              {formatMonthDay(d)}
              {d === today && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs">今日</span>}
            </h2>
            <div className="space-y-2">
              {(byDate.get(d) ?? []).map((e) => (
                <CoachEventRow key={e.id} event={e} athlete={byId.get(e.athlete_id)} />
              ))}
              {events.isSuccess && !byDate.get(d) && <p className="text-xs text-slate-400">予定なし</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function FilterChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 ${
        active ? 'bg-sky-700 text-white ring-sky-700' : 'bg-white text-slate-700 ring-slate-300'
      }`}
    >
      {color && <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </button>
  )
}

const coachMarkStyle = {
  none: 'bg-amber-500 text-white',
  set: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300',
  in_progress: 'bg-sky-50 text-sky-700 ring-1 ring-sky-300',
  done: 'bg-emerald-600 text-white',
} as const

function CoachEventRow({ event, athlete }: { event: CalendarEvent; athlete?: AthleteListItem }) {
  const canceled = event.status === 'canceled'
  const isDryland = event.kind === 'dryland'
  const unset = isDryland && !canceled && menuState(event) === 'none'
  const body = (
    <div
      className={`rounded-lg border-l-4 px-3 py-2 ${
        canceled ? 'bg-slate-100 text-slate-400' : unset ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-slate-50'
      }`}
      style={{ borderLeftColor: athlete?.color ?? '#94a3b8' }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-bold">{athlete?.display_name ?? '（不明）'}</span>
        <span className={`text-sm ${canceled ? 'line-through' : ''}`}>
          {formatTime(event.start_time)} {kindLabel[event.kind]}
        </span>
        <span className="ml-auto flex gap-1">
          {canceled && <Badge className="bg-slate-200 text-slate-600">中止</Badge>}
          {event.changed_from && <Badge className="bg-violet-100 text-violet-800 ring-1 ring-violet-300">変更あり</Badge>}
          {isDryland && !canceled && <Badge className={coachMarkStyle[menuState(event)]}>{menuStateLabel[menuState(event)]}</Badge>}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-600">
        {[event.place, formatDuration(event.duration_min)].filter(Boolean).join('・')}
        {canceled && event.cancel_reason ? `（理由：${event.cancel_reason}）` : ''}
      </p>
      {event.changed_from && (
        <p className="mt-0.5 text-xs text-violet-800">変更：{describeChange(event.changed_from, event)}</p>
      )}
    </div>
  )
  // ドライランド枠はメニュー編集へ。水中練習・試合は表示のみ
  return isDryland ? (
    <Link to={`/coach/events/${event.id}`} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>
}
