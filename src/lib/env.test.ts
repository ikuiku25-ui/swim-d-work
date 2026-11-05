import { describe, expect, it } from 'vitest'
import { toOrigin } from './env'

describe('toOrigin', () => {
  it('末尾のパスや空白を取り除く', () => {
    expect(toOrigin('https://abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co')
    expect(toOrigin(' https://abc.supabase.co ')).toBe('https://abc.supabase.co')
    expect(toOrigin('https://abc.supabase.co')).toBe('https://abc.supabase.co')
  })
  it('空や不正な値は undefined', () => {
    expect(toOrigin(undefined)).toBeUndefined()
    expect(toOrigin('abc')).toBeUndefined()
  })
})
