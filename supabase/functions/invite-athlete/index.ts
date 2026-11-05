// コーチが選手を招待する。
//
// 1. Auth にユーザーを作る（メール確認済みとして作成。コーチが入力したアドレスなので確認リンクは省く）
//    → トリガーで profiles（選手）が作られる
// 2. そのアドレスにログインコードのメールを送る（本文に初回の手順も書いてある）
//
// Supabase の招待メール（inviteUserByEmail）を使わないのは、リンクを押すまでメール未確認のままになり、
// アプリ内のコード入力でログインできないため。
import { createClient } from 'npm:@supabase/supabase-js@2'
import { adminClient, HttpError, requireCoach } from '../_shared/auth.ts'
import { json } from '../_shared/cors.ts'
import { postHandler } from '../_shared/handler.ts'
import { parseInvite } from '../_shared/validate.ts'

const MAX_ATHLETES = 5

Deno.serve(
  postHandler(async (req, body) => {
    const admin = adminClient()
    await requireCoach(req, admin)

    const input = parseInvite(body)
    if (!input.ok) throw new HttpError(400, input.error)

    const { data: existing, error: eErr } = await admin
      .from('profiles')
      .select('id')
      .eq('email', input.email)
      .maybeSingle()
    if (eErr) throw new HttpError(500, '登録状況を確認できませんでした')
    if (existing) throw new HttpError(409, 'このメールアドレスはすでに登録されています')

    // 選手は5人まで（停止中は数えない）
    const { count, error: cErr } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'athlete')
      .eq('is_active', true)
    if (cErr) throw new HttpError(500, '選手の人数を確認できませんでした')
    if ((count ?? 0) >= MAX_ATHLETES) {
      throw new HttpError(409, `選手は${MAX_ATHLETES}人までです。新しく招待するには、誰かを停止してください`)
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      email_confirm: true,
      user_metadata: { display_name: input.displayName },
    })
    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        throw new HttpError(409, 'このメールアドレスはすでに登録されています')
      }
      console.error('create user failed', error.status, error.code)
      throw new HttpError(502, '選手を登録できませんでした')
    }

    // ログインコードのメールを送る（利用者と同じ経路。メール文面は Auth の Magic Link テンプレート）
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: otpErr } = await anon.auth.signInWithOtp({
      email: input.email,
      options: { shouldCreateUser: false },
    })
    if (otpErr) {
      console.error('send code failed', otpErr.status, otpErr.code)
      return json({
        id: data.user.id,
        mailSent: false,
        warning:
          '選手は登録しましたが、メールを送れませんでした。選手にアプリのログイン画面からコードを送ってもらってください',
      })
    }
    return json({ id: data.user.id, mailSent: true })
  }),
)
