import { Link, useSearchParams } from 'react-router'
import { addDays, daysFrom, formatMonthDay, todayJst, weekdayIndex, type DateStr } from '../../lib/date'
import { groupByDate } from '../../lib/events'
import { CopyBanner } from './CopyBanner'
import { EventChip } from './EventChip'
import { useEventsInRange } from './useEvents'
import { useSwipe } from './useSwipe'
import { ViewSwitch } from './ViewSwitch'

function dayLabelClass(d: DateStr, today: DateStr): string {
  if (d === today) return 'text-sky-700'
  const w = weekdayIndex(d)
  if (w === 0) return 'text-rose-600'
  if (w === 6) return 'text-blue-600'
  return 'text-slate-700'
}

/** 週表示（ホーム）：今日を先頭に7日間。左右スワイプで前後7日へ */
export function WeekPage() {
  const today = todayJst()
  const [params, setParams] = useSearchParams()
  const start = params.get('from') ?? today
  const days = daysFrom(start, 7)
  const events = useEventsInRange(days[0], days[6])
  const byDate = groupByDate(events.data ?? [])

  const go = (n: number) => {
    const next = addDays(start, n)
    setParams(next === today ? {} : { from: next }, { replace: true })
  }
  const swipe = useSwipe(() => go(7), () => go(-7))

  return (
    <div className="space-y-3" {...swipe}>
      <ViewSwitch />
      <CopyBanner />
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => go(-7)} className="rounded-lg px-3 py-2 text-sky-700" aria-label="前の7日">
          ◀ 前の7日
        </button>
        {start !== today && (
          <button type="button" onClick={() => setParams({}, { replace: true })} className="text-sm text-sky-700">
            今日に戻る
          </button>
        )}
        <button type="button" onClick={() => go(7)} className="rounded-lg px-3 py-2 text-sky-700" aria-label="次の7日">
          次の7日 ▶
        </button>
      </div>

      {events.isError && <p className="text-sm text-red-600">予定を読み込めませんでした。</p>}

      <ol className="space-y-3">
        {days.map((d) => (
          <li key={d} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className={`font-bold ${dayLabelClass(d, today)}`}>
                {formatMonthDay(d)}
                {d === today && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs">今日</span>}
              </h2>
              <Link
                to={`/events/new?date=${d}`}
                className="rounded-full px-3 py-1 text-sm text-sky-700 ring-1 ring-sky-200"
                aria-label={`${formatMonthDay(d)}に予定を追加`}
              >
                ＋ 追加
              </Link>
            </div>
            <div className="space-y-2">
              {(byDate.get(d) ?? []).map((e) => (
                <EventChip key={e.id} event={e} />
              ))}
              {events.isSuccess && !byDate.get(d) && <p className="text-xs text-slate-400">予定なし</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
