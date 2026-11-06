import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { callFunction } from '../../lib/supabase'
import type { AthleteListItem } from '../../lib/types'
import { athleteStatus, athleteStatusLabel } from './athleteStatus'
import { useAthletes } from './useAthletes'

const MAX_ATHLETES = 5


export function AthletesPage() {
  const athletes = useAthletes()
  const activeCount = athletes.data?.filter((a) => a.is_active).length ?? 0

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">選手管理</h1>
      <InviteForm disabled={activeCount >= MAX_ATHLETES} />

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-600">
          選手一覧（利用中・招待中 {activeCount}/{MAX_ATHLETES}人）
        </h2>
        {athletes.isPending && <p className="text-sm text-slate-500">読み込み中…</p>}
        {athletes.isError && <p className="text-sm text-red-600">一覧を読み込めませんでした。</p>}
        {athletes.data?.length === 0 && (
          <p className="text-sm text-slate-500">まだ選手がいません。上のフォームから招待してください。</p>
        )}
        <ul className="space-y-2">
          {athletes.data?.map((a) => <AthleteRow key={a.id} athlete={a} />)}
        </ul>
      </section>
    </div>
  )
}

function InviteForm({ disabled }: { disabled: boolean }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const invite = useMutation({
    mutationFn: () =>
      callFunction<{ id: string; mailSent: boolean; warning?: string }>('invite-athlete', {
        display_name: name,
        email,
      }),
    onSuccess: (res) => {
      setMessage(
        res.mailSent
          ? { ok: true, text: `${name} さんを登録し、ログイン用のメールを送りました。` }
          : { ok: false, text: res.warning ?? 'メールを送れませんでした。' },
      )
      setName('')
      setEmail('')
      queryClient.invalidateQueries({ queryKey: ['athletes'] })
    },
    onError: (e) => setMessage({ ok: false, text: (e as Error).message }),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)
    invite.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
      <h2 className="font-bold">選手を招待する</h2>
      {disabled && (
        <p className="text-sm text-amber-700">
          選手は{MAX_ATHLETES}人までです。新しく招待するには、誰かを停止してください。
        </p>
      )}
      <div>
        <label htmlFor="invite-name" className="block text-sm text-slate-600">
          名前（アプリ内の表示名）
        </label>
        <input
          id="invite-name"
          required
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
          placeholder="例：山田"
        />
      </div>
      <div>
        <label htmlFor="invite-email" className="block text-sm text-slate-600">
          メールアドレス
        </label>
        <input
          id="invite-email"
          type="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
          placeholder="athlete@example.com"
        />
      </div>
      <button
        type="submit"
        disabled={disabled || invite.isPending}
        className="w-full rounded-lg bg-sky-700 px-4 py-3 font-medium text-white disabled:opacity-40"
      >
        {invite.isPending ? '送信中…' : '招待メールを送る'}
      </button>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>
          {message.text}
        </p>
      )}
    </form>
  )
}

function AthleteRow({ athlete }: { athlete: AthleteListItem }) {
  const queryClient = useQueryClient()
  const status = athleteStatus(athlete)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const change = useMutation({
    mutationFn: (active: boolean) =>
      callFunction('set-athlete-status', { athlete_id: athlete.id, active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['athletes'] }),
    onError: (e) => setError((e as Error).message),
  })

  const toggle = () => {
    setError(null)
    const next = !athlete.is_active
    const text = next
      ? `${athlete.display_name} さんの停止を解除しますか？\nまたログインできるようになります。`
      : `${athlete.display_name} さんを停止しますか？\nログインできなくなります。これまでの記録は残ります。`
    if (window.confirm(text)) change.mutate(next)
  }

  return (
    <li className="rounded-lg bg-white p-3 shadow-sm">
      <div className={`flex items-center gap-3 ${athlete.is_active ? '' : 'opacity-60'}`}>
        <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: athlete.color }} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{athlete.display_name}</p>
          <p className="truncate text-xs text-slate-500">{athlete.email}</p>
          <p className="text-xs text-slate-600">{athleteStatusLabel[status]}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={change.isPending}
          className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${
            athlete.is_active ? 'border-red-300 text-red-700' : 'border-sky-300 text-sky-700'
          } disabled:opacity-40`}
        >
          {athlete.is_active ? '停止' : '停止を解除'}
        </button>
      </div>
      {!athlete.is_active && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setError(null)
              setDeleting(true)
            }}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white"
          >
            削除する
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {deleting && <DeleteDialog athlete={athlete} onClose={() => setDeleting(false)} />}
    </li>
  )
}

/** 選手の削除：取り消せないので、名前を入力して確認してもらう */
function DeleteDialog({ athlete, onClose }: { athlete: AthleteListItem; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const remove = useMutation({
    mutationFn: () => callFunction('delete-athlete', { athlete_id: athlete.id }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['athletes'] }),
        queryClient.invalidateQueries({ queryKey: ['events'], refetchType: 'all' }),
      ]),
    onError: (e) => setError((e as Error).message),
  })
  const matches = typed.trim() === athlete.display_name

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="選手の削除">
      <div className="mx-auto w-full max-w-md space-y-3 rounded-xl bg-white p-4">
        <h2 className="font-bold text-red-700">{athlete.display_name} さんを削除しますか？</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>アカウントと、これまでの予定・メニュー・実施記録が<b>すべて消えます</b></li>
          <li><b>元に戻せません。</b>記録を残したいときは、削除せず「停止」のままにしてください</li>
          <li>テンプレートと参考メニュー帳は残ります</li>
        </ul>
        <label className="block text-sm text-slate-600">
          確認のため、選手の名前「{athlete.display_name}」を入力してください
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg px-4 py-3 text-slate-700 ring-1 ring-slate-300">
            やめる
          </button>
          <button
            type="button"
            disabled={!matches || remove.isPending}
            onClick={() => remove.mutate()}
            className="flex-1 rounded-lg bg-red-600 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {remove.isPending ? '削除中…' : '削除する'}
          </button>
        </div>
      </div>
    </div>
  )
}
