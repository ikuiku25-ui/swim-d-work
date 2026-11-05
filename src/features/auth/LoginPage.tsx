import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { authErrorMessage, normalizeOtp } from './authErrors'

/**
 * メールアドレスに届くコードでログインする。
 * iPhone ではメールのリンクが Safari で開き、ホーム画面のアプリにはログイン状態が渡らないため、
 * アプリ内でコードを入力する方式にしている。
 */
export function LoginPage() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    })
    setBusy(false)
    if (error) {
      setError(authErrorMessage(error))
      return
    }
    setStep('code')
    setCode('')
    setNotice(`${email.trim()} にログイン用のコードを送りました。`)
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    const token = normalizeOtp(code)
    if (token.length < 6) {
      setError('メールに書かれた数字のコードを入力してください。')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    })
    setBusy(false)
    if (error) setError(authErrorMessage(error))
    // 成功するとセッションが変わり、App がホームに切り替える
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <img src="/pwa-192x192.png" alt="" className="mx-auto size-16 rounded-2xl" />
        <h1 className="mt-3 text-2xl font-bold text-sky-900">SWIM D-work</h1>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-3">
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
            placeholder="you@example.com"
          />
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="w-full rounded-lg bg-sky-700 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {busy ? '送信中…' : 'ログイン用のコードを送る'}
          </button>
          <p className="text-xs text-slate-500">
            コーチに招待されたメールアドレスを入力してください。パスワードは不要です。
          </p>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          {notice && <p className="text-sm text-slate-700">{notice}</p>}
          <label className="block text-sm font-medium text-slate-700" htmlFor="code">
            メールに書かれたコード
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-center text-2xl tracking-[0.4em]"
            placeholder="123456"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-sky-700 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {busy ? '確認中…' : 'ログイン'}
          </button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-sky-700" onClick={() => setStep('email')}>
              メールアドレスを変える
            </button>
            <button type="button" className="text-sky-700" disabled={busy} onClick={() => sendCode()}>
              コードを再送する
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </main>
  )
}
