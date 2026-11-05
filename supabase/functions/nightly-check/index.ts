// 毎晩22:00（JST）に Cloudflare Worker から呼ばれる。
// フェーズ0では疎通確認と Supabase の一時停止対策（毎日のアクセス）だけを行う。
// フェーズ6で「翌日のドライランド枠のメニュー未設定チェック」を実装する。
import { createClient } from 'npm:@supabase/supabase-js@2'
import { json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  // データベースに1回アクセスする（一時停止対策）
  const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
  if (error) return json({ ok: false, error: error.message }, 500)

  const nowJst = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  return json({ ok: true, checkedAt: nowJst })
})
