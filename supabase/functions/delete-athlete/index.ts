// コーチが選手を削除する。取り消しはできない。
// 間違えて消さないよう、停止中の選手だけを削除できる（停止 → 削除の2段階）。
// Auth のユーザーを消すと、profiles から予定・メニュー・実施記録・購読・通知まで、外部キーの連鎖でまとめて消える。
import { adminClient, HttpError, requireCoach } from '../_shared/auth.ts'
import { json } from '../_shared/cors.ts'
import { postHandler } from '../_shared/handler.ts'
import { parseAthleteId } from '../_shared/validate.ts'

Deno.serve(
  postHandler(async (req, body) => {
    const admin = adminClient()
    await requireCoach(req, admin)

    const input = parseAthleteId(body)
    if (!input.ok) throw new HttpError(400, input.error)

    const { data: target, error: tErr } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', input.athleteId)
      .maybeSingle()
    if (tErr) throw new HttpError(500, '選手を確認できませんでした')
    if (!target || target.role !== 'athlete') throw new HttpError(404, '選手が見つかりません')
    if (target.is_active) throw new HttpError(409, '削除する前に、選手を停止してください')

    const { error } = await admin.auth.admin.deleteUser(input.athleteId)
    if (error) {
      console.error('delete user failed', error.status, error.code)
      throw new HttpError(502, '選手を削除できませんでした')
    }
    return json({ ok: true })
  }),
)
