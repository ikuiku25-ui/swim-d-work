// コーチの「保存して選手に通知」：選んだ枠のメニューを、選手ごとに1通にまとめて知らせる
import { adminClient, HttpError, requireCoach } from '../_shared/auth.ts'
import { json } from '../_shared/cors.ts'
import { postHandler } from '../_shared/handler.ts'
import { athleteMenuMessage } from '../_shared/messages.ts'
import { sendToUser } from '../_shared/push.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(
  postHandler(async (req, body) => {
    const admin = adminClient()
    await requireCoach(req, admin)

    const ids = body.event_ids
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !ids.every((x) => typeof x === 'string' && UUID.test(x))) {
      throw new HttpError(400, 'event_ids が不正です')
    }

    const { data, error } = await admin
      .from('events')
      .select('id, athlete_id, date, status, menu:menus(event_id, notified_at), athlete:profiles(display_name, is_active)')
      .in('id', ids)
    if (error) throw new HttpError(500, '予定を読めませんでした')

    type Row = {
      id: string
      athlete_id: string
      date: string
      status: string
      menu: { event_id: string; notified_at: string | null } | null
      athlete: { display_name: string; is_active: boolean } | null
    }
    const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.menu && r.status === 'normal' && r.athlete?.is_active)

    const byAthlete = new Map<string, Row[]>()
    for (const r of rows) byAthlete.set(r.athlete_id, [...(byAthlete.get(r.athlete_id) ?? []), r])

    const results: { name: string; delivered: number }[] = []
    for (const [athleteId, list] of byAthlete) {
      const message = athleteMenuMessage(list.map((r) => ({ date: r.date, first: !r.menu!.notified_at })))
      const delivered = await sendToUser(admin, athleteId, message)
      results.push({ name: list[0].athlete!.display_name, delivered })
      // 端末に届かなかった選手も「知らせた」扱いにする（アプリを開けばメニューは見える）
      await admin.from('menus').update({ notified_at: new Date().toISOString() }).in('event_id', list.map((r) => r.id))
    }
    return json({ athletes: results })
  }),
)
