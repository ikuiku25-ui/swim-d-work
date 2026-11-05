import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { addDays, formatDuration, formatMonthDay, formatTime, todayJst } from '../../lib/date'
import { describeChange, isUnnotified, kindLabel, notifyResultText, type CalendarEvent } from '../../lib/events'
import { validateMenu, type MenuBlocks } from '../../lib/menu'
import { useAthletes } from '../athletes/useAthletes'
import { saveErrorMessage, useEvent, useEventsInRange } from '../calendar/useEvents'
import { cloneWithNewIds } from '../../lib/library'
import { TemplatePicker } from '../library/TemplatePicker'
import { useSaveTemplate } from '../library/useLibrary'
import { MenuEditor } from '../menu/MenuEditor'
import { useAcknowledgeChange, useDeleteMenu, useMenu, useNotifyMenus, useSaveMenus } from '../menu/useMenu'
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
  const [picking, setPicking] = useState(false)
  const saveTemplate = useSaveTemplate()
  const save = useSaveMenus()
  const notify = useNotifyMenus()
  const remove = useDeleteMenu()
  const ack = useAcknowledgeChange()
  const canceled = event.status === 'canceled'
  const busy = save.isPending || notify.isPending
  // 選手が記録を始めたら、メニューは変更できない（確認画面を出す）
  const locked = hasMenu && !!record?.started
  const editable = !canceled && !locked

  const onChange = (b: MenuBlocks) => {
    setBlocks(b)
    setDirty(true)
    setMessage(null)
  }

  const onSave = async (withNotify: boolean) => {
    const v = validateMenu(blocks)
    if (!v.ok) return setMessage({ ok: false, text: v.error })
    try {
      await save.mutateAsync({ eventIds: [event.id], blocks: v.blocks })
      setDirty(false)
      if (!withNotify) return setMessage({ ok: true, text: 'メニューを保存しました（選手にはまだ通知していません）。' })
      const r = await notify.mutateAsync([event.id])
      setMessage({ ok: true, text: `メニューを保存しました。${notifyResultText(r.athletes)}` })
    } catch (e) {
      setMessage({ ok: false, text: saveErrorMessage(e) })
    }
  }

  const onNotifyOnly = async () => {
    try {
      const r = await notify.mutateAsync([event.id])
      setMessage({ ok: true, text: notifyResultText(r.athletes) })
    } catch (e) {
      setMessage({ ok: false, text: saveErrorMessage(e) })
    }
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

  const onPickTemplate = (t: MenuBlocks, mode: 'replace' | 'append') => {
    if (mode === 'replace' && blocks.length > 0 && !window.confirm('今のメニューをテンプレートで置き換えますか？')) return
    const copied = cloneWithNewIds(t)
    onChange(mode === 'append' ? [...blocks, ...copied] : copied)
    setPicking(false)
    setMessage({ ok: true, text: 'テンプレートを入れました。内容を調整して「メニューを保存」を押してください。' })
  }

  const onSaveAsTemplate = async () => {
    const v = validateMenu(blocks)
    if (!v.ok) return setMessage({ ok: false, text: v.error })
    const title = window.prompt('テンプレート名を入力してください', '')
    if (title === null) return
    if (!title.trim()) return setMessage({ ok: false, text: 'テンプレート名を入力してください' })
    try {
      await saveTemplate.mutateAsync({ title: title.trim().slice(0, 100), blocks: v.blocks, reference_note_id: null })
      setMessage({ ok: true, text: `テンプレート「${title.trim()}」として保存しました。` })
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
      {editable && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="w-full rounded-lg bg-white px-4 py-2 text-sm text-sky-700 ring-1 ring-sky-300"
        >
          テンプレートから入れる
        </button>
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
          <button
            type="button"
            onClick={onSaveAsTemplate}
            disabled={blocks.length === 0 || saveTemplate.isPending}
            className="w-full rounded-lg bg-white px-4 py-3 text-slate-700 ring-1 ring-slate-300 disabled:opacity-40"
          >
            このメニューをテンプレートに保存
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
          {!dirty && hasMenu ? (
            isUnnotified(event) ? (
              <button
                type="button"
                onClick={onNotifyOnly}
                disabled={notify.isPending}
                className="w-full rounded-lg bg-amber-600 px-4 py-3 font-medium text-white shadow-lg disabled:opacity-40"
              >
                {notify.isPending ? '通知中…' : '保存済み・選手に通知する'}
              </button>
            ) : (
              <p className="rounded-lg bg-white/90 px-4 py-3 text-center text-sm text-slate-600 shadow-lg ring-1 ring-slate-200">
                保存済み・選手に通知済み
              </p>
            )
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSave(false)}
                disabled={busy || blocks.length === 0}
                className="rounded-lg bg-white px-3 py-3 font-medium text-sky-700 shadow-lg ring-1 ring-sky-300 disabled:opacity-40"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => onSave(true)}
                disabled={busy || blocks.length === 0}
                className="rounded-lg bg-sky-700 px-3 py-3 font-medium text-white shadow-lg disabled:opacity-40"
              >
                {busy ? '保存中…' : '保存して選手に通知'}
              </button>
            </div>
          )}
        </div>
      )}

      {picking && <TemplatePicker hasBlocks={blocks.length > 0} onPick={onPickTemplate} onClose={() => setPicking(false)} />}

      {pasting && (
        <PasteDialog
          blocks={pasting}
          currentEventId={event.id}
          onClose={() => setPasting(null)}
          onDone={(n, notifyText) => {
            setPasting(null)
            setDirty(false)
            setMessage({ ok: true, text: `この枠を保存し、ほかの${n}件の枠にもメニューを入れました。${notifyText}` })
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
  onDone: (count: number, notifyText: string) => void
}) {
  const today = todayJst()
  const events = useEventsInRange(today, addDays(today, 27))
  const athletes = useAthletes()
  const byId = new Map((athletes.data ?? []).map((a) => [a.id, a]))
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [withNotify, setWithNotify] = useState(true)
  const save = useSaveMenus()
  const notify = useNotifyMenus()

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
  const submit = async () => {
    const all = [currentEventId, ...picked]
    try {
      await save.mutateAsync({ eventIds: all, blocks })
      const r = withNotify ? await notify.mutateAsync(all) : null
      onDone(picked.length, r ? notifyResultText(r.athletes) : '選手にはまだ通知していません。')
    } catch (e) {
      setError(saveErrorMessage(e))
    }
  }

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
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withNotify} onChange={(e) => setWithNotify(e.target.checked)} className="size-5" />
          選手に通知する（選手ごとに1通にまとめます）
        </label>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg px-4 py-3 text-slate-700 ring-1 ring-slate-300">
            やめる
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={picked.length === 0 || save.isPending || notify.isPending}
            className="flex-1 rounded-lg bg-sky-700 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {save.isPending || notify.isPending ? '保存中…' : `${picked.length}件に入れる`}
          </button>
        </div>
      </div>
    </div>
  )
}
