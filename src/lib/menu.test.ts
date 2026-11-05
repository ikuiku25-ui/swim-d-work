import { describe, expect, it } from 'vitest'
import {
  blockHeading,
  formatExercise,
  formatSeconds,
  move,
  newCircuitBlock,
  newSingleBlock,
  validateMenu,
  type MenuBlocks,
} from './menu'

const sample: MenuBlocks = [
  {
    id: 'b1', type: 'single', sets: 1, rest_sec: 0, memo: 'ウォームアップ',
    exercise: { id: 'e1', name: 'ジョグ', value: 300, unit: 'sec', load: '', memo: '' },
  },
  {
    id: 'b2', type: 'circuit', rounds: 3, rest_between_exercises_sec: 15, rest_between_rounds_sec: 90, memo: '',
    exercises: [
      { id: 'e2', name: 'スクワット', value: 15, unit: 'reps', load: '自重', memo: '' },
      { id: 'e3', name: 'プランク', value: 30, unit: 'sec', load: '', memo: '' },
    ],
  },
]

describe('表示', () => {
  it('秒の整形', () => {
    expect(formatSeconds(0)).toBe('なし')
    expect(formatSeconds(30)).toBe('30秒')
    expect(formatSeconds(60)).toBe('1分')
    expect(formatSeconds(90)).toBe('1分30秒')
    expect(formatSeconds(300)).toBe('5分')
  })
  it('種目', () => {
    expect(formatExercise({ name: 'スクワット', value: 15, unit: 'reps', load: '自重' })).toBe('スクワット 15回（自重）')
    expect(formatExercise({ name: 'ジョグ', value: 300, unit: 'sec', load: '' })).toBe('ジョグ 5分')
  })
  it('ブロックの見出し', () => {
    expect(blockHeading(sample[0])).toBe('単独：1セット')
    expect(blockHeading({ ...newSingleBlock(), sets: 3, rest_sec: 60 })).toBe('単独：3セット（休憩1分）')
    expect(blockHeading(sample[1])).toBe('サーキット 3周（種目間15秒・周回間1分30秒）')
  })
})

describe('validateMenu', () => {
  it('正しいメニューは通る（前後の空白は取り除く）', () => {
    const b = newSingleBlock()
    b.exercise.name = ' ジョグ '
    const r = validateMenu([b, sample[1]])
    expect(r.ok).toBe(true)
    if (r.ok && r.blocks[0].type === 'single') expect(r.blocks[0].exercise.name).toBe('ジョグ')
  })
  it('空のメニューは不可', () => {
    expect(validateMenu([])).toEqual({ ok: false, error: 'ブロックを1つ以上入れてください' })
  })
  it('種目名が空ならブロック番号つきで知らせる', () => {
    const blocks = [sample[0], newCircuitBlock()]
    expect(validateMenu(blocks)).toEqual({ ok: false, error: 'ブロック2：種目名を入力してください' })
  })
  it('回数0や小数は不可', () => {
    const b = newSingleBlock()
    b.exercise.name = '懸垂'
    expect(validateMenu([{ ...b, exercise: { ...b.exercise, value: 0 } }]).ok).toBe(false)
    expect(validateMenu([{ ...b, exercise: { ...b.exercise, value: 1.5 } }]).ok).toBe(false)
    expect(validateMenu([b]).ok).toBe(true)
  })
  it('ID の重複は不可', () => {
    const dup = [sample[0], { ...sample[1], id: 'b1' }]
    expect(validateMenu(dup).ok).toBe(false)
  })
})

describe('move', () => {
  it('上下に入れ替え、端では動かさない', () => {
    expect(move([1, 2, 3], 1, -1)).toEqual([2, 1, 3])
    expect(move([1, 2, 3], 1, 1)).toEqual([1, 3, 2])
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 2, 3])
  })
})
