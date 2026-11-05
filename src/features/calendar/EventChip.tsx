import { Link } from 'react-router'
import { formatDuration, formatTime } from '../../lib/date'
import { kindLabel, kindStyle, menuState, menuStateLabel, type CalendarEvent } from '../../lib/events'

const markStyle = {
  none: 'text-amber-700 ring-amber-300',
  set: 'text-emerald-700 ring-emerald-300',
  in_progress: 'text-sky-700 ring-sky-300',
  done: 'bg-emerald-600 text-white ring-emerald-600',
} as const

/** ドライランド枠のメニュー状態の印 */
function MenuMark({ event }: { event: CalendarEvent }) {
  if (event.kind !== 'dryland' || event.status === 'canceled') return null
  const st = menuState(event)
  return (
    <span className={`rounded bg-white/80 px-1.5 py-0.5 text-[11px] font-medium ring-1 ${markStyle[st]}`}>
      {menuStateLabel[st]}
    </span>
  )
}

export function EventChip({ event }: { event: CalendarEvent }) {
  const canceled = event.status === 'canceled'
  return (
    <Link
      to={`/events/${event.id}`}
      className={`block rounded-lg border px-3 py-2 ${
        canceled ? 'border-slate-200 bg-slate-100 text-slate-400' : kindStyle[event.kind].chip
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`size-2.5 shrink-0 rounded-full ${canceled ? 'bg-slate-300' : kindStyle[event.kind].dot}`} />
        <span className={`font-medium ${canceled ? 'line-through' : ''}`}>
          {formatTime(event.start_time)} {kindLabel[event.kind]}
        </span>
        <span className="ml-auto">
          {canceled ? (
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">中止</span>
          ) : (
            <MenuMark event={event} />
          )}
        </span>
      </div>
      <p className={`mt-0.5 pl-[18px] text-xs ${canceled ? '' : 'text-slate-600'}`}>
        {[event.place, formatDuration(event.duration_min)].filter(Boolean).join('・')}
        {canceled && event.cancel_reason ? `（理由：${event.cancel_reason}）` : ''}
      </p>
    </Link>
  )
}
