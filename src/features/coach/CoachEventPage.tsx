import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { addDays, formatDuration, formatMonthDay, formatTime, todayJst } from '../../lib/date'
import { describeChange, kindLabel, type CalendarEvent } from '../../lib/events'
import { validateMenu, type MenuBlocks } from '../../lib/menu'
import { useAthletes } from '../athletes/useAthletes'
import { saveErrorMessage, useEvent, useEventsInRange } from '../calendar/useEvents'
import { MenuEditor } from '../menu/MenuEditor'
import { useAcknowledgeChange, useDeleteMenu, useMenu, useSaveMenus } from '../menu/useMenu'
import { OutcomeView } from '../record/OutcomeView'
import { useRecord } from '../record/useRecord'
import type { RecordRow } from '../../lib/record'

/** コーチ：ドライランド枠の詳細とメニュー作成・編集 */
export function CoachEventPage() {
  const { id } = useParams()
  const event = useEvent(id)
  const menu = useMenu(id)
  const record = useRecord(id)

  if (event.isPending || menu.isPending || record.isPending) return <p className="text-sm text-slate-500">読み込み中…</p>
  if (!event.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">予定が見つかりませんでした。選手が削除した可能性があります。</p>
        <Link to="/coach" replace className="inline-block rounded-lg bg-sky-700 px-4 py-3 text-white">
          カレンダーに戻る
        </Link>
      </div>
    )
  }
  return (
    <Editor
      key={event.data.id}
      event={event.data}
      initial={menu.data?.blocks ?? []}
      hasMenu={!!menu.data}
      record={record.data ?? null}
    />
  )
}

function Editor({
  event,
  initial,
  hasMenu,
  record,
}: {
  event: CalendarEvent
  initial: MenuBlocks
  hasMenu: boolean
  record: RecordRow | null
}) {
  const athletes = useAthletes()
  const athlete = athletes.data?.find((a) => a.id === event.athlete_id)
  const [blocks, setBlocks] = useState<MenuBlocks>(initial)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pasting, setPasting] = useState<MenuBlocks | null>(null)
  const save = useSaveMenus()
  const remove = useDeleteMenu()
  const ack = useAcknowledgeChange()
  const canceled = event.status === 'canceled'
  // 選手が記録を始めたら、メニューは変更できない（確認画面を出す）
  const locked = hasMenu && !!record?.started
  const editable = !canceled && !locked

  const onChange = (b: MenuBlocks) => {
    setBlocks(b)
    setDirty(true)
    setMessage(null)
  }

  const onSave = () => {
    const v = validateMenu(blocks)
    if (!v.ok) return setMessage({ ok: false, text: v.error })
    save.mutate(
      { eventIds: [event.id], blocks: v.blocks },
      {
        onSuccess: () => {
          setDirty(false)
          setMessage({ ok: true, text: 'メニューを保存しました。' })
        },
        onError: (e) => setMessage({ ok: false, text: saveErrorMessage(e) }),
      },
    )
  }

  const onDelete = async () => {
    if (!window.confirm('この枠のメニューを削除しますか？')) return
    try {
      await remove.mutateAsync(event.id)
      setBlocks([])
      setDirty(false)
      setMessage({ ok: true, text: 'メニューを削除しました。' })
    } catch (e) {
      setMessage({ ok: false, text: saveErrorMessage(e) })
    }
  }

  const onOpenPaste = () => {
    const v = validateMenu(blocks)
    if (!v.ok) return setMessage({ ok: false, text: v.error })
    setPasting(v.blocks)
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link to="/coach" className="text-sky-700">
          ← カレンダー
        </Link>
      </div>

      <section className="rounded-xl bg-white p-3 shadow-sm" style={{ borderLeft: `4px solid ${athlete?.color ?? '#94a3b8'}` }}>
        <p className="text-sm font-bold">{athlete?.display_name}</p>
        <p className="text-lg font-bold">
          {formatMonthDay(event.date)} {formatTime(event.start_time)} {kindLabel[event.kind]}
        </p>
        <p className="text-sm text-slate-600">{[event.place, formatDuration(event.duration_min)].filter(Boolean).join('・')}</p>
        {canceled && (
          <p className="mt-2 rounded bg-slate-100 p-2 text-sm text-slate-700">
            選手がこの予定を中止しました（理由：{event.cancel_reason}）。メニューは変更できません。
          </p>
        )}
        {event.changed_from && (
          <div className="mt-2 rounded bg-violet-50 p-2 text-sm text-violet-900 ring-1 ring-violet-200">
            <p>変更あり：{describeChange(event.changed_from, event)}</p>
            <button
              type="button"
              disabled={ack.isPending}
              onClick={() => ack.mutate(event.id)}
              className="mt-1 rounded-md bg-white px-3 py-1 text-violet-800 ring-1 ring-violet-300 disabled:opacity-40"
            >
              確認済みにする
            </button>
          </div>
        )}
      </section>

      {locked && (
        <section className="space-y-2">
          <h2 className="font-bold">実施結果</h2>
          <p className="text-xs text-slate-500">選手が記録を始めたため、メニューは変更できません。</p>
          <OutcomeView blocks={initial} record={record} />
        </section>
      )}
      {canceled && hasMenu && !locked && (
        <section className="space-y-2">
          <h2 className="font-bold">メニュー</h2>
          <OutcomeView blocks={initial} record={record} />
        </section>
      )}
      {editable && <MenuEditor blocks={blocks} onChange={onChange} />}

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`rounded-lg p-3 text-sm ${message.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}

      {editable && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={onOpenPaste}
            disabled={blocks.length === 0}
            className="w-full rounded-lg bg-white px-4 py-3 text-sky-700 ring-1 ring-sky-300 disabled:opacity-40"
          >
            このメニューを他の選手・日付にも入れる
          </button>
          {hasMenu && (
            <button
              type="button"
              onClick={onDelete}
              disabled={remove.isPending}
              className="w-full rounded-lg bg-white px-4 py-3 text-red-700 ring-1 ring-red-300 disabled:opacity-40"
            >
              メニューを削除する
            </button>
          )}
        </div>
      )}

      {editable && (
        <div className="fixed inset-x-0 bottom-14 z-10 mx-auto max-w-md px-4 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={onSave}
            disabled={save.isPending || (!dirty && hasMenu) || blocks.length === 0}
            className="w-full rounded-lg bg-sky-700 px-4 py-3 font-medium text-white shadow-lg disabled:opacity-40"
          >
            {save.isPending ? '保存中…' : dirty || !hasMenu ? 'メニューを保存' : '保存済み'}
          </button>
        </div>
      )}

      {pasting && (
        <PasteDialog
          blocks={pasting}
          currentEventId={event.id}
          onClose={() => setPasting(null)}
          onDone={(n) => {
            setPasting(null)
            setDirty(false)
            setMessage({ ok: true, text: `この枠を保存し、ほかの${n}件の枠にもメニューを入れました。` })
          }}
        />
      )}
    </div>
  )
}

/** 他の選手・日付のドライランド枠を選んで、同じメニューをまとめて入れる */
function PasteDialog({
  blocks,
  currentEventId,
  onClose,
  onDone,
}: {
  blocks: MenuBlocks
  currentEventId: string
  onClose: () => void
  onDone: (count: number) => void
}) {
  const today = todayJst()
  const events = useEventsInRange(today, addDays(today, 27))
  const athletes = useAthletes()
  const byId = new Map((athletes.data ?? []).map((a) => [a.id, a]))
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const save = useSaveMenus()

  const candidates = (events.data ?? []).filter(
    (e) =>
      e.id !== currentEventId &&
      e.kind === 'dryland' &&
      e.status === 'normal' &&
      !e.record?.started &&
      byId.get(e.athlete_id)?.is_active,
  )
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const overwriteCount = candidates.filter((e) => picked.includes(e.id) && e.menu).length

  // 編集中の元の枠も同じ内容で保存する（貼り付け先だけ保存されて元の枠が古いまま、を防ぐ）
  const submit = () =>
    save.mutate(
      { eventIds: [currentEventId, ...picked], blocks },
      { onSuccess: () => onDone(picked.length), onError: (e) => setError(saveErrorMessage(e)) },
    )

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/40" role="dialog" aria-modal="true" aria-label="メニューの一括貼り付け">
      <div className="mx-auto flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h2 className="font-bold">他の選手・日付にも入れる</h2>
        <p className="text-xs text-slate-500">今日から4週間のドライランド枠です（選手が記録を始めた枠は除く）。メニューがある枠は、選ぶと上書きされます。</p>
        <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {events.isPending && <p className="text-sm text-slate-500">読み込み中…</p>}
          {events.isSuccess && candidates.length === 0 && <p className="text-sm text-slate-500">対象の枠がありません。</p>}
          {candidates.map((e) => {
            const a = byId.get(e.athlete_id)
            return (
              <label key={e.id} className="flex items-center gap-2 rounded-lg p-2 ring-1 ring-slate-200">
                <input type="checkbox" checked={picked.includes(e.id)} onChange={() => toggle(e.id)} className="size-5" />
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: a?.color }} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{a?.display_name}</span> {formatMonthDay(e.date)} {formatTime(e.start_time)}
                  <span className="block text-xs text-slate-500">{[e.place, formatDuration(e.duration_min)].filter(Boolean).join('・')}</span>
                </span>
                {e.menu ? (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">設定済み・上書き</span>
                ) : (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">未設定</span>
                )}
              </label>
            )
          })}
        </div>
        {overwriteCount > 0 && (
          <p className="mt-2 text-sm text-amber-800">設定済みの {overwriteCount}件 は、今のメニューで上書きされます。</p>
        )}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg px-4 py-3 text-slate-700 ring-1 ring-slate-300">
            やめる
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={picked.length === 0 || save.isPending}
            className="flex-1 rounded-lg bg-sky-700 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {save.isPending ? '保存中…' : `${picked.length}件に入れる`}
          </button>
        </div>
      </div>
    </div>
  )
}
