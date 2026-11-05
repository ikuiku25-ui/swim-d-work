import { expect, test } from '@playwright/test'
import { apiAs, login, newLoggedInPage, resetDb } from './helpers'

test.beforeAll(resetDb)

test('コーチ：メニュー作成・一括貼り付け、選手の閲覧と「変更あり」', async ({ page, browser }) => {
  await login(page, 'coach@example.com')
  await expect(page.getByText('全員カレンダー')).toBeVisible()
  await expect(page.getByText(/メニュー未設定 \d+件/)).toBeVisible()

  // 選手で絞り込み
  await page.getByRole('button', { name: '選手B' }).click()
  await expect(page.locator('ol span.font-bold', { hasText: '選手A' })).toHaveCount(0)
  await page.getByRole('button', { name: '全員' }).click()

  // 選手Aの今日16:00のドライランドにメニューを作る
  await page.locator('a', { hasText: '選手A' }).filter({ hasText: '16:00 ドライランド' }).first().click()
  await page.getByRole('button', { name: '＋ サーキット' }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('ブロック1：種目名を入力してください')
  const names = page.getByLabel('種目名')
  await names.nth(0).fill('スクワット')
  await names.nth(1).fill('プランク')
  await page.getByRole('group', { name: '単位' }).nth(1).getByRole('button', { name: '秒' }).click()
  await page.getByLabel('秒数').first().fill('30')
  await page.getByRole('button', { name: '＋ 単独ブロック' }).click()
  await names.nth(2).fill('懸垂')
  await expect(page.locator('#exercise-name-suggestions option')).not.toHaveCount(0)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('メニューを保存しました')

  // 一括貼り付け（設定済みは上書き表示）
  await page.getByRole('button', { name: 'このメニューを他の選手・日付にも入れる' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.locator('label', { hasText: '選手B' }).first().locator('input').check()
  await dlg.locator('label', { hasText: '設定済み' }).first().locator('input').check()
  await expect(dlg.getByText(/設定済みの 1件 は、今のメニューで上書きされます/)).toBeVisible()
  await dlg.getByLabel(/選手に通知する/).uncheck()
  await dlg.getByRole('button', { name: /件に入れる/ }).click()
  await expect(page.getByRole('status')).toContainText('ほかの2件の枠にもメニューを入れました')

  // 選手A：メニューを読めて、時刻を変えると「変更あり」になる
  const a = await newLoggedInPage(browser, 'athlete-a@example.com')
  await a.locator('a', { hasText: '16:00 ドライランド' }).first().click()
  await expect(a.getByText('コーチからのメニュー')).toBeVisible()
  await expect(a.locator('section ol')).toContainText('スクワット 10回')
  await expect(a.getByRole('button', { name: '水中練習' })).toBeDisabled()
  await a.getByLabel('開始時刻').fill('17:30')
  await a.getByRole('button', { name: '変更を保存' }).click()
  await expect(a.locator('ol')).toBeVisible()
  // API を直接使っても、メニューが入った予定は削除できない
  const events = await apiAs(a, '/rest/v1/events?select=id,menu:menus(event_id)&kind=eq.dryland')
  const target = (events.json as { id: string; menu: unknown }[]).find((e) => e.menu)!
  const del = await apiAs(a, `/rest/v1/events?id=eq.${target.id}`, { method: 'DELETE' })
  expect(del.status).toBe(400)
  expect(del.json.message).toBe('メニューが入った予定は削除できません。中止にしてください')

  // コーチ：「変更あり」→ 確認済み
  await page.getByRole('link', { name: '← カレンダー' }).click()
  const changed = page.locator('a', { hasText: '変更あり' }).first()
  await expect(changed).toContainText('17:30')
  await changed.click()
  await page.getByRole('button', { name: '確認済みにする' }).click()
  await expect(page.getByRole('button', { name: '確認済みにする' })).toHaveCount(0)
})
