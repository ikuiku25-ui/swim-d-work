import { describe, expect, it } from 'vitest'
import { athleteStatus } from './athleteStatus'

describe('athleteStatus', () => {
  it('停止中が最優先', () => {
    expect(athleteStatus({ is_active: false, last_sign_in_at: '2026-11-05T00:00:00Z' })).toBe('suspended')
    expect(athleteStatus({ is_active: false, last_sign_in_at: null })).toBe('suspended')
  })
  it('一度もログインしていなければ招待中', () => {
    expect(athleteStatus({ is_active: true, last_sign_in_at: null })).toBe('invited')
  })
  it('ログイン済みなら利用中', () => {
    expect(athleteStatus({ is_active: true, last_sign_in_at: '2026-11-05T00:00:00Z' })).toBe('active')
  })
})
