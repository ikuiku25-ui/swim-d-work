import { z } from 'zod'

/**
 * メニューの形式。DB の validate_menu_blocks（supabase/migrations/20261107000100_menus.sql）と同じ制約に保つ。
 */
const id = z.string().min(1).max(64)
const int = (lo: number, hi: number, label: string) =>
  z
    .number({ message: `${label}を数字で入力してください` })
    .int(`${label}は整数で入力してください`)
    .min(lo, `${label}は${lo}以上にしてください`)
    .max(hi, `${label}は${hi}以下にしてください`)

export const exerciseSchema = z.object({
  id,
  name: z.string().trim().min(1, '種目名を入力してください').max(40, '種目名は40文字までです'),
  value: int(1, 9999, '回数・秒数'),
  unit: z.enum(['reps', 'sec']),
  load: z.string().trim().max(30, '負荷は30文字までです'),
  memo: z.string().trim().max(200, 'メモは200文字までです'),
})

export const singleBlockSchema = z.object({
  id,
  type: z.literal('single'),
  sets: int(1, 20, 'セット数'),
  rest_sec: int(0, 600, 'セット間休憩'),
  memo: z.string().trim().max(200, 'メモは200文字までです'),
  exercise: exerciseSchema,
})

export const circuitBlockSchema = z.object({
  id,
  type: z.literal('circuit'),
  rounds: int(1, 20, '周回数'),
  rest_between_exercises_sec: int(0, 600, '種目間休憩'),
  rest_between_rounds_sec: int(0, 900, '周回間休憩'),
  memo: z.string().trim().max(200, 'メモは200文字までです'),
  exercises: z.array(exerciseSchema).min(1, 'サーキットには種目を1つ以上入れてください').max(15, 'サーキットの種目は15個までです'),
})

export const blockSchema = z.discriminatedUnion('type', [singleBlockSchema, circuitBlockSchema])

export const menuBlocksSchema = z
  .array(blockSchema)
  .min(1, 'ブロックを1つ以上入れてください')
  .max(30, 'ブロックは30個までです')
  .refine((blocks) => {
    const ids = allIds(blocks)
    return new Set(ids).size === ids.length
  }, 'ブロックや種目の ID が重複しています')

export type Exercise = z.infer<typeof exerciseSchema>
export type SingleBlock = z.infer<typeof singleBlockSchema>
export type CircuitBlock = z.infer<typeof circuitBlockSchema>
export type Block = z.infer<typeof blockSchema>
export type MenuBlocks = Block[]

export type Unit = Exercise['unit']
export const unitLabel: Record<Unit, string> = { reps: '回', sec: '秒' }

function allIds(blocks: Block[]): string[] {
  return blocks.flatMap((b) =>
    b.type === 'single' ? [b.id, b.exercise.id] : [b.id, ...b.exercises.map((e) => e.id)],
  )
}

export function newId(): string {
  return crypto.randomUUID()
}

export function newExercise(): Exercise {
  return { id: newId(), name: '', value: 10, unit: 'reps', load: '', memo: '' }
}

export function newSingleBlock(): SingleBlock {
  return { id: newId(), type: 'single', sets: 3, rest_sec: 60, memo: '', exercise: newExercise() }
}

export function newCircuitBlock(): CircuitBlock {
  return {
    id: newId(),
    type: 'circuit',
    rounds: 3,
    rest_between_exercises_sec: 15,
    rest_between_rounds_sec: 90,
    memo: '',
    exercises: [newExercise(), newExercise()],
  }
}

/** 60 → '1分'、90 → '1分30秒'、30 → '30秒'、0 → 'なし' */
export function formatSeconds(sec: number): string {
  if (sec === 0) return 'なし'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}秒`
  if (s === 0) return `${m}分`
  return `${m}分${s}秒`
}

/** 種目の量：'15回'、'30秒'、秒は60以上なら '5分' のように整形 */
export function formatAmount(e: Pick<Exercise, 'value' | 'unit'>): string {
  return e.unit === 'reps' ? `${e.value}回` : formatSeconds(e.value)
}

/** 'スクワット 15回（自重）' */
export function formatExercise(e: Pick<Exercise, 'name' | 'value' | 'unit' | 'load'>): string {
  return `${e.name} ${formatAmount(e)}${e.load ? `（${e.load}）` : ''}`
}

/** ブロックの見出し：'単独：3セット（休憩1分）' / 'サーキット 3周（種目間15秒・周回間1分30秒）' */
export function blockHeading(b: Block): string {
  if (b.type === 'single') {
    return `単独：${b.sets}セット${b.sets > 1 ? `（休憩${formatSeconds(b.rest_sec)}）` : ''}`
  }
  return `サーキット ${b.rounds}周（種目間${formatSeconds(b.rest_between_exercises_sec)}・周回間${formatSeconds(b.rest_between_rounds_sec)}）`
}

/** 配列の要素を1つ上（-1）または下（+1）に動かす */
export function move<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/** 入力の検証。最初のエラーを「ブロック番号＋内容」の日本語で返す */
export function validateMenu(blocks: unknown): { ok: true; blocks: MenuBlocks } | { ok: false; error: string } {
  const r = menuBlocksSchema.safeParse(blocks)
  if (r.success) return { ok: true, blocks: r.data }
  const issue = r.error.issues[0]
  const blockNo = typeof issue.path[0] === 'number' ? `ブロック${issue.path[0] + 1}：` : ''
  return { ok: false, error: `${blockNo}${issue.message}` }
}

/** 種目数の合計（一覧表示用） */
export function exerciseCount(blocks: MenuBlocks): number {
  return blocks.reduce((n, b) => n + (b.type === 'single' ? 1 : b.exercises.length), 0)
}
