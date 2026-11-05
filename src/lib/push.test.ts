import { describe, expect, it } from 'vitest'
import { urlBase64ToUint8Array } from './push'

describe('urlBase64ToUint8Array', () => {
  it('base64url（パディングなし、- と _ を含む）を復元する', () => {
    // 0xfb 0xff 0xbf は標準 base64 で "+/+/"、base64url で "-_-_"
    expect(Array.from(urlBase64ToUint8Array('-_-_'))).toEqual([0xfb, 0xff, 0xbf])
  })
  it('VAPID 公開鍵は 65 バイトになる', () => {
    const key =
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    expect(urlBase64ToUint8Array(key).length).toBe(65)
  })
})
