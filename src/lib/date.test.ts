import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  daysFrom,
  formatDuration,
  formatMonthDay,
  formatTime,
  monthGrid,
  todayJst,
  weekdayLabel,
} from './date'

describe('todayJst', () => {
  it('UTC 14:59 は日本では同じ日の23:59', () => {
    expect(todayJst(new Date('2026-11-05T14:59:00Z'))).toBe('2026-11-05')
  })
  it('UTC 15:00 は日本では翌日の0:00', () => {
    expect(todayJst(new Date('2026-11-05T15:00:00Z'))).toBe('2026-11-06')
  })
})

describe('addDays / daysFrom', () => {
  it('月末・年末をまたぐ', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })
  it('今日から7日間', () => {
    expect(daysFrom('2026-11-28', 7)).toEqual([
      '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04',
    ])
  })
})

describe('曜日と表示', () => {
  it('2026-11-10 は火曜', () => {
    expect(weekdayLabel('2026-11-10')).toBe('火')
    expect(formatMonthDay('2026-11-10')).toBe('11/10（火）')
  })
  it('時刻と時間', () => {
    expect(formatTime('16:00:00')).toBe('16:00')
    expect(formatDuration(40)).toBe('40分')
    expect(formatDuration(90)).toBe('1時間30分')
    expect(formatDuration(300)).toBe('5時間')
  })
})

describe('monthGrid', () => {
  it('2026年11月：1日は日曜なので前月の日はなし、末尾は12/5まで', () => {
    const g = monthGrid('2026-11-15')
    expect(g[0]).toBe('2026-11-01')
    expect(g.at(-1)).toBe('2026-12-05')
    expect(g.length % 7).toBe(0)
  })
  it('2026年12月：1日は火曜なので前月の11/29から始まる', () => {
    const g = monthGrid('2026-12-01')
    expect(g[0]).toBe('2026-11-29')
    expect(g.at(-1)).toBe('2027-01-02')
  })
  it('addMonths は月末日でもずれない', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
  })
})
