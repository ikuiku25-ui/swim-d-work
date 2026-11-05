type Env = {
  SUPABASE_URL: string
  CRON_SECRET: string
}

async function callNightlyCheck(env: Env): Promise<Response> {
  // 末尾に /rest/v1/ などが付いていても動くよう、https://xxxx.supabase.co の部分だけを使う
  const base = new URL(env.SUPABASE_URL.trim()).origin
  return fetch(`${base}/functions/v1/nightly-check`, {
    method: 'POST',
    headers: { 'x-cron-secret': env.CRON_SECRET },
  })
}

export default {
  // 定期実行の本体
  async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(
      (async () => {
        const res = await callNightlyCheck(env)
        const text = await res.text()
        if (!res.ok) throw new Error(`nightly-check failed: ${res.status} ${text}`)
        console.log('nightly-check ok', text)
      })(),
    )
  },

  // 動作確認用：外部から呼べると困るので、通常のアクセスには何もしない
  async fetch(): Promise<Response> {
    return new Response('SWIM D-work nightly cron', { status: 200 })
  },
}
