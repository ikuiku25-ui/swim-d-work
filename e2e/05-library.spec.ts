import { expect, test } from '@playwright/test'
import { apiAs, login, newLoggedInPage, resetDb } from './helpers'

test.beforeAll(resetDb)

test('参考メニュー帳 → テンプレート → メニューに入れる。選手には見えない', async ({ page, browser }) => {
  await login(page, 'coach@example.com')
  await page.getByRole('link', { name: '参考メニュー' }).click()
  await expect(page.getByText('肩甲骨まわりの安定化サーキット')).toBeVisible()
  await page.getByRole('button', { name: '#試合前' }).click()
  await expect(page.locator('ul > li')).toHaveCount(1)
  await page.getByRole('button', { name: '絞り込みを解除' }).click()

  // メモの作成（URL の検証）
  await page.getByRole('link', { name: '＋ メモする' }).click()
  await page.getByLabel('タイトル').fill('下半身のプライオ入門')
  await page.getByLabel('出典URL').fill('example.com/plyo')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('alert')).toHaveText('URL は http:// か https:// で始まるものを入力してください')
  await page.getByLabel('出典URL').fill('https://example.com/plyo')
  await page.getByLabel(/^メモ/).fill('ジャンプは着地を静かに。')
  await page.getByLabel('タグ（「、」や空白で区切る）').fill('下半身、オフ期 ジャンプ')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.locator('section a[target=_blank]')).toHaveAttribute('rel', 'noopener noreferrer')

  // メモからテンプレート
  await page.getByRole('link', { name: 'このメモからテンプレートを作る' }).click()
  await expect(page.getByLabel('テンプレート名')).toHaveValue('下半身のプライオ入門')
  await page.getByRole('button', { name: '＋ 単独ブロック' }).click()
  await page.getByLabel('種目名').first().fill('スクワットジャンプ')
  await page.getByRole('button', { name: 'テンプレートを保存' }).click()
  await expect(page).toHaveURL(/\/coach\/templates\/[0-9a-f-]{36}$/)

  // メニュー作成画面で呼び出す（入れる → 末尾に追加）
  await page.getByRole('link', { name: 'カレンダー', exact: true }).click()
  await page.locator('a', { hasText: '選手A' }).filter({ hasText: '16:00 ドライランド' }).first().click()
  for (const mode of ['これを入れる', '末尾に追加']) {
    await page.getByRole('button', { name: 'テンプレートから入れる' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /体幹サーキット（基本）/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: mode }).click()
  }
  await expect(page.locator('ol > li span.font-bold')).toHaveText(['1. サーキット', '2. サーキット'])
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('メニューを保存しました')

  // このメニューをテンプレートに保存
  page.once('dialog', (d) => d.accept('体幹ダブル'))
  await page.getByRole('button', { name: 'このメニューをテンプレートに保存' }).click()
  await expect(page.getByText('テンプレート「体幹ダブル」として保存しました。')).toBeVisible()

  // 選手からは見えず、書き込めない
  const a = await newLoggedInPage(browser, 'athlete-a@example.com')
  expect((await apiAs(a, '/rest/v1/templates?select=title')).json).toEqual([])
  expect((await apiAs(a, '/rest/v1/reference_notes?select=title')).json).toEqual([])
  expect((await apiAs(a, '/rest/v1/reference_notes', { method: 'POST', body: { title: 'x' } })).status).toBe(403)
  await a.goto('/coach/templates')
  await expect(a).toHaveURL(/\/$/)
})
