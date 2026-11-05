import { expect, type Browser, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const MAIL = 'http://127.0.0.1:54324/api/v1'
export const API = 'http://127.0.0.1:54321'

/** データベースを seed の状態に戻す（各テストファイルの最初に呼ぶ） */
export function resetDb() {
  execSync('npx supabase db reset', { stdio: 'ignore' })
}

/** 日本時間で今日から n 日後の 'YYYY-MM-DD' */
export function jst(n = 0): string {
  return new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
}

/** '11/10' の形（アプリの表示に合わせる） */
export function md(d: string): string {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
}

/** Mailpit から、指定時刻より後に届いたログインコードを取り出す */
export async function latestCode(email: string, after: Date): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:${email}`)}`)).json()
    const msg = (list.messages ?? []).find((m: { Created: string }) => new Date(m.Created) > after)
    if (msg) {
      const full = await (await fetch(`${MAIL}/message/${msg.ID}`)).json()
      const m = String(full.Text).match(/\b(\d{6})\b/)
      if (m) return m[1]
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`ログインコードのメールが届きません: ${email}`)
}

/** ログイン画面でコードを送り、エラーがあればその文言を返す */
export async function requestCode(page: Page, email: string): Promise<{ error?: string; at: Date }> {
  await page.goto('/')
  await page.getByLabel('メールアドレス').fill(email)
  const at = new Date(Date.now() - 1000)
  await page.getByRole('button', { name: 'ログイン用のコードを送る' }).click()
  const code = page.getByLabel('メールに書かれたコード')
  const alert = page.getByRole('alert')
  await expect(code.or(alert)).toBeVisible()
  if (await alert.isVisible()) return { error: await alert.innerText(), at }
  return { at }
}

/** コードでログインし、ログイン後の画面になるまで待つ */
export async function login(page: Page, email: string): Promise<void> {
  const r = await requestCode(page, email)
  if (r.error) throw new Error(r.error)
  await page.getByLabel('メールに書かれたコード').fill(await latestCode(email, r.at))
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible()
}

export async function newLoggedInPage(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await login(page, email)
  return page
}

/** ブラウザに保存されたアクセストークンで、API を直接呼ぶ（画面で隠すだけでなく DB が拒否するかの確認用） */
export async function apiAs(page: Page, path: string, init: { method?: string; body?: unknown } = {}) {
  return page.evaluate(
    async ({ api, path, init }) => {
      const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))!
      const token = JSON.parse(localStorage.getItem(key)!).access_token
      const r = await fetch(`${api}${path}`, {
        method: init.method ?? 'GET',
        headers: { apikey: token, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      })
      const text = await r.text()
      return { status: r.status, json: text ? JSON.parse(text) : null }
    },
    { api: API, path, init },
  )
}

/** Edge Functions の URL（ローカルで dev-functions を使っているときは .env.local の値） */
export function functionsUrl(): string {
  try {
    const m = readFileSync('.env.local', 'utf8').match(/^VITE_FUNCTIONS_URL=(.*)$/m)
    if (m) return m[1].trim()
  } catch {
    // .env.local がなければ既定
  }
  return `${API}/functions/v1`
}
