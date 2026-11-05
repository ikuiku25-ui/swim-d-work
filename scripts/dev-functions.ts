// ローカル開発用：Edge Functions をホストの Deno で動かし、1つのポートにまとめる。
// Docker 内の Edge Runtime が使えない環境（Claude Code のクラウド環境など）向け。
//
//   1. npx supabase start
//   2. DENO_CERT=/root/.ccr/ca-bundle.crt npx deno@2 run -A --config supabase/functions/deno.json scripts/dev-functions.ts
//   3. .env.local に VITE_FUNCTIONS_URL=http://127.0.0.1:54329/functions/v1 を書いて npm run dev
//
// 環境変数は supabase/functions/.env と `supabase status` から読む。
const root = new URL('../supabase/functions/', import.meta.url)
const PORT = 54329

async function supabaseStatus(): Promise<Record<string, string>> {
  const out = await new Deno.Command('npx', { args: ['supabase', 'status', '-o', 'env'] }).output()
  const env: Record<string, string> = {}
  for (const line of new TextDecoder().decode(out.stdout).split('\n')) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

function readDotEnv(path: URL): Record<string, string> {
  const env: Record<string, string> = {}
  try {
    for (const line of Deno.readTextFileSync(path).split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2]
    }
  } catch {
    // なければ空
  }
  return env
}

const status = await supabaseStatus()
const baseEnv = {
  ...readDotEnv(new URL('.env', root)),
  SUPABASE_URL: status.API_URL,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  APP_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
}

const names = [...Deno.readDirSync(root)]
  .filter((e) => e.isDirectory && !e.name.startsWith('_'))
  .map((e) => e.name)
  .sort()

const ports = new Map<string, number>()
names.forEach((name, i) => {
  const port = PORT + 1 + i
  ports.set(name, port)
  new Deno.Command(Deno.execPath(), {
    args: ['run', '-A', '--config', new URL('deno.json', root).pathname, new URL(`${name}/index.ts`, root).pathname],
    env: { ...baseEnv, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}` },
    stdout: 'inherit',
    stderr: 'inherit',
  }).spawn()
})

Deno.serve({ port: PORT, hostname: '127.0.0.1' }, async (req) => {
  const url = new URL(req.url)
  const m = url.pathname.match(/^\/functions\/v1\/([^/]+)/)
  const port = m && ports.get(m[1])
  if (!port) return new Response('not found', { status: 404 })
  try {
    return await fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    })
  } catch {
    return new Response('function not ready', { status: 503 })
  }
})
console.log(`Edge Functions: http://127.0.0.1:${PORT}/functions/v1/{${names.join(',')}}`)
