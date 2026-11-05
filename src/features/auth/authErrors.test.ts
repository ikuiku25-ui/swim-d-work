import { describe, expect, it } from 'vitest'
import { authErrorMessage, normalizeOtp } from './authErrors'

describe('normalizeOtp', () => {
  it('全角数字・空白・ハイフンを取り除いて半角数字にする', () => {
    expect(normalizeOtp('１２３ ４５６')).toBe('123456')
    expect(normalizeOtp('123-456')).toBe('123456')
  })
})

describe('authErrorMessage', () => {
  it('未登録のメールアドレス', () => {
    expect(authErrorMessage(Object.assign(new Error('Signups not allowed for otp'), { code: 'otp_disabled' }))).toContain('登録されていない')
  })
  it('コードの期限切れ', () => {
    expect(authErrorMessage(Object.assign(new Error('Token has expired or is invalid'), { code: 'otp_expired' }))).toContain('有効期限')
  })
  it('送信回数の制限', () => {
    expect(authErrorMessage(new Error('For security purposes, you can only request this after 30 seconds'))).toContain('1分ほど')
  })
  it('停止中', () => {
    expect(authErrorMessage(Object.assign(new Error('User is banned'), { code: 'user_banned' }))).toContain('停止')
  })
})
