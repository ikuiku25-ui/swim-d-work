import { expect, test } from '@playwright/test'
import { functionsUrl, login, newLoggedInPage, requestCode, resetDb } from './helpers'

test.beforeAll(resetDb)

test('コーチは停止中の選手だけを、名前を入力して削除できる', async ({ page, browser }) => {
  await login(page, 'coach@example.com')
  await page.getByRole('link', { name: '選手管理' }).click()
  await expect(page.getByRole('heading', { name: '選手管理' })).toBeVisible()
  const rowA = page.locator('li', { hasText: '選手A' })

  // 利用中の選手には削除ボタンがない
  await expect(rowA.getByRole('button', { name: '削除する' })).toHaveCount(0)

  // 停止すると削除ボタンが出る
  page.once('dialog', (d) => d.accept())
  await rowA.getByRole('button', { name: '停止' }).click()
  await expect(rowA.getByText('停止中')).toBeVisible()
  await rowA.getByRole('button', { name: '削除する' }).click()

  // 名前を正しく入れるまで削除できない
  const dialog = page.getByRole('dialog', { name: '選手の削除' })
  await expect(dialog.getByText('元に戻せません。')).toBeVisible()
  const confirm = dialog.getByRole('button', { name: '削除する' })
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('textbox').fill('選手')
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('textbox').fill('選手A')
  await confirm.click()
  await expect(page.locator('li', { hasText: '選手A' })).toHaveCount(0)
  await expect(page.getByText('選手一覧（利用中・招待中 1/5人）')).toBeVisible()

  // カレンダーからも選手Aの予定が消える
  await page.getByRole('link', { name: 'カレンダー', exact: true }).click()
  await expect(page.locator('ol span.font-bold', { hasText: '選手A' })).toHaveCount(0)
  await expect(page.locator('ol span.font-bold', { hasText: '選手B' }).first()).toBeVisible()

  // 削除された選手はログインできない
  const a = await (await browser.newContext()).newPage()
  const r = await requestCode(a, 'athlete-a@example.com')
  expect(r.error).toContain('登録されていないメールアドレスです')

  // 選手Bは今までどおり使える
  await newLoggedInPage(browser, 'athlete-b@example.com')
})

test('利用中の選手は削除できず、選手は削除の処理を使えない（画面を通さない場合も）', async ({ page, browser }) => {
  resetDb()
  const call = (p: typeof page, athleteId: string) =>
    p.evaluate(
      async ({ url, athleteId }) => {
        const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))!
        const token = JSON.parse(localStorage.getItem(key)!).access_token
        const r = await fetch(`${url}/delete-athlete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ athlete_id: athleteId }),
        })
        return { status: r.status, body: await r.json() }
      },
      { url: functionsUrl(), athleteId },
    )
  const athleteB = '00000000-0000-0000-0000-0000000000a2'
  await login(page, 'coach@example.com')
  const active = await call(page, athleteB)
  expect(active.status).toBe(409)
  expect(active.body.error).toBe('削除する前に、選手を停止してください')

  const a = await newLoggedInPage(browser, 'athlete-a@example.com')
  expect((await call(a, athleteB)).status).toBe(403)
})
