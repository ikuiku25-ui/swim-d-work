import { z } from 'zod'
import { newId, type Block, type MenuBlocks } from './menu'

/** 参考メニュー帳とテンプレート（コーチ専用） */
export type ReferenceNote = {
  id: string
  title: string
  url: string
  memo: string
  tags: string[]
  created_at: string
  updated_at: string
}

export type Template = {
  id: string
  title: string
  blocks: MenuBlocks
  reference_note_id: string | null
  updated_at: string
}

/** よく使うタグ（要件書の例） */
export const PRESET_TAGS = ['体幹', '肩', '下半身', '試合前', 'オフ期']

/** 「体幹、肩 下半身,試合前」のような入力をタグの配列にする（重複は除く） */
export function parseTags(input: string): string[] {
  const tags = input
    .split(/[、,，\s　]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  return [...new Set(tags)]
}

export const referenceInputSchema = z.object({
  title: z.string().trim().min(1, 'タイトルを入力してください').max(100, 'タイトルは100文字までです'),
  url: z
    .string()
    .trim()
    .max(2000, 'URL が長すぎます')
    .refine((u) => u === '' || /^https?:\/\/\S+$/.test(u), 'URL は http:// か https:// で始まるものを入力してください'),
  memo: z.string().max(2000, 'メモは2000文字までです'),
  tags: z
    .array(z.string().min(1).max(20, 'タグは20文字までです'))
    .max(10, 'タグは10個までです'),
})

export type ReferenceInput = z.infer<typeof referenceInputSchema>

export const templateTitleSchema = z
  .string()
  .trim()
  .min(1, 'テンプレート名を入力してください')
  .max(100, 'テンプレート名は100文字までです')

/** 全ノートのタグを、使われている回数の多い順に */
export function tagsByFrequency(notes: Pick<ReferenceNote, 'tags'>[]): string[] {
  const count = new Map<string, number>()
  for (const n of notes) for (const t of n.tags) count.set(t, (count.get(t) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja')).map(([t]) => t)
}

/** 選んだタグをすべて含むノートだけ */
export function filterByTags<T extends Pick<ReferenceNote, 'tags'>>(notes: T[], selected: string[]): T[] {
  if (selected.length === 0) return notes
  return notes.filter((n) => selected.every((t) => n.tags.includes(t)))
}

/**
 * テンプレートをメニューに入れるとき、ブロックと種目の ID を付け直す
 * （同じテンプレートを2回入れても ID が重複しないように）
 */
export function cloneWithNewIds(blocks: MenuBlocks): MenuBlocks {
  return blocks.map((b): Block =>
    b.type === 'single'
      ? { ...b, id: newId(), exercise: { ...b.exercise, id: newId() } }
      : { ...b, id: newId(), exercises: b.exercises.map((e) => ({ ...e, id: newId() })) },
  )
}
