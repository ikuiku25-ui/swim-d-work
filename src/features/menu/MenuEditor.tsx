import {
  move,
  newCircuitBlock,
  newExercise,
  newSingleBlock,
  unitLabel,
  type Block,
  type Exercise,
  type MenuBlocks,
  type Unit,
} from '../../lib/menu'
import { NumberField, SmallButton, TextField } from './fields'
import { useExerciseNames } from './useMenu'

const LOAD_PRESETS = ['自重', 'ダンベル', 'チューブ']
const NAMES_LIST_ID = 'exercise-name-suggestions'

/**
 * メニューの組み立て（ブロックを上から順に並べる）。テンプレート（フェーズ5）でも使う。
 */
export function MenuEditor({ blocks, onChange }: { blocks: MenuBlocks; onChange: (b: MenuBlocks) => void }) {
  const names = useExerciseNames()
  const update = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)))

  return (
    <div className="space-y-3">
      {/* 種目名の候補（過去に使った名前） */}
      <datalist id={NAMES_LIST_ID}>
        {(names.data ?? []).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {blocks.length === 0 && (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
          下のボタンからブロックを追加してください。単独は1種目をセットで、サーキットは複数の種目を周回で行います。
        </p>
      )}

      <ol className="space-y-3">
        {blocks.map((b, i) => (
          <li key={b.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center gap-1">
              <span className="font-bold">
                {i + 1}. {b.type === 'single' ? '単独' : 'サーキット'}
              </span>
              <span className="ml-auto flex gap-1">
                <SmallButton onClick={() => onChange(move(blocks, i, -1))} disabled={i === 0} label="ブロックを上へ">
                  ↑
                </SmallButton>
                <SmallButton onClick={() => onChange(move(blocks, i, 1))} disabled={i === blocks.length - 1} label="ブロックを下へ">
                  ↓
                </SmallButton>
                <SmallButton
                  tone="danger"
                  label="ブロックを削除"
                  onClick={() => {
                    if (window.confirm(`ブロック${i + 1}を削除しますか？`)) onChange(blocks.filter((_, j) => j !== i))
                  }}
                >
                  削除
                </SmallButton>
              </span>
            </div>
            {b.type === 'single' ? (
              <SingleFields block={b} onChange={(nb) => update(i, nb)} />
            ) : (
              <CircuitFields block={b} onChange={(nb) => update(i, nb)} />
            )}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange([...blocks, newSingleBlock()])}
          className="rounded-lg bg-white px-3 py-2 text-sm text-sky-700 ring-1 ring-sky-300"
        >
          ＋ 単独ブロック
        </button>
        <button
          type="button"
          onClick={() => onChange([...blocks, newCircuitBlock()])}
          className="rounded-lg bg-white px-3 py-2 text-sm text-sky-700 ring-1 ring-sky-300"
        >
          ＋ サーキット
        </button>
      </div>
    </div>
  )
}

function SingleFields({ block, onChange }: { block: Extract<Block, { type: 'single' }>; onChange: (b: Block) => void }) {
  return (
    <div className="space-y-2">
      <ExerciseFields exercise={block.exercise} onChange={(e) => onChange({ ...block, exercise: e })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="セット数" value={block.sets} suffix="セット" onChange={(n) => onChange({ ...block, sets: n })} />
        <NumberField label="セット間休憩" value={block.rest_sec} suffix="秒" onChange={(n) => onChange({ ...block, rest_sec: n })} />
      </div>
      <TextField label="ブロックのメモ" value={block.memo} maxLength={200} onChange={(s) => onChange({ ...block, memo: s })} />
    </div>
  )
}

function CircuitFields({ block, onChange }: { block: Extract<Block, { type: 'circuit' }>; onChange: (b: Block) => void }) {
  const setExercises = (exercises: Exercise[]) => onChange({ ...block, exercises })
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="周回数" value={block.rounds} suffix="周" onChange={(n) => onChange({ ...block, rounds: n })} />
        <NumberField
          label="種目間休憩"
          value={block.rest_between_exercises_sec}
          suffix="秒"
          onChange={(n) => onChange({ ...block, rest_between_exercises_sec: n })}
        />
        <NumberField
          label="周回間休憩"
          value={block.rest_between_rounds_sec}
          suffix="秒"
          onChange={(n) => onChange({ ...block, rest_between_rounds_sec: n })}
        />
      </div>
      <ol className="space-y-2">
        {block.exercises.map((e, i) => (
          <li key={e.id} className="rounded-lg bg-slate-50 p-2">
            <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
              種目{i + 1}
              <span className="ml-auto flex gap-1">
                <SmallButton onClick={() => setExercises(move(block.exercises, i, -1))} disabled={i === 0} label="種目を上へ">
                  ↑
                </SmallButton>
                <SmallButton
                  onClick={() => setExercises(move(block.exercises, i, 1))}
                  disabled={i === block.exercises.length - 1}
                  label="種目を下へ"
                >
                  ↓
                </SmallButton>
                <SmallButton
                  tone="danger"
                  label="種目を削除"
                  disabled={block.exercises.length === 1}
                  onClick={() => setExercises(block.exercises.filter((_, j) => j !== i))}
                >
                  削除
                </SmallButton>
              </span>
            </div>
            <ExerciseFields exercise={e} onChange={(ne) => setExercises(block.exercises.map((x, j) => (j === i ? ne : x)))} />
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => setExercises([...block.exercises, newExercise()])}
        className="w-full rounded-lg px-3 py-2 text-sm text-sky-700 ring-1 ring-sky-200"
      >
        ＋ 種目を追加
      </button>
      <TextField label="ブロックのメモ" value={block.memo} maxLength={200} onChange={(s) => onChange({ ...block, memo: s })} />
    </div>
  )
}

function ExerciseFields({ exercise, onChange }: { exercise: Exercise; onChange: (e: Exercise) => void }) {
  const set = <K extends keyof Exercise>(k: K, v: Exercise[K]) => onChange({ ...exercise, [k]: v })
  return (
    <div className="space-y-2">
      <TextField
        label="種目名"
        value={exercise.name}
        list={NAMES_LIST_ID}
        maxLength={40}
        placeholder="例：スクワット"
        onChange={(s) => set('name', s)}
      />
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <NumberField
          key={exercise.unit}
          label={exercise.unit === 'reps' ? '回数' : '秒数'}
          value={exercise.value}
          onChange={(n) => set('value', n)}
        />
        <div className="flex rounded-md ring-1 ring-slate-300" role="group" aria-label="単位">
          {(['reps', 'sec'] as Unit[]).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={exercise.unit === u}
              onClick={() => set('unit', u)}
              className={`px-3 py-1.5 text-sm ${exercise.unit === u ? 'bg-sky-700 text-white' : 'text-slate-700'} first:rounded-l-md last:rounded-r-md`}
            >
              {unitLabel[u]}
            </button>
          ))}
        </div>
      </div>
      <TextField label="負荷" value={exercise.load} maxLength={30} placeholder="例：自重、ダンベル5kg" onChange={(s) => set('load', s)} />
      <div className="flex flex-wrap gap-1">
        {LOAD_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => set('load', p)}
            className="rounded-full px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-300"
          >
            {p}
          </button>
        ))}
      </div>
      <TextField label="種目のメモ" value={exercise.memo} maxLength={200} onChange={(s) => set('memo', s)} />
    </div>
  )
}
