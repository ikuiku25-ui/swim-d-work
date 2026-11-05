// コーチが選手を停止・再開する。profiles.is_active と、Auth のアカウント凍結（ban）を両方切り替える。
import { adminClient, HttpError, requireCoach } from '../_shared/auth.ts'
import { json } from '../_shared/cors.ts'
import { postHandler } from '../_shared/handler.ts'
import { parseStatusChange } from '../_shared/validate.ts'

// 停止は実質無期限（100年）。再開は 'none' で解除
const BAN_FOREVER = '876000h'

Deno.serve(
  postHandler(async (req, body) => {
    const admin = adminClient()
    await requireCoach(req, admin)

    const input = parseStatusChange(body)
    if (!input.ok) throw new HttpError(400, input.error)

    const { data: target, error: tErr } = await admin
      .from('profiles')
      .select('role')
      .eq('id', input.athleteId)
      .maybeSingle()
    if (tErr) throw new HttpError(500, '選手を確認できませんでした')
    if (!target || target.role !== 'athlete') throw new HttpError(404, '選手が見つかりません')

    const { error: banErr } = await admin.auth.admin.updateUserById(input.athleteId, {
      ban_duration: input.active ? 'none' : BAN_FOREVER,
    })
    if (banErr) throw new HttpError(502, 'アカウントの状態を変更できませんでした')

    const { error: uErr } = await admin
      .from('profiles')
      .update({ is_active: input.active })
      .eq('id', input.athleteId)
    if (uErr) throw new HttpError(500, '選手の状態を保存できませんでした')

    return json({ ok: true, active: input.active })
  }),
)
