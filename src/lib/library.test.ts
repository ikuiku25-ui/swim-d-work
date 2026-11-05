import { describe, expect, it } from 'vitest'
import { cloneWithNewIds, filterByTags, parseTags, referenceInputSchema, tagsByFrequency } from './library'
import { validateMenu, type MenuBlocks } from './menu'

describe('parseTags', () => {
  it('読点・カンマ・空白（全角含む）で区切り、重複を除く', () => {
    expect(parseTags('体幹、肩 下半身,試合前　肩')).toEqual(['体幹', '肩', '下半身', '試合前'])
    expect(parseTags('   ')).toEqual([])
  })
})

describe('referenceInputSchema', () => {
  const base = { title: '肩甲骨まわり', url: '', memo: '', tags: [] }
  it('URL は空か http(s)', () => {
    expect(referenceInputSchema.safeParse(base).success).toBe(true)
    expect(referenceInputSchema.safeParse({ ...base, url: 'https://example.com/a' }).success).toBe(true)
    expect(referenceInputSchema.safeParse({ ...base, url: 'javascript:alert(1)' }).success).toBe(false)
    expect(referenceInputSchema.safeParse({ ...base, url: 'example.com' }).success).toBe(false)
  })
  it('タイトルは必須', () => {
    expect(referenceInputSchema.safeParse({ ...base, title: ' ' }).success).toBe(false)
  })
  it('タグは10個まで', () => {
    expect(referenceInputSchema.safeParse({ ...base, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).success).toBe(false)
  })
})

describe('タグの集計と絞り込み', () => {
  const notes = [{ tags: ['肩', '体幹'] }, { tags: ['体幹'] }, { tags: ['下半身', '体幹'] }]
  it('使われている回数の多い順', () => {
    expect(tagsByFrequency(notes)).toEqual(['体幹', '下半身', '肩'])
  })
  it('選んだタグをすべて含むものだけ', () => {
    expect(filterByTags(notes, ['体幹'])).toHaveLength(3)
    expect(filterByTags(notes, ['体幹', '肩'])).toEqual([{ tags: ['肩', '体幹'] }])
    expect(filterByTags(notes, [])).toHaveLength(3)
  })
})

describe('cloneWithNewIds', () => {
  const blocks: MenuBlocks = [
    { id: 'b1', type: 'single', sets: 3, rest_sec: 60, memo: '', exercise: { id: 'e1', name: '懸垂', value: 8, unit: 'reps', load: '', memo: '' } },
    {
      id: 'b2', type: 'circuit', rounds: 3, rest_between_exercises_sec: 15, rest_between_rounds_sec: 90, memo: '',
      exercises: [{ id: 'e2', name: 'スクワット', value: 15, unit: 'reps', load: '自重', memo: '' }],
    },
  ]
  it('内容は同じで ID だけ変わり、2回入れても重複しない', () => {
    const merged = [...cloneWithNewIds(blocks), ...cloneWithNewIds(blocks)]
    expect(validateMenu(merged).ok).toBe(true)
    expect(merged[0]).toMatchObject({ type: 'single', sets: 3, exercise: { name: '懸垂', value: 8 } })
    expect(merged[0].id).not.toBe('b1')
  })
})
