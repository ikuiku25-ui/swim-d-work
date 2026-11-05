import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { formatDuration, formatMonthDay, formatTime } from '../../lib/date'
import { blockHeading, formatAmount, newExercise, unitLabel, type Block, type Exercise, type MenuBlocks, type Unit } from '../../lib/menu'
import { draftFrom, toRecordPayload, type Draft, type RecordRow } from '../../lib/record'
import { saveErrorMessage, useEvent } from '../calendar/useEvents'
import { useMenu } from '../menu/useMenu'
import { useRecord, useSaveRecord } from './useRecord'

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/** 選手：メニューを見ながら種目ごとにチェックし、違った数値だけ書き換える */
export function RecordPage() {
  const { id } = useParams()
  const event = useEvent(id)
  const menu = useMenu(id)
  const record = useRecord(id)

  if (event.isPending || menu.isPending || record.isPending) return <p className="text-sm text-slate-500">読み込み中…</p>
  if (!event.data || !menu.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">この予定にはメニューがありません。</p>
        <Link to="/" replace className="inline-block rounded-lg bg-sky-700 px-4 py-3 text-white">
          カレンダーに戻る
        </Link>
      </div>
    )
  }
  return (
    <RecordForm
      key={event.data.id}
      eventId={event.data.id}
      title={`${formatMonthDay(event.data.date)} ${formatTime(event.data.start_time)}`}
      sub={[event.data.place, formatDuration(event.data.duration_min)].filter(Boolean).join('・')}
      canceled={event.data.status === 'canceled'}
      blocks={menu.data.blocks}
      initial={record.data ?? null}
    />
  )
}

function RecordForm({
  eventId,
  title,
  sub,
  canceled,
  blocks,
  initial,
}: {
  eventId: string
  title: string
  sub: string
  canceled: boolean
  blocks: MenuBlocks
  initial: RecordRow | null
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(blocks, initial))
  const [completedAt, setCompletedAt] = useState<string | null>(initial?.completed_at ?? null)
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const save = useSaveRecord(eventId)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef({ draft, completedAt })
  latest.current = { draft, completedAt }

  const pendingRef = useRef(false)

  const persist = async (d: Draft, done: string | null) => {
    pendingRef.current = false
    // 名前をまだ入れていない追加分は、入力が終わるまで保存しない
    const payload = toRecordPayload(blocks, { ...d, added: d.added.filter((e) => e.name.trim() !== '') })
    if (!payload.ok) {
      setState('error')
      setError(payload.error)
      return false
    }
    setState('saving')
    try {
      await save.mutateAsync({
        exercise_results: payload.exercise_results,
        block_results: payload.block_results,
        added_exercises: payload.added_exercises,
        completed_at: done,
      })
      setState('saved')
      setError(null)
      return true
    } catch (e) {
      setState('error')
      setError(saveErrorMessage(e))
      return false
    }
  }

  // 入力のたびに少し待ってから自動で保存する
  const change = (next: Draft) => {
    setDraft(next)
    setState('pending')
    pendingRef.current = true
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => persist(next, latest.current.completedAt), 800)
  }
  // 画面を離れるときに未保存の変更があれば保存する
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (pendingRef.current) void persist(latest.current.draft, latest.current.completedAt)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const setExercise = (id: string, patch: Partial<Draft['exercises'][string]>) =>
    change({ ...draft, exercises: { ...draft.exercises, [id]: { ...draft.exercises[id], ...patch } } })

  const toggleComplete = async () => {
    window.clearTimeout(timer.current)
    const next = completedAt ? null : new Date().toISOString()
    const prev = completedAt
    setCompletedAt(next)
    if (!(await persist(draft, next))) setCompletedAt(prev)
  }

  const checkedCount = Object.values(draft.exercises).filter((e) => e.checked).length
  const total = Object.keys(draft.exercises).length

  if (canceled) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="rounded-lg bg-slate-100 p-3 text-sm">この予定は中止したため、記録できません。</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-28">
      <BackLink />
      <div>
        <h1 className="text-lg font-bold">{title} ドライランド</h1>
        <p className="text-sm text-slate-600">{sub}</p>
        <p className="mt-1 text-xs text-slate-500">
          やった種目にチェックを入れ、計画と違ったときだけ数字を書き換えてください。入力は自動で保存されます。
        </p>
      </div>

      {completedAt && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
          ✓ 実施済みにしました。あとから直すこともできます。
        </p>
      )}

      <ol className="space-y-3">
        {blocks.map((b, i) => (
          <li key={b.id} className="rounded-xl bg-white p-3 shadow-sm">
            <p className="font-bold">
              {i + 1}. {blockHeading(b)}
            </p>
            {b.memo && <p className="text-xs text-slate-500">{b.memo}</p>}
            <CountField
              block={b}
              value={draft.blocks[b.id]}
              onChange={(v) => change({ ...draft, blocks: { ...draft.blocks, [b.id]: v } })}
            />
            <ul className="mt-2 space-y-2">
              {(b.type === 'single' ? [b.exercise] : b.exercises).map((e) => (
                <ExerciseRow key={e.id} exercise={e} value={draft.exercises[e.id]} onChange={(p) => setExercise(e.id, p)} />
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <AddedSection added={draft.added} onChange={(added) => change({ ...draft, added })} />

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-slate-200 bg-white px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <p className="mb-1 text-center text-xs text-slate-500" aria-live="polite">
          チェック {checkedCount}/{total}　{saveLabel[state]}
        </p>
        <button
          type="button"
          onClick={toggleComplete}
          disabled={state === 'saving'}
          className={`w-full rounded-lg px-4 py-3 font-medium disabled:opacity-40 ${
            completedAt ? 'bg-white text-slate-700 ring-1 ring-slate-300' : 'bg-emerald-600 text-white'
          }`}
        >
          {completedAt ? '実施済みを取り消す' : '完了（実施済みにする）'}
        </button>
      </div>
    </div>
  )
}

const saveLabel: Record<SaveState, string> = {
  idle: '',
  pending: '入力中…',
  saving: '保存中…',
  saved: '保存しました',
  error: '保存できませんでした',
}

function BackLink() {
  return (
    <Link to="/" className="text-sky-700">
      ← カレンダー
    </Link>
  )
}

function numeric(v: string): string {
  return v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^\d]/g, '')
}

function CountField({ block, value, onChange }: { block: Block; value: string; onChange: (v: string) => void }) {
  const planned = block.type === 'single' ? block.sets : block.rounds
  const unit = block.type === 'single' ? 'セット' : '周'
  const changed = value !== String(planned)
  return (
    <label className="mt-2 flex items-center gap-2 text-sm">
      <span className="text-slate-600">実施{block.type === 'single' ? 'セット数' : '周回数'}</span>
      <input
        inputMode="numeric"
        aria-label={`実施${block.type === 'single' ? 'セット数' : '周回数'}`}
        value={value}
        onChange={(e) => onChange(numeric(e.target.value))}
        className={`w-16 rounded-md border px-2 py-1 text-center text-base ${changed ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`}
      />
      <span>{unit}</span>
      <span className="text-xs text-slate-500">（計画 {planned}{unit}）</span>
    </label>
  )
}

function ExerciseRow({
  exercise,
  value,
  onChange,
}: {
  exercise: Exercise
  value: { checked: boolean; value: string; load: string }
  onChange: (p: Partial<{ checked: boolean; value: string; load: string }>) => void
}) {
  const valueChanged = value.value !== String(exercise.value)
  const loadChanged = value.load.trim() !== exercise.load
  return (
    <li className={`rounded-lg p-2 ring-1 ${value.checked ? 'bg-emerald-50 ring-emerald-200' : 'bg-slate-50 ring-slate-200'}`}>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={value.checked}
          onChange={(e) => onChange({ checked: e.target.checked })}
          className="size-6 shrink-0 accent-emerald-600"
          aria-label={`${exercise.name}をやった`}
        />
        <span className="min-w-0 flex-1">
          <span className="font-medium">{exercise.name}</span>
          <span className="ml-2 text-xs text-slate-500">
            計画 {formatAmount(exercise)}
            {exercise.load ? `・${exercise.load}` : ''}
          </span>
          {exercise.memo && <span className="block text-xs text-slate-500">{exercise.memo}</span>}
        </span>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2 pl-9">
        <label className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
          <span className="shrink-0 whitespace-nowrap">実績</span>
          <input
            inputMode="numeric"
            aria-label={`${exercise.name}の実績（${unitLabel[exercise.unit]}）`}
            value={value.value}
            onChange={(e) => onChange({ value: numeric(e.target.value) })}
            className={`w-full min-w-0 rounded-md border px-2 py-1 text-base ${valueChanged ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'}`}
          />
          <span className="shrink-0 text-sm">{unitLabel[exercise.unit]}</span>
        </label>
        <label className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
          <span className="shrink-0 whitespace-nowrap">負荷</span>
          <input
            value={value.load}
            maxLength={30}
            aria-label={`${exercise.name}の負荷`}
            onChange={(e) => onChange({ load: e.target.value })}
            className={`w-full min-w-0 rounded-md border px-2 py-1 text-base ${loadChanged ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'}`}
          />
        </label>
      </div>
    </li>
  )
}

/** 選手が自分で追加した種目（メニュー末尾の「追加分」） */
function AddedSection({ added, onChange }: { added: Exercise[]; onChange: (a: Exercise[]) => void }) {
  const set = (i: number, patch: Partial<Exercise>) => onChange(added.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  return (
    <section className="rounded-xl bg-white p-3 shadow-sm">
      <h2 className="font-bold">追加分</h2>
      <p className="text-xs text-slate-500">メニューにない種目をやったときに追加してください。</p>
      <ul className="mt-2 space-y-2">
        {added.map((e, i) => (
          <li key={e.id} className="space-y-2 rounded-lg bg-sky-50 p-2 ring-1 ring-sky-200">
            <div className="flex items-center gap-2">
              <input
                value={e.name}
                maxLength={40}
                placeholder="種目名"
                aria-label={`追加分${i + 1}の種目名`}
                onChange={(ev) => set(i, { name: ev.target.value })}
                className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-base"
              />
              <button
                type="button"
                onClick={() => onChange(added.filter((_, j) => j !== i))}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-red-700 ring-1 ring-red-200"
              >
                削除
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                value={Number.isFinite(e.value) ? String(e.value) : ''}
                aria-label={`追加分${i + 1}の回数・秒数`}
                onChange={(ev) => {
                  const t = numeric(ev.target.value)
                  set(i, { value: t === '' ? Number.NaN : Number(t) })
                }}
                className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-base"
              />
              <div className="flex rounded-md ring-1 ring-slate-300" role="group" aria-label="単位">
                {(['reps', 'sec'] as Unit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={e.unit === u}
                    onClick={() => set(i, { unit: u })}
                    className={`px-3 py-1 text-sm ${e.unit === u ? 'bg-sky-700 text-white' : 'text-slate-700'} first:rounded-l-md last:rounded-r-md`}
                  >
                    {unitLabel[u]}
                  </button>
                ))}
              </div>
              <input
                value={e.load}
                maxLength={30}
                placeholder="負荷"
                aria-label={`追加分${i + 1}の負荷`}
                onChange={(ev) => set(i, { load: ev.target.value })}
                className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-base"
              />
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...added, newExercise()])}
        disabled={added.length >= 20}
        className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-sky-700 ring-1 ring-sky-200 disabled:opacity-40"
      >
        ＋ 種目を追加
      </button>
    </section>
  )
}
