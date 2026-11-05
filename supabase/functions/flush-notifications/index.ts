// 送信待ちのコーチ宛て通知を送る。選手のアプリが予定を保存した直後に呼ぶ（毎晩22時にも nightly-check が呼ぶ）。
// 送る内容は DB のトリガーが決めたものだけなので、ログイン中の利用者なら誰が呼んでもよい。
import { adminClient, requireActiveUser } from '../_shared/auth.ts'
import { json } from '../_shared/cors.ts'
import { postHandler } from '../_shared/handler.ts'
import { flushPending } from '../_shared/push.ts'

Deno.serve(
  postHandler(async (req) => {
    const admin = adminClient()
    await requireActiveUser(req, admin)
    return json(await flushPending(admin))
  }),
)
