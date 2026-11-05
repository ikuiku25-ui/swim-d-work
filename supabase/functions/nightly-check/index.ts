// 毎晩22:00（JST）に Cloudflare Worker から呼ばれる。
// 1. 送信待ちのコーチ宛て通知の残りを送る
// 2. 翌日のドライランド枠でメニュー未設定のものがあれば、コーチに1通まとめて送る（なければ送らない）
// この毎日の呼び出しが、Supabase Free の一時停止対策も兼ねる。
import { adminClient } from '../_shared/auth.ts'
import { json } from '../_shared/cors.ts'
import { nightlyMessage, todayJst } from '../_shared/messages.ts'
import { flushPending, sendToUser } from '../_shared/push.ts'

function addDays(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401)
  }

  const admin = adminClient()
  const flushed = await flushPending(admin)

  const tomorrow = addDays(todayJst(), 1)
  const { data, error } = await admin
    .from('events')
    .select('start_time, place, duration_min, menu:menus(event_id), athlete:profiles!inner(display_name, is_active)')
    .eq('kind', 'dryland')
    .eq('status', 'normal')
    .eq('date', tomorrow)
    .eq('athlete.is_active', true)
    .order('start_time')
  if (error) return json({ ok: false, error: error.message }, 500)

  type Row = {
    start_time: string
    place: string
    duration_min: number
    menu: { event_id: string } | null
    athlete: { display_name: string }
  }
  const unset = ((data ?? []) as unknown as Row[]).filter((r) => !r.menu)

  let nightly: { unset: number; delivered?: number } = { unset: unset.length }
  if (unset.length > 0) {
    const { data: coach } = await admin.from('profiles').select('id').eq('role', 'coach').eq('is_active', true).maybeSingle()
    if (coach) {
      const delivered = await sendToUser(
        admin,
        coach.id,
        nightlyMessage(
          unset.map((r) => ({
            athlete_name: r.athlete.display_name,
            start_time: r.start_time.slice(0, 5),
            place: r.place,
            duration_min: r.duration_min,
          })),
        ),
      )
      nightly = { ...nightly, delivered }
    }
  }
  return json({ ok: true, tomorrow, flushed, nightly })
})
