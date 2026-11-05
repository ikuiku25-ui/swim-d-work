import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { formatMonthDay, todayJst } from '../../lib/date'
import {
  cancelReasonSchema,
  eventInputSchema,
  kindLabel,
  kindStyle,
  toTemplate,
  type CalendarEvent,
  type EventKind,
} from '../../lib/events'
import { MenuView } from '../menu/MenuView'
import { useMenu } from '../menu/useMenu'
import { useCopy } from './CopyContext'
import { saveErrorMessage, useCreateEvents, useDeleteEvent, useEvent, useUpdateEvent } from './useEvents'

const KINDS: EventKind[] = ['dryland', 'swim', 'meet']
const DURATION_PRESETS = [30, 40, 60, 90, 120]

type FormValues = { kind: EventKind; date: string; start_time: string; place: string; duration_min: string }

function useBack() {
  const navigate = useNavigate()
  const location = useLocation()
  return () => (location.key !== 'default' ? navigate(-1) : navigate('/', { replace: true }))
}

/** 予定の新規入力（/events/new?date=）と編集（/events/:id） */
export function EventFormPage() {
  const { id } = useParams()
  const event = useEvent(id)

  if (id && event.isPending) return <p className="text-sm text-slate-500">読み込み中…</p>
  if (id && !event.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">予定が見つかりませんでした。削除された可能性があります。</p>
        <Link to="/" replace className="inline-block rounded-lg bg-sky-700 px-4 py-3 text-white">
          カレンダーに戻る
        </Link>
      </div>
    )
  }
  return <EventForm key={id ?? 'new'} event={event.data ?? null} />
}

function EventForm({ event }: { event: CalendarEvent | null }) {
  const [params] = useSearchParams()
  const back = useBack()
  const navigate = useNavigate()
  const { setCopied } = useCopy()
  const create = useCreateEvents()
  const update = useUpdateEvent()
  const remove = useDeleteEvent()

  const [values, setValues] = useState<FormValues>(() =>
    event
      ? {
          kind: event.kind,
          date: event.date,
          start_time: event.start_time.slice(0, 5),
          place: event.place,
          duration_min: String(event.duration_min),
        }
      : {
          kind: 'dryland',
          date: params.get('date') ?? todayJst(),
          start_time: '16:00',
          place: '',
          duration_min: '40',
        },
  )
  const [error, setError] = useState<string | null>(null)
  const [canceling, setCanceling] = useState(false)

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setValues((s) => ({ ...s, [k]: v }))
  const canceled = event?.status === 'canceled'
  const hasMenu = !!event?.menu
  const menu = useMenu(hasMenu ? event?.id : undefined)
  const busy = create.isPending || update.isPending || remove.isPending

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const parsed = eventInputSchema.safeParse(values)
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    const done = { onSuccess: back, onError: (err: unknown) => setError(saveErrorMessage(err)) }
    if (event) update.mutate({ id: event.id, patch: parsed.data }, done)
    else create.mutate([parsed.data], done)
  }

  const onCopy = () => {
    if (!event) return
    setCopied(toTemplate(event))
    navigate('/month')
  }

  const onDelete = async () => {
    if (!event) return
    if (!window.confirm('この予定を削除しますか？')) return
    try {
      await remove.mutateAsync(event.id)
      back()
    } catch (err) {
      setError(saveErrorMessage(err))
    }
  }

  const onRestore = () => {
    if (!event) return
    update.mutate(
      { id: event.id, patch: { status: 'normal' } },
      { onError: (err) => setError(saveErrorMessage(err)) },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={back} className="text-sky-700">
          ← 戻る
        </button>
        <h1 className="text-lg font-bold">{event ? '予定の編集' : '予定の追加'}</h1>
      </div>

      {hasMenu && (
        <section className="space-y-2">
          {!canceled && event && (
            <Link
              to={`/events/${event.id}/record`}
              className={`block rounded-lg px-4 py-3 text-center font-medium ${
                event.record?.completed_at ? 'bg-white text-emerald-700 ring-1 ring-emerald-300' : 'bg-emerald-600 text-white'
              }`}
            >
              {event.record?.completed_at ? '✓ 実施済み（記録を見る・直す）' : event.record?.started ? '記録の続きを入れる' : 'メニューを実施する（記録）'}
            </Link>
          )}
          <h2 className="font-bold">コーチからのメニュー</h2>
          {menu.data ? <MenuView blocks={menu.data.blocks} /> : <p className="text-sm text-slate-500">読み込み中…</p>}
        </section>
      )}

      {canceled && (
        <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
          <p className="font-bold">この予定は中止しました</p>
          <p>理由：{event?.cancel_reason}</p>
          <button
            type="button"
            onClick={onRestore}
            disabled={busy}
            className="mt-2 rounded-lg bg-white px-3 py-2 text-sky-700 ring-1 ring-sky-300 disabled:opacity-40"
          >
            中止を取り消す
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-4 shadow-sm">
        <fieldset>
          <legend className="text-sm text-slate-600">種類</legend>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={values.kind === k}
                disabled={hasMenu && k !== values.kind}
                onClick={() => set('kind', k)}
                className={`whitespace-nowrap rounded-lg border px-1 py-2 text-[13px] ${
                  values.kind === k ? `${kindStyle[k].chip} font-bold ring-2 ring-offset-1` : 'border-slate-200 text-slate-600'
                }`}
              >
                {kindLabel[k]}
              </button>
            ))}
          </div>
          {hasMenu && <p className="mt-1 text-xs text-slate-500">メニューが入っているため、種類は変更できません。</p>}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0 text-sm text-slate-600">
            日付
            <input
              type="date"
              required
              value={values.date}
              onChange={(e) => set('date', e.target.value)}
              className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block min-w-0 text-sm text-slate-600">
            開始時刻
            <input
              type="time"
              required
              step={300}
              value={values.start_time}
              onChange={(e) => set('start_time', e.target.value)}
              className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-base text-slate-900"
            />
          </label>
        </div>

        <label className="block text-sm text-slate-600">
          場所
          <input
            maxLength={50}
            value={values.place}
            onChange={(e) => set('place', e.target.value)}
            placeholder="例：学校、自宅"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900"
          />
        </label>

        <div>
          <label className="block text-sm text-slate-600" htmlFor="duration">
            時間（分）
          </label>
          <input
            id="duration"
            inputMode="numeric"
            required
            value={values.duration_min}
            onChange={(e) => set('duration_min', e.target.value.replace(/[^\d０-９]/g, '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {DURATION_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set('duration_min', String(m))}
                className="rounded-full px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-300"
              >
                {m}分
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-sky-700 px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          {busy ? '保存中…' : event ? '変更を保存' : `${formatMonthDay(values.date)}に追加`}
        </button>
      </form>

      {event && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={onCopy}
            className="w-full rounded-lg bg-white px-4 py-3 text-sky-700 ring-1 ring-sky-300"
          >
            コピーして他の日に貼り付ける
          </button>
          {!canceled && (
            <button
              type="button"
              onClick={() => setCanceling(true)}
              className="w-full rounded-lg bg-white px-4 py-3 text-amber-700 ring-1 ring-amber-300"
            >
              中止にする
            </button>
          )}
          {!hasMenu && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="w-full rounded-lg bg-white px-4 py-3 text-red-700 ring-1 ring-red-300 disabled:opacity-40"
            >
              削除する
            </button>
          )}
          <p className="text-xs text-slate-500">
            コピーされるのは種類・時刻・場所・時間だけです。メニューが入った予定は、削除ではなく中止にします。
          </p>
        </div>
      )}

      {canceling && event && (
        <CancelDialog
          onClose={() => setCanceling(false)}
          onSubmit={(reason) =>
            update.mutate(
              { id: event.id, patch: { status: 'canceled', cancel_reason: reason } },
              {
                onSuccess: () => setCanceling(false),
                onError: (err) => setError(saveErrorMessage(err)),
              },
            )
          }
          busy={update.isPending}
        />
      )}
    </div>
  )
}

function CancelDialog({
  onClose,
  onSubmit,
  busy,
}: {
  onClose: () => void
  onSubmit: (reason: string) => void
  busy: boolean
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsed = cancelReasonSchema.safeParse(reason)
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    onSubmit(parsed.data)
  }
  return (
    <div className="fixed inset-0 z-10 flex items-end bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="予定の中止">
      <form onSubmit={submit} className="mx-auto w-full max-w-md space-y-3 rounded-xl bg-white p-4">
        <h2 className="font-bold">予定を中止にする</h2>
        <label className="block text-sm text-slate-600">
          中止の理由（ひとこと）
          <input
            autoFocus
            maxLength={100}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例：発熱、テスト期間"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg px-4 py-3 text-slate-700 ring-1 ring-slate-300">
            やめる
          </button>
          <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-amber-600 px-4 py-3 font-medium text-white disabled:opacity-40">
            中止にする
          </button>
        </div>
      </form>
    </div>
  )
}
