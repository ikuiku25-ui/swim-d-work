/** iOS のバージョン（例: 17.4）。iOS 以外は null */
export function parseIosVersion(userAgent: string): number | null {
  // iPadOS 13 以降は Mac と名乗るため、ここでは iPhone/iPad/iPod の表記だけを見る
  const m = userAgent.match(/(?:iPhone|iPad|iPod).*? OS (\d+)_(\d+)/)
  if (!m) return null
  return Number(m[1]) + Number(m[2]) / 10
}

/** Web Push を受け取れる最小の iOS バージョン */
export const MIN_IOS_FOR_PUSH = 16.4

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'ios-too-old' | 'not-standalone' | 'unsupported-browser' }

/**
 * この端末・起動方法でプッシュ通知を使えるかを判定する。
 * iPhone はホーム画面に追加したアプリとして開いたときだけ使える。
 */
export function checkPushSupport(env: {
  userAgent: string
  standalone: boolean
  hasServiceWorker: boolean
  hasPushManager: boolean
}): PushSupport {
  const ios = parseIosVersion(env.userAgent)
  if (ios !== null) {
    if (ios < MIN_IOS_FOR_PUSH) return { ok: false, reason: 'ios-too-old' }
    if (!env.standalone) return { ok: false, reason: 'not-standalone' }
  }
  if (!env.hasServiceWorker || !env.hasPushManager) {
    return { ok: false, reason: 'unsupported-browser' }
  }
  return { ok: true }
}

export function currentPushSupport(): PushSupport {
  return checkPushSupport({
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
  })
}

export const pushSupportMessage: Record<Exclude<PushSupport, { ok: true }>['reason'], string> = {
  'ios-too-old': 'iOS 16.4 以上が必要です。iPhone のソフトウェアを更新してください。',
  'not-standalone':
    'Safari の共有ボタンから「ホーム画面に追加」し、ホーム画面のアイコンから開いてください。',
  'unsupported-browser': 'このブラウザはプッシュ通知に対応していません。',
}
