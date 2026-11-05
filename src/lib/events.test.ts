import { describe, expect, it } from 'vitest'
import { cancelReasonSchema, describeChange, eventInputSchema, groupByDate, menuState, pasteRows, toTemplate } from './events'

const valid = { kind: 'dryland', date: '2026-11-10', start_time: '16:00', place: '学校', duration_min: '40' }

describe('eventInputSchema', () => {
  it('正しい入力は通り、時間は数値になる', () => {
    expect(eventInputSchema.parse(valid)).toEqual({ ...valid, duration_min: 40 })
  })
  it('場所は空でもよい', () => {
    expect(eventInputSchema.safeParse({ ...valid, place: '' }).success).toBe(true)
  })
  it('時間の範囲', () => {
    expect(eventInputSchema.safeParse({ ...valid, duration_min: '0' }).success).toBe(false)
    expect(eventInputSchema.safeParse({ ...valid, duration_min: '601' }).success).toBe(false)
    expect(eventInputSchema.safeParse({ ...valid, duration_min: '1.5' }).success).toBe(false)
  })
  it('場所は50文字まで', () => {
    expect(eventInputSchema.safeParse({ ...valid, place: 'あ'.repeat(51) }).success).toBe(false)
  })
})

describe('cancelReasonSchema', () => {
  it('空白だけは不可', () => {
    expect(cancelReasonSchema.safeParse('  ').success).toBe(false)
    expect(cancelReasonSchema.parse(' 発熱 ')).toBe('発熱')
  })
})

describe('コピーと貼り付け', () => {
  const event = {
    kind: 'dryland' as const,
    start_time: '16:00:00',
    place: '学校',
    duration_min: 40,
  }
  it('コピーは枠だけ（日付・状態は含まない）', () => {
    expect(toTemplate(event)).toEqual({ kind: 'dryland', start_time: '16:00', place: '学校', duration_min: 40 })
  })
  it('選んだ日ごとに1件。重複は除き日付順', () => {
    const rows = pasteRows(toTemplate(event), ['2026-11-12', '2026-11-10', '2026-11-12'])
    expect(rows.map((r) => r.date)).toEqual(['2026-11-10', '2026-11-12'])
    expect(rows[0]).toEqual({ kind: 'dryland', start_time: '16:00', place: '学校', duration_min: 40, date: '2026-11-10' })
  })
})

describe('groupByDate', () => {
  it('日付ごとに開始時刻順で並べる', () => {
    const m = groupByDate([
      { date: '2026-11-10', start_time: '18:00:00', id: 'b' },
      { date: '2026-11-10', start_time: '06:00:00', id: 'a' },
      { date: '2026-11-11', start_time: '07:00:00', id: 'c' },
    ])
    expect(m.get('2026-11-10')?.map((e) => e.id)).toEqual(['a', 'b'])
    expect(m.get('2026-11-11')?.map((e) => e.id)).toEqual(['c'])
  })
})

describe('describeChange', () => {
  const from = { date: '2026-11-10', start_time: '16:00', place: '学校', duration_min: 40 }
  it('日時の変更', () => {
    expect(describeChange(from, { date: '2026-11-12', start_time: '16:00:00', place: '学校', duration_min: 40 })).toBe(
      '11/10 16:00 → 11/12 16:00',
    )
  })
  it('場所と時間の変更', () => {
    expect(describeChange(from, { date: '2026-11-10', start_time: '16:00:00', place: '自宅', duration_min: 30 })).toBe(
      '場所 学校 → 自宅、40分 → 30分',
    )
  })
})

describe('menuState', () => {
  const menu = { event_id: 'x', updated_at: '', notified_at: null }
  it('未設定／設定済み／実施中／実施済み', () => {
    expect(menuState({ menu: null, record: null })).toBe('none')
    expect(menuState({ menu, record: null })).toBe('set')
    expect(menuState({ menu, record: { started: false, completed_at: null } })).toBe('set')
    expect(menuState({ menu, record: { started: true, completed_at: null } })).toBe('in_progress')
    expect(menuState({ menu, record: { started: true, completed_at: '2026-11-10T08:00:00Z' } })).toBe('done')
  })
})
