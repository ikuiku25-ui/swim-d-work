import { env } from './env'
import { currentPushSupport, type PushSupport } from './platform'
import { callFunction, supabase } from './supabase'

/** VAPID 公開鍵（base64url）を PushManager が受け取る形に変換する */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function getRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready
}

export type PushStatus = {
  support: PushSupport
  permission: NotificationPermission | 'unsupported'
  /** この端末で通知を受け取る設定が済んでいるか */
  subscribed: boolean
}

export async function getPushStatus(): Promise<PushStatus> {
  const support = currentPushSupport()
  const permission = 'Notification' in window ? Notification.permission : 'unsupported'
  if (!support.ok || permission !== 'granted') return { support, permission, subscribed: false }
  try {
    const reg = await getRegistration()
    const sub = await reg.pushManager.getSubscription()
    return { support, permission, subscribed: !!sub }
  } catch {
    return { support, permission, subscribed: false }
  }
}

/**
 * 通知を有効にする：許可を求め、購読を作ってサーバーに登録する。
 * iPhone では、ボタンのタップなどユーザー操作の中から呼ぶ必要がある。
 */
export async function enablePush(): Promise<void> {
  if (!env.vapidPublicKey) throw new Error('通知の設定（VAPID 公開鍵）がありません')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('通知が許可されませんでした。iPhone の「設定」→「通知」→「D-work」から許可してください。')
  }
  const reg = await getRegistration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey),
    }))
  const json = sub.toJSON()
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error) throw new Error('通知の登録に失敗しました。もう一度試してください。')
}

/** この端末の通知をやめる */
export async function disablePush(): Promise<void> {
  const reg = await getRegistration()
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendSelfTest(): Promise<number> {
  const r = await callFunction<{ delivered: number }>('push-self-test', {})
  return r.delivered
}

/** 送信待ちのコーチ宛て通知を送ってもらう（失敗しても画面の操作には影響させない） */
export function flushNotifications(): void {
  callFunction('flush-notifications', {}).catch(() => {
    // 毎晩22時の定期実行でも送られるので、ここでは何もしない
  })
}
