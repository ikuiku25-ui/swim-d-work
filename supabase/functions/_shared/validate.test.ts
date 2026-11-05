import { assertEquals } from 'jsr:@std/assert@1'
import { parseInvite, parseStatusChange } from './validate.ts'

Deno.test('parseInvite：正しい入力', () => {
  assertEquals(parseInvite({ display_name: ' 山田 ', email: ' Taro@Example.com ' }), {
    ok: true,
    displayName: '山田',
    email: 'taro@example.com',
  })
})

Deno.test('parseInvite：名前が空・長すぎる', () => {
  assertEquals(parseInvite({ display_name: '  ', email: 'a@b.co' }).ok, false)
  assertEquals(parseInvite({ display_name: 'あ'.repeat(31), email: 'a@b.co' }).ok, false)
})

Deno.test('parseInvite：メールアドレスが不正', () => {
  assertEquals(parseInvite({ display_name: 'a', email: 'abc' }).ok, false)
  assertEquals(parseInvite({ display_name: 'a', email: 'a b@c.d' }).ok, false)
  assertEquals(parseInvite({ display_name: 'a' }).ok, false)
})

Deno.test('parseStatusChange', () => {
  const id = '00000000-0000-0000-0000-0000000000a1'
  assertEquals(parseStatusChange({ athlete_id: id, active: false }), {
    ok: true,
    athleteId: id,
    active: false,
  })
  assertEquals(parseStatusChange({ athlete_id: 'x', active: false }).ok, false)
  assertEquals(parseStatusChange({ athlete_id: id, active: 'no' }).ok, false)
})
