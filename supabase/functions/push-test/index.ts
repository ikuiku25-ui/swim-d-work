// フェーズ0の動作確認用：受け取った購読あてにテスト通知を1通送る。
// 購読情報（端末ごとの秘密鍵を含む）を持つ人しか自分あてに送れないため、認証なしで公開している。
// フェーズ6で本番の通知を実装したら、この関数は削除する。
import { corsHeaders, json } from '../_shared/cors.ts'
import { isPushSubscription, sendPush } from '../_shared/webpush.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let body: { subscription?: unknown; delaySec?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON が不正です' }, 400)
  }
  if (!isPushSubscription(body.subscription)) {
    return json({ error: 'subscription が不正です' }, 400)
  }
  const subscription = body.subscription
  const delaySec = Math.min(Math.max(Number(body.delaySec) || 0, 0), 30)

  const send = async () => {
    if (delaySec > 0) await new Promise((r) => setTimeout(r, delaySec * 1000))
    const result = await sendPush(subscription, {
      title: 'SWIM D-work',
      body: 'サーバーからのテスト通知です。届いていれば成功です。',
      url: '/dev/push',
    })
    if (!result.ok) console.error('push-test failed', result.error)
    return result
  }

  if (delaySec > 0) {
    // 遅延送信：レスポンスを先に返し、送信は裏で続ける（その間にアプリを閉じて確認できる）
    const task = send()
    // Supabase の Edge Runtime ではレスポンス後も処理を続けられる
    ;(globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(task)
    return json({ queued: true, delaySec })
  }
  const result = await send()
  return json(result, result.ok ? 200 : 502)
})
