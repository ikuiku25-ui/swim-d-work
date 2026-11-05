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

/**
 * 通知の許可を求め、プッシュ購読を作る（既にあればそれを返す）。
 * iPhone では、ボタンのタップなどユーザー操作の中から呼ぶ必要がある。
 */
export async function subscribePush(vapidPublicKey: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('通知が許可されませんでした。端末の設定から通知を許可してください。')
  }
  const reg = await getRegistration()
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })
}
