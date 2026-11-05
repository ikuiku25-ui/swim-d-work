import webpush from 'npm:web-push@3.6.7'

export type PushSubscriptionJSON = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string }

let configured = false

function configure() {
  if (configured) return
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT')
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT が未設定です')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export function isPushSubscription(v: unknown): v is PushSubscriptionJSON {
  const s = v as PushSubscriptionJSON
  return (
    typeof s?.endpoint === 'string' &&
    s.endpoint.startsWith('https://') &&
    typeof s.keys?.p256dh === 'string' &&
    typeof s.keys?.auth === 'string'
  )
}

/**
 * 1件送る。購読が無効（404/410）なら gone: true を返すので、呼び出し側で購読を削除する。
 */
export async function sendPush(
  subscription: PushSubscriptionJSON,
  message: PushMessage,
): Promise<{ ok: true } | { ok: false; gone: boolean; error: string }> {
  configure()
  try {
    await webpush.sendNotification(subscription, JSON.stringify(message), { TTL: 60 * 60 * 24 })
    return { ok: true }
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    return {
      ok: false,
      gone: status === 404 || status === 410,
      error: `${status ?? ''} ${(e as Error).message}`.trim(),
    }
  }
}
