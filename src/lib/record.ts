import { z } from 'zod'
import { exerciseSchema, type Block, type Exercise, type MenuBlocks } from './menu'

/** 実績の保存形式（DB の validate_record と同じ） */
export type ExerciseResult = { checked: boolean; value: number | null; load: string | null }
export type BlockResult = { sets?: number | null; rounds?: number | null }

export type RecordRow = {
  event_id: string
  exercise_results: Record<string, ExerciseResult>
  block_results: Record<string, BlockResult>
  added_exercises: Exercise[]
  completed_at: string | null
  started: boolean
  updated_at: string
}

/** 画面で編集中の値（入力欄の文字列のまま持つ） */
export type DraftExercise = { checked: boolean; value: string; load: string }
export type Draft = {
  exercises: Record<string, DraftExercise>
  blocks: Record<string, string>
  added: Exercise[]
}

function blockExercises(b: Block): Exercise[] {
  return b.type === 'single' ? [b.exercise] : b.exercises
}

function plannedCount(b: Block): number {
  return b.type === 'single' ? b.sets : b.rounds
}

/** 計画値を入れた状態から始め、保存済みの実績があればそれを反映する */
export function draftFrom(blocks: MenuBlocks, record: RecordRow | null): Draft {
  const exercises: Record<string, DraftExercise> = {}
  const counts: Record<string, string> = {}
  for (const b of blocks) {
    const br = record?.block_results[b.id]
    const actual = b.type === 'single' ? br?.sets : br?.rounds
    counts[b.id] = String(actual ?? plannedCount(b))
    for (const e of blockExercises(b)) {
      const r = record?.exercise_results[e.id]
      exercises[e.id] = {
        checked: r?.checked ?? false,
        value: String(r?.value ?? e.value),
        load: r?.load ?? e.load,
      }
    }
  }
  return { exercises, blocks: counts, added: record?.added_exercises ?? [] }
}

function toInt(s: string): number | null {
  const t = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim()
  return /^\d+$/.test(t) ? Number(t) : null
}

const addedListSchema = z.array(exerciseSchema).max(20, '追加できる種目は20個までです')

/**
 * 保存する形に変換する。計画と同じ値は null にする（「違った数値だけ」を残す）。
 * 入力に誤りがあれば error を返す。
 */
export function toRecordPayload(
  blocks: MenuBlocks,
  draft: Draft,
):
  | { ok: true; exercise_results: Record<string, ExerciseResult>; block_results: Record<string, BlockResult>; added_exercises: Exercise[] }
  | { ok: false; error: string } {
  const exercise_results: Record<string, ExerciseResult> = {}
  const block_results: Record<string, BlockResult> = {}
  for (const [i, b] of blocks.entries()) {
    const count = toInt(draft.blocks[b.id] ?? '')
    const label = b.type === 'single' ? 'セット数' : '周回数'
    if (count === null || count > 20) return { ok: false, error: `ブロック${i + 1}：${label}は0〜20の数字で入力してください` }
    const key = b.type === 'single' ? 'sets' : 'rounds'
    block_results[b.id] = { [key]: count === plannedCount(b) ? null : count }
    for (const e of blockExercises(b)) {
      const d = draft.exercises[e.id]
      if (!d) continue
      const value = toInt(d.value)
      if (value === null || value > 9999) {
        return { ok: false, error: `${e.name}：回数・秒数は数字で入力してください` }
      }
      const load = d.load.trim()
      if (load.length > 30) return { ok: false, error: `${e.name}：負荷は30文字までです` }
      exercise_results[e.id] = {
        checked: d.checked,
        value: value === e.value ? null : value,
        load: load === e.load ? null : load,
      }
    }
  }
  const added = addedListSchema.safeParse(draft.added)
  if (!added.success) {
    const issue = added.error.issues[0]
    const no = typeof issue.path[0] === 'number' ? `追加分${issue.path[0] + 1}：` : ''
    return { ok: false, error: `${no}${issue.message}` }
  }
  return { ok: true, exercise_results, block_results, added_exercises: added.data }
}

// ---------------------------------------------------------------------------
// コーチの確認画面：計画と実績の差分
// ---------------------------------------------------------------------------

export type ExerciseOutcome = {
  exercise: Exercise
  checked: boolean
  actualValue: number
  actualLoad: string
  valueChanged: boolean
  loadChanged: boolean
}

export type BlockOutcome = {
  block: Block
  planned: number
  actual: number
  countChanged: boolean
  exercises: ExerciseOutcome[]
}

export type Outcome = {
  blocks: BlockOutcome[]
  added: Exercise[]
  summary: { total: number; checked: number; changed: number; unchecked: number; added: number }
}

export function buildOutcome(blocks: MenuBlocks, record: RecordRow | null): Outcome {
  const out: BlockOutcome[] = blocks.map((b) => {
    const br = record?.block_results[b.id]
    const actualCount = (b.type === 'single' ? br?.sets : br?.rounds) ?? plannedCount(b)
    return {
      block: b,
      planned: plannedCount(b),
      actual: actualCount,
      countChanged: actualCount !== plannedCount(b),
      exercises: blockExercises(b).map((e) => {
        const r = record?.exercise_results[e.id]
        const actualValue = r?.value ?? e.value
        const actualLoad = r?.load ?? e.load
        return {
          exercise: e,
          checked: r?.checked ?? false,
          actualValue,
          actualLoad,
          valueChanged: actualValue !== e.value,
          loadChanged: actualLoad !== e.load,
        }
      }),
    }
  })
  const all = out.flatMap((b) => b.exercises)
  const added = record?.added_exercises ?? []
  return {
    blocks: out,
    added,
    summary: {
      total: all.length,
      checked: all.filter((e) => e.checked).length,
      changed: all.filter((e) => e.valueChanged || e.loadChanged).length + out.filter((b) => b.countChanged).length,
      unchecked: all.filter((e) => !e.checked).length,
      added: added.length,
    },
  }
}
