import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  addMonths,
  formatMonthDay,
  formatYearMonth,
  isSameMonth,
  monthGrid,
  startOfMonth,
  todayJst,
  weekdayIndex,
  type DateStr,
} from '../../lib/date'
import { groupByDate, kindStyle, pasteRows } from '../../lib/events'
import { CopyBanner } from './CopyBanner'
import { useCopy } from './CopyContext'
import { EventChip } from './EventChip'
import { saveErrorMessage, useCreateEvents, useEventsInRange } from './useEvents'
import { useSwipe } from './useSwipe'
import { ViewSwitch } from './ViewSwitch'

const WEEK_HEAD = ['日', '月', '火', '水', '木', '金', '土']

/** 月表示（1日始まり）。コピー中は、タップで貼り付け先の日を複数選べる */
export function MonthPage() {
  const today = todayJst()
  const [params, setParams] = useSearchParams()
  const month = startOfMonth(params.get('m') ? `${params.get('m')}-01` : today)
  const grid = monthGrid(month)
  const events = useEventsInRange(grid[0], grid.at(-1)!)
  const byDate = groupByDate(events.data ?? [])

  const { copied, setCopied } = useCopy()
  const [picked, setPicked] = useState<DateStr[]>([])
  const [selected, setSelected] = useState<DateStr>(today)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const create = useCreateEvents()

  const goMonth = (n: number) => {
    const next = addMonths(month, n)
    setParams(isSameMonth(next, today) ? {} : { m: next.slice(0, 7) }, { replace: true })
  }
  const swipe = useSwipe(() => goMonth(1), () => goMonth(-1))

  const onTapDay = (d: DateStr) => {
    setMessage(null)
    if (copied) {
      setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))
    } else {
      setSelected(d)
    }
  }

  const paste = () => {
    if (!copied || picked.length === 0) return
    const n = picked.length
    create.mutate(pasteRows(copied, picked), {
      onSuccess: () => {
        setMessage({ ok: true, text: `${n}日に貼り付けました。` })
        setPicked([])
        setCopied(null)
      },
      onError: (e) => setMessage({ ok: false, text: saveErrorMessage(e) }),
    })
  }

  return (
    <div className="space-y-3" {...swipe}>
      <ViewSwitch />
      <CopyBanner inMonth />

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => goMonth(-1)} className="px-3 py-2 text-sky-700" aria-label="前の月">
          ◀
        </button>
        <h1 className="font-bold">{formatYearMonth(month)}</h1>
        <button type="button" onClick={() => goMonth(1)} className="px-3 py-2 text-sky-700" aria-label="次の月">
          ▶
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEK_HEAD.map((w, i) => (
          <div key={w} className={i === 0 ? 'text-rose-600' : i === 6 ? 'text-blue-600' : 'text-slate-500'}>
            {w}
          </div>
        ))}
        {grid.map((d) => {
          const list = byDate.get(d) ?? []
          const inMonth = isSameMonth(d, month)
          const isPicked = picked.includes(d)
          const isSelected = !copied && d === selected
          const w = weekdayIndex(d)
          return (
            <button
              key={d}
              type="button"
              onClick={() => onTapDay(d)}
              aria-pressed={copied ? isPicked : isSelected}
              aria-label={formatMonthDay(d)}
              className={`flex aspect-square flex-col items-center rounded-lg p-1 ${
                isPicked
                  ? 'bg-amber-200 ring-2 ring-amber-500'
                  : isSelected
                    ? 'bg-sky-100 ring-2 ring-sky-500'
                    : 'bg-white'
              } ${inMonth ? '' : 'opacity-40'}`}
            >
              <span
                className={`text-sm ${d === today ? 'rounded-full bg-sky-700 px-1.5 font-bold text-white' : w === 0 ? 'text-rose-600' : w === 6 ? 'text-blue-600' : ''}`}
              >
                {Number(d.slice(8))}
              </span>
              <span className="mt-auto flex flex-wrap justify-center gap-0.5">
                {list.slice(0, 4).map((e) => (
                  <span
                    key={e.id}
                    className={`size-1.5 rounded-full ${e.status === 'canceled' ? 'bg-slate-300' : kindStyle[e.kind].dot}`}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      {copied ? (
        <div className="sticky bottom-2 flex gap-2">
          <button
            type="button"
            disabled={picked.length === 0 || create.isPending}
            onClick={paste}
            className="flex-1 rounded-lg bg-amber-600 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {create.isPending ? '貼り付け中…' : `貼り付け（${picked.length}日）`}
          </button>
        </div>
      ) : (
        <section className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{formatMonthDay(selected)}</h2>
            <Link to={`/events/new?date=${selected}`} className="rounded-full px-3 py-1 text-sm text-sky-700 ring-1 ring-sky-200">
              ＋ 追加
            </Link>
          </div>
          {(byDate.get(selected) ?? []).map((e) => (
            <EventChip key={e.id} event={e} />
          ))}
          {events.isSuccess && !byDate.get(selected) && <p className="text-xs text-slate-400">予定なし</p>}
        </section>
      )}

      {message && (
        <p role="status" className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>
          {message.text}
        </p>
      )}
      {events.isError && <p className="text-sm text-red-600">予定を読み込めませんでした。</p>}
    </div>
  )
}
