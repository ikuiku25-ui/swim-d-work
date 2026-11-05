import { corsHeaders, json } from './cors.ts'
import { HttpError } from './auth.ts'

/** CORS・JSON の読み取り・エラー応答をまとめた POST 専用ハンドラー */
export function postHandler(fn: (req: Request, body: Record<string, unknown>) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
    try {
      let body: unknown
      try {
        body = await req.json()
      } catch {
        throw new HttpError(400, 'JSON が不正です')
      }
      if (typeof body !== 'object' || body === null) throw new HttpError(400, 'JSON が不正です')
      return await fn(req, body as Record<string, unknown>)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status)
      // 個人情報を出さないよう、エラーの種類だけを記録する
      console.error('unexpected error', (e as Error)?.name)
      return json({ error: 'サーバーでエラーが起きました' }, 500)
    }
  }
}
