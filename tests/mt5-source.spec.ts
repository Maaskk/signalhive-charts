import { test, expect } from '@playwright/test';
import { generateCandles } from '../src/lib/market';

test('MT5 source stays view-only and retains broker candles on disconnection', async ({ page }) => {
  const now = Math.floor(Date.now() / 1000);
  const candles = generateCandles('XAUUSD', '15m');
  // Deliberately distinguish broker fixture prices from the default synthetic series.
  const brokerBars = candles.map((c) => ({
    ...c,
    open: c.open + 100,
    high: c.high + 100,
    low: c.low + 100,
    close: c.close + 100,
  }));
  let connected = true;
  let requests = 0;
  await page.addInitScript(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {} });
  });
  await page.route('http://127.0.0.1:18743/api/mt5', async (route) => {
    requests++;
    await route.fulfill({
      status: connected ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify(
        connected
          ? {
              version: 1,
              source: 'mt5',
              capturedAt: now,
              connected: true,
              demo: true,
              symbol: 'XAUUSD',
              timeframe: '15m',
              candles: brokerBars,
              quote: {
                bid: brokerBars.at(-1)!.close,
                ask: brokerBars.at(-1)!.close + 0.2,
                time: now - 3600,
              },
              spec: { decimals: 2, contractSize: 100, minLots: 0.01, lotStep: 0.01 },
              account: {
                balance: 50,
                equity: 50,
                freeMargin: 50,
                currency: 'USD',
                positionsCount: 0,
                ordersCount: 0,
              },
            }
          : {
              version: 1,
              source: 'mt5',
              capturedAt: now,
              connected: false,
              error: 'snapshot_unavailable',
            }
      ),
    });
  });
  await page.goto('/?workspace=classic');
  await expect(page.locator('.paper-order')).toContainText('MT5 · VIEW ONLY');
  await expect(page.getByRole('button', { name: 'Place paper order', exact: true })).toHaveCount(0);
  await expect(page.locator('.quote')).toContainText(brokerBars.at(-1)!.close.toFixed(2));
  await expect(page.locator('.watch-row')).toHaveCount(1);
  await expect(page.locator('.data-label')).toHaveText('MT5 · STALE QUOTE');
  connected = false;
  const before = requests;
  await expect.poll(() => requests).toBeGreaterThan(before);
  await expect(page.locator('footer')).toContainText('MT5');
  await expect(page.locator('.quote')).toContainText(brokerBars.at(-1)!.close.toFixed(2));
  await page.getByRole('button', { name: 'Data source settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('showing the last snapshot');
  await page.getByRole('button', { name: 'Disconnect MT5 source', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Place paper order', exact: true })).toBeVisible();
  await expect(page.locator('.quote')).toContainText(candles.at(-1)!.close.toFixed(2));
});
