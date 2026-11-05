import { createClient } from '@supabase/supabase-js'
import { env, functionsUrl } from './env'

if (!env.supabaseUrl || !env.supabasePublishableKey) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY が未設定です')
}

export const supabase = createClient(
  env.supabaseUrl ?? 'http://127.0.0.1:54321',
  env.supabasePublishableKey ?? 'missing',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)

export class FunctionError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** ログイン中のユーザーとして Edge Function を呼ぶ。エラー時はサーバーの日本語メッセージを投げる */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new FunctionError(401, 'ログインが必要です')
  const res = await fetch(`${functionsUrl}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: env.supabasePublishableKey ?? '',
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new FunctionError(res.status, json.error ?? `エラー（${res.status}）`)
  return json as T
}
