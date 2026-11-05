/** ビルド時に埋め込む公開設定（秘密情報は置かない） */
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined,
}

export const missingEnv = Object.entries(env)
  .filter(([, v]) => !v)
  .map(([k]) => k)
