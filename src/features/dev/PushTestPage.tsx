import { useState } from 'react'
import { env, missingEnv } from '../../lib/env'
import { currentPushSupport, parseIosVersion, pushSupportMessage } from '../../lib/platform'
import { getRegistration, subscribePush } from '../../lib/push'

/**
 * フェーズ0：iPhone 実機でプッシュ通知が届くかを確かめる画面。
 * 1. 通知を許可して購読 → 2. 端末内だけで表示 → 3. サーバー（Edge Function）から送信
 */
const permissionLabel: Record<string, string> = {
  granted: '許可済み',
  denied: '拒否（端末の設定から許可してください）',
  default: '未設定',
  unsupported: '非対応',
}

export function PushTestPage() {
  const support = currentPushSupport()
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported',
  )

  const add = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString('ja-JP')} ${line}`, ...l])

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      add(`× ${label}：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const onSubscribe = () =>
    run('購読', async () => {
      if (!env.vapidPublicKey) throw new Error('VITE_VAPID_PUBLIC_KEY が設定されていません')
      const sub = await subscribePush(env.vapidPublicKey).finally(() =>
        setPermission(Notification.permission),
      )
      setSubscription(sub)
      add(`○ 購読しました（送信先：${new URL(sub.endpoint).host}）`)
    })

  const onLocal = () =>
    run('端末内の通知', async () => {
      const reg = await getRegistration()
      await reg.showNotification('SWIM D-work', {
        body: '端末内から表示したテスト通知です',
        icon: '/pwa-192x192.png',
      })
      add('○ 端末内の通知を表示しました')
    })

  const onServer = () =>
    run('サーバーから送信', async () => {
      if (!subscription) throw new Error('先に「通知を許可して購読」を押してください')
      if (!env.supabaseUrl || !env.supabasePublishableKey) {
        throw new Error('Supabase の接続設定がありません')
      }
      const res = await fetch(`${env.supabaseUrl}/functions/v1/push-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.supabasePublishableKey,
        },
        body: JSON.stringify({ subscription: subscription.toJSON(), delaySec: 10 }),
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status} ${text}`)
      add('○ 送信を依頼しました。10秒以内にアプリを閉じて、通知が届くか確認してください')
    })

  const ios = parseIosVersion(navigator.userAgent)

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-xl font-bold">通知テスト</h1>

      <section className="rounded-lg bg-white p-3 text-sm shadow-sm">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
          <dt className="text-slate-500">iOS</dt>
          <dd>{ios === null ? 'iOS 以外' : ios.toFixed(1)}</dd>
          <dt className="text-slate-500">通知の許可</dt>
          <dd>{permissionLabel[permission]}</dd>
          <dt className="text-slate-500">判定</dt>
          <dd>{support.ok ? '通知を使えます' : pushSupportMessage[support.reason]}</dd>
          {missingEnv.length > 0 && (
            <>
              <dt className="text-slate-500">未設定</dt>
              <dd className="text-red-600">{missingEnv.join(', ')}</dd>
            </>
          )}
        </dl>
      </section>

      <div className="grid gap-2">
        <button
          type="button"
          disabled={busy || !support.ok}
          onClick={onSubscribe}
          className="rounded-lg bg-sky-700 px-4 py-3 text-white disabled:opacity-40"
        >
          1. 通知を許可して購読
        </button>
        <button
          type="button"
          disabled={busy || permission !== 'granted'}
          onClick={onLocal}
          className="rounded-lg bg-sky-700 px-4 py-3 text-white disabled:opacity-40"
        >
          2. 端末内でテスト表示
        </button>
        <button
          type="button"
          disabled={busy || !subscription}
          onClick={onServer}
          className="rounded-lg bg-sky-700 px-4 py-3 text-white disabled:opacity-40"
        >
          3. サーバーから送信（10秒後）
        </button>
      </div>

      <ul className="space-y-1 text-sm">
        {log.map((line, i) => (
          <li key={i} className="rounded bg-white px-2 py-1 shadow-sm">
            {line}
          </li>
        ))}
      </ul>
    </main>
  )
}
