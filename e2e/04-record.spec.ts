import { expect, test } from '@playwright/test'
import { apiAs, login, newLoggedInPage, resetDb } from './helpers'

test.beforeAll(resetDb)

test('選手の実施記録と、コーチの確認画面', async ({ page, browser }) => {
  await login(page, 'athlete-a@example.com')
  await page.locator('a', { hasText: '07:00 ドライランド' }).click()
  await page.getByRole('link', { name: 'メニューを実施する（記録）' }).click()

  await page.getByLabel('ジョグをやった').check()
  await page.getByLabel('スクワットをやった').check()
  await page.getByLabel('スクワットの実績（回）').fill('12')
  await page.getByLabel('懸垂をやった').check()
  await page.getByLabel('懸垂の負荷').fill('ゴムバンド補助')
  await page.getByLabel('実施周回数').fill('2')
  await page.getByRole('button', { name: '＋ 種目を追加' }).click()
  await page.getByLabel('追加分1の種目名').fill('腹筋')
  await page.getByLabel('追加分1の回数・秒数').fill('20')
  await expect(page.locator('[aria-live]')).toContainText('保存しました')
  await expect(page.locator('[aria-live]')).toContainText('チェック 3/5')

  // 開き直しても残っている
  await page.getByRole('link', { name: '← カレンダー' }).click()
  await expect(page.locator('a', { hasText: '07:00 ドライランド' })).toContainText('実施中')
  await page.locator('a', { hasText: '07:00 ドライランド' }).click()
  await page.getByRole('link', { name: '記録の続きを入れる' }).click()
  await expect(page.getByLabel('スクワットの実績（回）')).toHaveValue('12')
  await expect(page.getByLabel('スクワットをやった')).toBeChecked()
  await expect(page.getByLabel('追加分1の種目名')).toHaveValue('腹筋')

  await page.getByRole('button', { name: '完了（実施済みにする）' }).click()
  await expect(page.getByText('✓ 実施済みにしました')).toBeVisible()
  await page.getByRole('link', { name: '← カレンダー' }).click()
  await expect(page.locator('a', { hasText: '07:00 ドライランド' })).toContainText('実施済み')

  // コーチ：差分・未チェック・追加分が見え、メニューは変更できない
  const c = await newLoggedInPage(browser, 'coach@example.com')
  const row = c.locator('a', { hasText: '07:00 ドライランド' })
  await expect(row).toContainText('実施済み')
  await row.click()
  await expect(c.getByText('実施結果')).toBeVisible()
  await expect(c.getByText('チェック 3/5')).toBeVisible()
  await expect(c.getByText('未チェック 2')).toBeVisible()
  await expect(c.getByText('周回数：計画 3周 → 実績 2周')).toBeVisible()
  await expect(c.getByText('計画 15回 → 実績 12回')).toBeVisible()
  await expect(c.getByText('負荷 自重 → ゴムバンド補助')).toBeVisible()
  await expect(c.getByText('＋ 腹筋 20回')).toBeVisible()
  await expect(c.getByRole('button', { name: '＋ サーキット' })).toHaveCount(0)
  const id = new URL(c.url()).pathname.split('/').pop()
  const patch = await apiAs(c, `/rest/v1/menus?event_id=eq.${id}`, { method: 'PATCH', body: { blocks: [] } })
  expect(patch.json.message).toBe('選手が記録を始めたため、このメニューは変更できません')
})
