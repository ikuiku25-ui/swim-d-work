import { expect, test } from '@playwright/test'
import { apiAs, functionsUrl, latestCode, login, newLoggedInPage, requestCode, resetDb } from './helpers'

test.beforeAll(resetDb)

test('コーチが選手を招待・停止・再開し、選手はコードでログインできる', async ({ page, browser }) => {
  await login(page, 'coach@example.com')
  await expect(page).toHaveURL(/\/coach$/)
  await page.getByRole('link', { name: '選手管理' }).click()
  await expect(page.getByRole('heading', { name: '選手管理' })).toBeVisible()
  await expect(page.locator('li').getByText('選手A', { exact: true })).toBeVisible()

  // 招待するとログインコードのメールが届く
  await page.getByLabel('名前（アプリ内の表示名）').fill('選手C')
  await page.getByLabel('メールアドレス').fill('athlete-c@example.com')
  const invitedAt = new Date(Date.now() - 1000)
  await page.getByRole('button', { name: '招待メールを送る' }).click()
  await expect(page.getByRole('status')).toContainText('選手C さんを登録し、ログイン用のメールを送りました')
  await latestCode('athlete-c@example.com', invitedAt)
  await expect(page.locator('li').getByText('選手C', { exact: true })).toBeVisible()

  // 同じアドレスは二重に招待できない
  await page.getByLabel('名前（アプリ内の表示名）').fill('選手C2')
  await page.getByLabel('メールアドレス').fill('athlete-c@example.com')
  await page.getByRole('button', { name: '招待メールを送る' }).click()
  await expect(page.getByRole('status')).toHaveText('このメールアドレスはすでに登録されています')

  // 選手Bを停止
  page.once('dialog', (d) => d.accept())
  const rowB = page.locator('li', { hasText: '選手B' })
  await rowB.getByRole('button', { name: '停止' }).click()
  await expect(rowB.getByText('停止中')).toBeVisible()

  // 招待された選手Cはログインでき、コーチの画面は開けない
  const c = await newLoggedInPage(browser, 'athlete-c@example.com')
  await expect(c).toHaveURL(/\/$/)
  await c.goto('/coach/athletes')
  await expect(c).toHaveURL(/\/$/)
  // API を直接使っても、他人の情報は読めず、招待もできない
  const profiles = await apiAs(c, '/rest/v1/profiles?select=display_name')
  expect(profiles.json).toEqual([{ display_name: '選手C' }])
  expect((await apiAs(c, '/rest/v1/rpc/list_athletes', { method: 'POST', body: {} })).status).toBe(403)
  const invite = await c.evaluate(async (url: string) => {
    const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))!
    const token = JSON.parse(localStorage.getItem(key)!).access_token
    const r = await fetch(`${url}/invite-athlete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'x', email: 'x@example.com' }),
    })
    return r.status
  }, functionsUrl())
  expect(invite).toBe(403)

  // 停止中の選手Bはログインできない
  const b = await (await browser.newContext()).newPage()
  const rb = await requestCode(b, 'athlete-b@example.com')
  await b.getByLabel('メールに書かれたコード').fill(await latestCode('athlete-b@example.com', rb.at))
  await b.getByRole('button', { name: 'ログイン' }).click()
  await expect(b.getByRole('alert')).toContainText('停止されています')

  // 停止を解除すればログインできる
  page.once('dialog', (d) => d.accept())
  await rowB.getByRole('button', { name: '停止を解除' }).click()
  await expect(rowB.getByText(/利用中|招待中/)).toBeVisible()
  await newLoggedInPage(browser, 'athlete-b@example.com')
})

test('登録されていないメールアドレスではログインできない', async ({ page }) => {
  const r = await requestCode(page, 'nobody@example.com')
  expect(r.error).toContain('登録されていないメールアドレスです')
})
