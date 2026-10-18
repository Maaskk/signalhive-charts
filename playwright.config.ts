import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath =
  process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: './tests',
  timeout: 40_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: process.env.SIGNALHIVE_TEST_PRODUCTION ? 'npm run preview' : 'npm run dev',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: !process.env.CI && !process.env.SIGNALHIVE_TEST_PRODUCTION,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:1420',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
