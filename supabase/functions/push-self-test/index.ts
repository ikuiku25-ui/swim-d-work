// 設定画面の「テスト通知を送る」：自分の端末にテスト通知を1通送る
import { adminClient, requireActiveUser } from '../_shared/auth.ts'
import { json } from '../_shared/cors.ts'
import { postHandler } from '../_shared/handler.ts'
import { sendToUser } from '../_shared/push.ts'

Deno.serve(
  postHandler(async (req) => {
    const admin = adminClient()
    const user = await requireActiveUser(req, admin)
    const delivered = await sendToUser(admin, user.id, {
      title: 'SWIM D-work',
      body: 'テスト通知です。届いていれば通知の設定は完了です。',
      url: user.role === 'coach' ? '/coach' : '/',
      tag: 'self-test',
    })
    return json({ delivered })
  }),
)
