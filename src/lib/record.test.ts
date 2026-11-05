import { describe, expect, it } from 'vitest'
import type { MenuBlocks } from './menu'
import { buildOutcome, draftFrom, toRecordPayload, type RecordRow } from './record'

const blocks: MenuBlocks = [
  {
    id: 'b1', type: 'single', sets: 3, rest_sec: 60, memo: '',
    exercise: { id: 'e1', name: '懸垂', value: 8, unit: 'reps', load: '自重', memo: '' },
  },
  {
    id: 'b2', type: 'circuit', rounds: 3, rest_between_exercises_sec: 15, rest_between_rounds_sec: 90, memo: '',
    exercises: [
      { id: 'e2', name: 'スクワット', value: 15, unit: 'reps', load: '自重', memo: '' },
      { id: 'e3', name: 'プランク', value: 30, unit: 'sec', load: '', memo: '' },
    ],
  },
]

const record = (r: Partial<RecordRow>): RecordRow => ({
  event_id: 'ev', exercise_results: {}, block_results: {}, added_exercises: [],
  completed_at: null, started: true, updated_at: '', ...r,
})

describe('draftFrom', () => {
  it('記録がなければ計画値が入った状態', () => {
    const d = draftFrom(blocks, null)
    expect(d.blocks).toEqual({ b1: '3', b2: '3' })
    expect(d.exercises.e2).toEqual({ checked: false, value: '15', load: '自重' })
  })
  it('保存済みの実績を反映する', () => {
    const d = draftFrom(blocks, record({
      exercise_results: { e2: { checked: true, value: 12, load: null } },
      block_results: { b2: { rounds: 2 } },
    }))
    expect(d.exercises.e2).toEqual({ checked: true, value: '12', load: '自重' })
    expect(d.blocks.b2).toBe('2')
  })
})

describe('toRecordPayload', () => {
  it('計画と同じ値は null（違った数値だけ残す）', () => {
    const d = draftFrom(blocks, null)
    d.exercises.e1.checked = true
    d.exercises.e2 = { checked: true, value: '１２', load: '自重' }
    d.blocks.b2 = '2'
    const r = toRecordPayload(blocks, d)
    expect(r).toEqual({
      ok: true,
      exercise_results: {
        e1: { checked: true, value: null, load: null },
        e2: { checked: true, value: 12, load: null },
        e3: { checked: false, value: null, load: null },
      },
      block_results: { b1: { sets: null }, b2: { rounds: 2 } },
      added_exercises: [],
    })
  })
  it('数字でない入力はエラー', () => {
    const d = draftFrom(blocks, null)
    d.exercises.e3.value = 'abc'
    expect(toRecordPayload(blocks, d)).toEqual({ ok: false, error: 'プランク：回数・秒数は数字で入力してください' })
    const d2 = draftFrom(blocks, null)
    d2.blocks.b1 = '30'
    expect(toRecordPayload(blocks, d2)).toEqual({ ok: false, error: 'ブロック1：セット数は0〜20の数字で入力してください' })
  })
  it('追加した種目の名前が空ならエラー', () => {
    const d = draftFrom(blocks, null)
    d.added = [{ id: 'x', name: '', value: 20, unit: 'reps', load: '', memo: '' }]
    expect(toRecordPayload(blocks, d)).toEqual({ ok: false, error: '追加分1：種目名を入力してください' })
  })
})

describe('buildOutcome', () => {
  it('計画どおり・差分・未チェック・追加を数える', () => {
    const o = buildOutcome(blocks, record({
      exercise_results: {
        e1: { checked: true, value: null, load: null },
        e2: { checked: true, value: 12, load: null },
      },
      block_results: { b2: { rounds: 2 } },
      added_exercises: [{ id: 'x', name: '腹筋', value: 20, unit: 'reps', load: '', memo: '' }],
    }))
    expect(o.summary).toEqual({ total: 3, checked: 2, changed: 2, unchecked: 1, added: 1 })
    expect(o.blocks[1]).toMatchObject({ planned: 3, actual: 2, countChanged: true })
    expect(o.blocks[1].exercises[0]).toMatchObject({ actualValue: 12, valueChanged: true, checked: true })
    expect(o.blocks[1].exercises[1]).toMatchObject({ checked: false, valueChanged: false })
  })
})
