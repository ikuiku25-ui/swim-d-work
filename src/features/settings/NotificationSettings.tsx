import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { pushSupportMessage } from '../../lib/platform'
import { disablePush, enablePush, getPushStatus, sendSelfTest } from '../../lib/push'

// oxlint-disable-next-line react/only-export-components
export function usePushStatus() {
  return useQuery({ queryKey: ['push-status'], queryFn: getPushStatus, staleTime: 0 })
}

/** 通知の設定（設定画面と初回の案内で使う） */
export function NotificationSettings({ compact = false }: { compact?: boolean }) {
  const status = usePushStatus()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    setMessage(null)
    try {
      setMessage({ ok: true, text: await fn() })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : '失敗しました。' })
    } finally {
      setBusy(false)
      qc.invalidateQueries({ queryKey: ['push-status'] })
    }
  }

  if (status.isPending) return <p className="text-sm text-slate-500">確認中…</p>
  const s = status.data!

  if (!s.support.ok) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium text-amber-800">{pushSupportMessage[s.support.reason]}</p>
        {s.support.reason === 'not-standalone' && (
          <ol className="list-decimal space-y-1 pl-5 text-slate-700">
            <li>Safari の下にある共有ボタン（□に↑）を押す</li>
            <li>「ホーム画面に追加」→「追加」</li>
            <li>ホーム画面の「D-work」から開き直し、この画面で「通知を有効にする」を押す</li>
          </ol>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {s.subscribed ? (
        <p className="text-sm font-medium text-emerald-700">✓ この端末で通知を受け取ります</p>
      ) : s.permission === 'denied' ? (
        <p className="text-sm text-amber-800">
          通知が拒否されています。iPhone の「設定」→「通知」→「D-work」で「通知を許可」をオンにしてから、もう一度押してください。
        </p>
      ) : (
        !compact && <p className="text-sm text-slate-600">メニューが入ったときなどに、この端末へ通知が届くようにします。</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!s.subscribed && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await enablePush()
                return '通知を有効にしました。'
              })
            }
            className="rounded-lg bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-40"
          >
            通知を有効にする
          </button>
        )}
        {s.subscribed && !compact && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const n = await sendSelfTest()
                  return n > 0 ? 'テスト通知を送りました。数秒で届きます。' : '登録された端末がありません。「通知を有効にする」を押し直してください。'
                })
              }
              className="rounded-lg bg-white px-4 py-2 text-sky-700 ring-1 ring-sky-300 disabled:opacity-40"
            >
              テスト通知を送る
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await disablePush()
                  return 'この端末の通知をやめました。'
                })
              }
              className="rounded-lg bg-white px-4 py-2 text-slate-600 ring-1 ring-slate-300 disabled:opacity-40"
            >
              この端末の通知をやめる
            </button>
          </>
        )}
      </div>
      {message && <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</p>}
    </div>
  )
}
