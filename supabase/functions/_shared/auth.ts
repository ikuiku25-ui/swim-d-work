import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** service role のクライアント（RLS を通らない。呼び出し元の確認を済ませてから使う） */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Authorization ヘッダーのトークンを確かめ、有効なコーチでなければ HttpError を投げる。
 */
export async function requireCoach(req: Request, admin: SupabaseClient): Promise<{ id: string }> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'ログインが必要です')

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'ログインが必要です')

  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', data.user.id)
    .maybeSingle()
  if (pErr) throw new HttpError(500, 'プロフィールを確認できませんでした')
  if (!profile || profile.role !== 'coach' || !profile.is_active) {
    throw new HttpError(403, 'コーチのみ利用できます')
  }
  return { id: data.user.id }
}
