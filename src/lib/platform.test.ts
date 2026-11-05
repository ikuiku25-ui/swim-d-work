import { describe, expect, it } from 'vitest'
import { checkPushSupport, parseIosVersion } from './platform'

const IPHONE_17_4 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPHONE_16_3 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

const base = { standalone: true, hasServiceWorker: true, hasPushManager: true }

describe('parseIosVersion', () => {
  it('iPhone の UA からバージョンを読む', () => {
    expect(parseIosVersion(IPHONE_17_4)).toBe(17.4)
    expect(parseIosVersion(IPHONE_16_3)).toBe(16.3)
  })
  it('iOS 以外は null', () => {
    expect(parseIosVersion(ANDROID)).toBeNull()
  })
})

describe('checkPushSupport', () => {
  it('iOS 16.4 未満は不可', () => {
    expect(checkPushSupport({ ...base, userAgent: IPHONE_16_3 })).toEqual({
      ok: false,
      reason: 'ios-too-old',
    })
  })
  it('iOS はホーム画面から開いていないと不可', () => {
    expect(checkPushSupport({ ...base, userAgent: IPHONE_17_4, standalone: false })).toEqual({
      ok: false,
      reason: 'not-standalone',
    })
  })
  it('iOS 17.4 でホーム画面から開いていれば可', () => {
    expect(checkPushSupport({ ...base, userAgent: IPHONE_17_4 })).toEqual({ ok: true })
  })
  it('Android はブラウザのままでも可', () => {
    expect(checkPushSupport({ ...base, userAgent: ANDROID, standalone: false })).toEqual({ ok: true })
  })
  it('PushManager がなければ不可', () => {
    expect(checkPushSupport({ ...base, userAgent: ANDROID, hasPushManager: false })).toEqual({
      ok: false,
      reason: 'unsupported-browser',
    })
  })
})
