import { expect, test } from '@playwright/test'
import { jst, login, md, resetDb } from './helpers'

test.beforeAll(resetDb)

test('選手：週表示・追加・編集・コピーと貼り付け・中止・削除', async ({ page }) => {
  await login(page, 'athlete-a@example.com')
  const week = page.locator('ol > li h2')
  await expect(week.first()).toContainText('今日')
  await expect(week).toHaveCount(7)
  // 他の選手の予定は見えない
  await expect(page.getByText('選手Bの秘密の場所')).toHaveCount(0)

  // 次の7日・今日に戻る
  await page.getByRole('button', { name: '次の7日' }).click()
  await expect(week.first()).toContainText(md(jst(7)))
  await page.getByRole('button', { name: '今日に戻る' }).click()
  await expect(week.first()).toContainText('今日')

  // 明日に追加
  const addTomorrow = page.getByRole('link', { name: new RegExp(`^${md(jst(1))}.*に予定を追加`) })
  await addTomorrow.click()
  await page.getByRole('button', { name: '水中練習' }).click()
  await page.getByLabel('開始時刻').fill('06:30')
  await page.getByLabel('場所').fill('朝練プール')
  await page.getByRole('button', { name: '120分' }).click()
  await page.getByRole('button', { name: /に追加$/ }).click()
  await expect(page.getByText('朝練プール')).toBeVisible()

  // 入力エラー
  await addTomorrow.click()
  await page.getByLabel('時間（分）').fill('0')
  await page.getByRole('button', { name: /に追加$/ }).click()
  await expect(page.getByRole('alert')).toHaveText('時間は1分以上にしてください')
  await page.getByRole('button', { name: '← 戻る' }).click()

  // 編集
  await page.locator('a', { hasText: '16:00 ドライランド' }).first().click()
  await page.getByLabel('開始時刻').fill('17:00')
  await page.getByRole('button', { name: '変更を保存' }).click()
  await expect(page.locator('a', { hasText: '17:00 ドライランド' })).toHaveCount(1)

  // コピー → 月表示で2日選んで貼り付け
  await page.locator('a', { hasText: '17:00 ドライランド' }).click()
  await page.getByRole('button', { name: 'コピーして他の日に貼り付ける' }).click()
  await expect(page).toHaveURL(/\/month$/)
  for (const d of [jst(5), jst(6)]) {
    // 月をまたぐときは翌月へ
    if (!(await page.getByRole('button', { name: new RegExp(`^${md(d)}（`) }).count())) {
      await page.getByRole('button', { name: '次の月' }).click()
    }
    await page.getByRole('button', { name: new RegExp(`^${md(d)}（`) }).first().click()
  }
  await page.getByRole('button', { name: '貼り付け（2日）' }).click()
  await expect(page.getByRole('status')).toHaveText('2日に貼り付けました。')
  await page.getByRole('link', { name: '週', exact: true }).click()
  await expect(page.locator('a', { hasText: '17:00 ドライランド' })).toHaveCount(3)

  // 中止（理由が必要）→ 取り消し
  await page.locator('a', { hasText: '06:30 水中練習' }).click()
  await page.getByRole('button', { name: '中止にする' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '中止にする' }).click()
  await expect(dialog.getByText('中止の理由を入力してください')).toBeVisible()
  await page.getByLabel('中止の理由（ひとこと）').fill('発熱')
  await dialog.getByRole('button', { name: '中止にする' }).click()
  await expect(page.getByText('この予定は中止しました')).toBeVisible()
  await page.getByRole('button', { name: '中止を取り消す' }).click()
  await expect(page.getByText('この予定は中止しました')).toHaveCount(0)

  // 削除するとカレンダーに戻る
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: '削除する' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('a', { hasText: '06:30 水中練習' })).toHaveCount(0)

  // メニューが入った予定には削除ボタンがない
  await page.locator('a', { hasText: '07:00 ドライランド' }).click()
  await expect(page.getByText('コーチからのメニュー')).toBeVisible()
  await expect(page.getByRole('button', { name: '削除する' })).toHaveCount(0)
})
