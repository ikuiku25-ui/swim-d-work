import { expect, test } from '@playwright/test'
import { login, resetDb } from './helpers'

test.beforeAll(resetDb)

test('コーチ：保存だけなら「未通知」、通知ボタンで通知済みになる', async ({ page }) => {
  await login(page, 'coach@example.com')
  await expect(page.getByText('通知を受け取る準備をしましょう')).toBeVisible()
  const row = page.locator('a', { hasText: '選手A' }).filter({ hasText: '16:00 ドライランド' }).first()
  await row.click()
  await page.getByRole('button', { name: '＋ 単独ブロック' }).click()
  await page.getByLabel('種目名').last().fill('懸垂')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('選手にはまだ通知していません')
  await page.getByRole('link', { name: '← カレンダー' }).click()
  await expect(row).toContainText('未通知')

  await row.click()
  await page.getByRole('button', { name: '保存済み・選手に通知する' }).click()
  // テスト環境の選手は端末を登録していないので「届いていません」と表示される
  await expect(page.getByRole('status')).toContainText('選手Aさんは通知の設定がまだのため')
  await expect(page.getByText('保存済み・選手に通知済み')).toBeVisible()
  await page.getByRole('link', { name: '← カレンダー' }).click()
  await expect(row).not.toContainText('未通知')
})

test('設定画面から、カレンダーに戻れる', async ({ page }) => {
  await login(page, 'athlete-a@example.com')
  await page.getByRole('link', { name: '設定', exact: true }).click()
  await expect(page.getByRole('heading', { name: '設定' })).toBeVisible()
  await page.getByRole('link', { name: '← カレンダー' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('link', { name: '設定', exact: true }).click()
  await page.getByRole('link', { name: 'カレンダーに戻る' }).click()
  await expect(page).toHaveURL(/\/$/)
})
