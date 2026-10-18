import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.setTimeout(90_000);
test('new workspace: editable profile, durable layout, study inputs and real PNG', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Three EMAs', { exact: true }).filter({ visible: true })).toBeVisible(
    { timeout: 30_000 }
  );
  await expect(page.getByText('RSI', { exact: true })).toBeVisible();
  await expect(page.getByText('MACD', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Drawing library', exact: true }).click();
  await page.getByLabel('Search drawing tools').fill('fixed range');
  await page
    .getByRole('button', { name: 'Fixed Range Volume Profile measure', exact: true })
    .click();
  const bounds = await page.locator('.wb-chart canvas').first().boundingBox();
  expect(bounds).toBeTruthy();
  const x = bounds!.x + bounds!.width * 0.25,
    y = bounds!.y + bounds!.height * 0.25;
  await page.mouse.click(x, y);
  await page.mouse.click(bounds!.x + bounds!.width * 0.65, y + 70);
  await page.mouse.dblclick(x, y + 30);
  await expect(page.getByText('Value Area', { exact: true })).toBeVisible();
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByRole('spinbutton').nth(0).fill('48');
  await dialog.getByRole('spinbutton').nth(1).fill('68');
  await page.getByRole('button', { name: 'Ok', exact: true }).click();
  const backupEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save backup', exact: true }).click();
  const backup = await backupEvent;
  const json = JSON.parse(await readFile((await backup.path())!, 'utf8'));
  expect(json.application).toBe('signalhive-workbench');
  expect(json.source).toEqual({ kind: 'simulation' });
  const serialized = JSON.stringify(json.layout);
  expect(serialized).toContain('48');
  expect(serialized).toContain('68');
  await page.reload();
  await expect(page.getByText('Three EMAs', { exact: true }).filter({ visible: true })).toBeVisible(
    { timeout: 30_000 }
  );
  await page.getByRole('button', { name: 'Object tree', exact: true }).click();
  await expect(page.getByText('Fixed Range Volume Profile', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByText('Three EMAs', { exact: true }).filter({ visible: true }).dblclick();
  await expect(page.getByLabel('Fast EMA', { exact: true })).toHaveValue('9');
  await page.getByLabel('Fast EMA', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Ok', exact: true }).click();
  await page.getByText('Three EMAs', { exact: true }).filter({ visible: true }).dblclick();
  await expect(page.getByLabel('Fast EMA', { exact: true })).toHaveValue('12');
  await page.getByLabel('Fast EMA', { exact: true }).fill('9');
  await page.getByRole('button', { name: 'Ok', exact: true }).click();
  const pngEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  const png = await pngEvent;
  const bytes = await readFile((await png.path())!);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.length).toBeGreaterThan(5000);
  await page.screenshot({ path: 'docs/screenshots/workbench.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('CSV backup restores its own history without inventing another source', async ({ page }) => {
  const bars = Array.from({ length: 220 }, (_, i) => [
    1800000000 + i * 900,
    100 + i / 100,
    102 + i / 100,
    99 + i / 100,
    101 + i / 100,
    100 + i,
  ]);
  const csv = 'time,open,high,low,close,volume\n' + bars.map((b) => b.join(',')).join('\n');
  await page.goto('/');
  await expect(page.getByText('Three EMAs', { exact: true }).filter({ visible: true })).toBeVisible(
    { timeout: 30_000 }
  );
  await page.getByRole('button', { name: 'Data source', exact: true }).click();
  await page
    .locator('input[type=file][accept=".csv,text/csv"]')
    .setInputFiles({ name: 'test-bars.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('.wb-source')).toContainText('CSV · test-bars.csv');
  await expect(
    page.getByText('Three EMAs', { exact: true }).filter({ visible: true })
  ).toBeVisible();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save backup', exact: true }).click();
  const backup = await event;
  const path = (await backup.path())!;
  await page.getByRole('button', { name: 'Data source', exact: true }).click();
  await page.getByRole('button', { name: 'Use simulated data', exact: true }).click();
  await expect(page.locator('.wb-source')).toContainText('SIMULATED');
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(path);
  await expect(page.locator('.wb-source')).toContainText('CSV · test-bars.csv');
  await page.reload();
  await expect(page.locator('.wb-source')).toContainText('CSV · test-bars.csv');
  await expect(
    page.getByText('Three EMAs', { exact: true }).filter({ visible: true })
  ).toBeVisible();
});

test('single-chart replay and previous workspace remain usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Three EMAs', { exact: true }).filter({ visible: true })).toBeVisible(
    { timeout: 30_000 }
  );
  await page.getByLabel('Start (UTC)').fill('2026-10-15T12:00');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Step', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await page.getByRole('button', { name: 'Exit replay', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Step', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Previous workspace', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible({
    timeout: 30_000,
  });
});

test('MT5 source is explicit, labelled stale, read only and never replaced on failure', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {} })
  );
  const now = Math.floor(Date.now() / 1000);
  const candles = Array.from({ length: 240 }, (_, i) => ({
    time: Math.floor(now / 900) * 900 - (240 - i) * 900,
    open: 4100 + i / 10,
    high: 4102 + i / 10,
    low: 4099 + i / 10,
    close: 4101 + i / 10,
    volume: 1000 + i,
  }));
  let available = true,
    requests = 0;
  await page.route('http://127.0.0.1:18743/api/mt5', (route) => {
    requests++;
    return available
      ? route.fulfill({
          json: {
            version: 1,
            source: 'mt5',
            capturedAt: Math.floor(Date.now() / 1000),
            connected: true,
            demo: true,
            symbol: 'XAUUSD',
            timeframe: '15m',
            candles,
            quote: { bid: 4125, ask: 4126, time: now - 3600 },
            spec: { decimals: 2, contractSize: 100, minLots: 0.01, lotStep: 0.01 },
            account: {
              balance: 95324.44,
              equity: 95324.44,
              freeMargin: 95324.44,
              currency: 'USD',
              positionsCount: 0,
              ordersCount: 0,
            },
          },
        })
      : route.fulfill({ status: 503, json: {} });
  });
  await page.goto('/');
  await expect(page.getByText('Three EMAs', { exact: true })).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Data source', exact: true }).click();
  await page.getByRole('button', { name: 'Connect read-only MT5', exact: true }).click();
  await expect(page.locator('.wb-source')).toContainText('MT5 DEMO');
  await expect(page.locator('.wb-source')).toContainText('Stale broker quote');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save backup', exact: true }).click();
  const exported = await readFile((await (await event).path())!, 'utf8');
  const backup = JSON.parse(exported);
  expect(backup.source).toEqual({ kind: 'mt5', symbol: 'XAUUSD', timeframe: '15m' });
  expect(exported).not.toContain('95324.44');
  available = false;
  await expect(page.locator('.wb-source')).toContainText('MT5 DEMO · Open the installed', {
    timeout: 12_000,
  });
  await expect(page.getByText('Three EMAs', { exact: true })).toBeVisible();
});

test('mobile workspace fits and production assets remain available offline', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Show indicator legend', exact: true }).click();
  await expect(page.getByText('Three EMAs', { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The production preview registers a worker; a dev run verifies the same mobile UI.
  if (process.env.SIGNALHIVE_TEST_PRODUCTION) {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBeTruthy();
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'Show indicator legend', exact: true }).click();
    await expect(page.getByText('Three EMAs', { exact: true })).toBeVisible();
    await context.setOffline(false);
  }
  for (const name of ['Three EMAs', 'RSI', 'MACD']) {
    await expect(page.getByText(name, { exact: true }).locator('../..')).toContainText(/\d+\.\d+/, {
      timeout: 15_000,
    });
  }
  await page.mouse.move(380, 120);
  await page.screenshot({ path: 'docs/screenshots/workbench-mobile.png', fullPage: true });
});
