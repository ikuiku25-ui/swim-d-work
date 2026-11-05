/**
 * Supabase の URL は `https://xxxx.supabase.co` の形だけを使う。
 * 管理画面からコピーすると末尾に `/rest/v1/` などが付くことがあるため、ここで取り除く。
 */
export function toOrigin(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url.trim()).origin
  } catch {
    return undefined
  }
}

/** ビルド時に埋め込む公開設定（秘密情報は置かない） */
export const env = {
  supabaseUrl: toOrigin(import.meta.env.VITE_SUPABASE_URL as string | undefined),
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined,
}

export const missingEnv = Object.entries(env)
  .filter(([, v]) => !v)
  .map(([k]) => k)
