import { useState } from 'react'
import { NotificationSettings, usePushStatus } from './NotificationSettings'

const KEY = 'swim-d-work:push-onboarding-dismissed'

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** 初回ログイン時の案内：ホーム画面への追加と通知の許可。この端末で済んでいれば出さない */
export function PushOnboarding() {
  const status = usePushStatus()
  const [hidden, setHidden] = useState(dismissed)
  if (hidden || status.isPending || status.data?.subscribed) return null
  if (status.data && !status.data.support.ok && status.data.support.reason === 'unsupported-browser') return null

  const close = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // 保存できなくても今回は閉じる
    }
    setHidden(true)
  }

  return (
    <section className="space-y-2 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-bold text-sky-900">通知を受け取る準備をしましょう</h2>
        <button type="button" onClick={close} className="shrink-0 text-xs text-slate-500">
          あとで
        </button>
      </div>
      <NotificationSettings compact />
      <p className="text-xs text-slate-500">あとからでも、右上の「設定」からできます。</p>
    </section>
  )
}
