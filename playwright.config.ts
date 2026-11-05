import { defineConfig, devices } from '@playwright/test'

/**
 * 画面操作の通しテスト（e2e/）。ローカルの Supabase（seed 入り）と Vite の開発サーバーに対して動かす。
 * 各ファイルの最初にデータベースを seed の状態に戻すので、1つずつ順番に実行する。
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    // iPhone の画面サイズとタッチで、Chromium を使う
    ...devices['iPhone 13'],
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
