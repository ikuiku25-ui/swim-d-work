// 実行：supabase/functions で `deno task test`
// 端末側の鍵を作って購読を模し、届いた通知を復号できるかを確認する。
// web-push は常に HTTPS で送るため、テスト専用の自己署名証明書（testdata/）で受け口を立てる。
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { Buffer } from 'node:buffer'
import { createECDH, randomBytes } from 'node:crypto'
import ece from 'npm:http_ece@1.2.0'
import webpush from 'npm:web-push@3.6.7'
import { isPushSubscription, sendPush } from './webpush.ts'

const vapid = webpush.generateVAPIDKeys()
Deno.env.set('VAPID_PUBLIC_KEY', vapid.publicKey)
Deno.env.set('VAPID_PRIVATE_KEY', vapid.privateKey)
Deno.env.set('VAPID_SUBJECT', 'mailto:test@example.com')

// テスト内だけ自己署名証明書を許可する（本番コードには影響しない）
Deno.env.set('NODE_TLS_REJECT_UNAUTHORIZED', '0')

const tls = {
  cert: Deno.readTextFileSync(new URL('./testdata/localhost-cert.pem', import.meta.url)),
  key: Deno.readTextFileSync(new URL('./testdata/localhost-key.pem', import.meta.url)),
}

function fakeDevice() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const auth = randomBytes(16)
  return {
    ecdh,
    auth,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: auth.toString('base64url'),
    },
  }
}

Deno.test('購読の形式チェック', () => {
  const d = fakeDevice()
  assert(isPushSubscription({ endpoint: 'https://web.push.apple.com/abc', keys: d.keys }))
  assert(!isPushSubscription({ endpoint: 'http://example.com', keys: d.keys }))
  assert(!isPushSubscription({ endpoint: 'https://example.com' }))
  assert(!isPushSubscription(null))
})

Deno.test('送った通知を端末側の鍵で復号できる', async () => {
  const device = fakeDevice()
  let received: { headers: Headers; body: Uint8Array } | null = null
  const server = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {}, ...tls }, async (req) => {
    received = { headers: req.headers, body: new Uint8Array(await req.arrayBuffer()) }
    return new Response(null, { status: 201 })
  })
  const endpoint = `https://127.0.0.1:${server.addr.port}/push/abc`

  const result = await sendPush(
    { endpoint, keys: device.keys },
    { title: 'テスト', body: '本文', url: '/x' },
  )
  await server.shutdown()

  assertEquals(result, { ok: true })
  assert(received)
  const r = received as { headers: Headers; body: Uint8Array }
  assertEquals(r.headers.get('content-encoding'), 'aes128gcm')
  assert(r.headers.get('authorization')?.startsWith('vapid t='))
  const plain = ece.decrypt(Buffer.from(r.body), {
    version: 'aes128gcm',
    privateKey: device.ecdh,
    authSecret: device.auth.toString('base64url'),
  })
  assertEquals(JSON.parse(plain.toString('utf8')), { title: 'テスト', body: '本文', url: '/x' })
})

Deno.test('購読切れ（410）は gone として返す', async () => {
  const device = fakeDevice()
  const server = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {}, ...tls }, () => new Response('gone', { status: 410 }))
  const result = await sendPush(
    { endpoint: `https://127.0.0.1:${server.addr.port}/x`, keys: device.keys },
    { title: 't', body: 'b' },
  )
  await server.shutdown()
  assertEquals(result.ok, false)
  assert(!result.ok && result.gone)
})
