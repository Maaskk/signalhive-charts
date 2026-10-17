import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', e => list.push(e.message));
  await page.goto('/');
  await expect(page.locator('svg.drawing-overlay')).toBeVisible();
});
test.afterEach(async ({ page }) => { expect(errors.get(page), 'No uncaught browser errors').toEqual([]); });

async function chartPoint(page: Page, x: number, y: number) {
  const rect = await page.locator('svg.drawing-overlay').boundingBox();
  if (!rect) throw new Error('Drawing pane is not ready');
  return { x: rect.x + rect.width * x, y: rect.y + rect.height * y };
}
async function clickChart(page: Page, x: number, y: number) {
  const p = await chartPoint(page, x, y); await page.mouse.click(p.x, p.y);
}
async function storedDrawings(page: Page, symbol = 'XAUUSD') {
  return page.evaluate(id => JSON.parse(localStorage.getItem('signalhive-workspace-v1') || '{}').drawings?.[id] ?? [], symbol);
}
async function chooseMarket(page: Page, symbol: string) {
  await page.locator('.symbol-select').click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${symbol}`) }).click();
  await expect(page.locator('.symbol-select')).toContainText(symbol);
  await expect(page.locator('svg.drawing-overlay')).toBeVisible();
}

test('long-position handles, AMD zones, undo/redo and persistence', async ({ page }) => {
  await expect(page.getByText('PAPER ONLY', { exact: true })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Long position', exact: true }).click();
  await clickChart(page, .55, .52);
  await clickChart(page, .76, .64);
  const drawing = page.locator('[data-drawing-id]').first();
  await expect(drawing).toContainText('R/R 1:2.00');
  const handle = drawing.locator('circle[r="5"]').nth(2);
  await handle.hover(); // Wait for chart projection/layout to settle before raw coordinate drag.
  const hb = await handle.boundingBox();
  if (!hb) throw new Error('Target handle is not visible');
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 24, { steps: 8 });
  await page.mouse.up();
  await expect(drawing).not.toContainText('R/R 1:2.00');
  await page.getByRole('button', { name: 'Undo drawing', exact: true }).click();
  await expect(drawing).toContainText('R/R 1:2.00');
  await page.getByRole('button', { name: 'Redo drawing', exact: true }).click();
  await expect(drawing).not.toContainText('R/R 1:2.00');
  await page.getByRole('button', { name: 'Drawing objects', exact: true }).click();
  await page.getByRole('button', { name: 'Accumulation', exact: true }).click();
  await clickChart(page, .18, .48); await clickChart(page, .39, .72);
  await expect(page.locator('svg.drawing-overlay')).toContainText('ACCUMULATION');
  await expect.poll(async () => (await storedDrawings(page)).length).toBe(2);
  await page.reload();
  await expect(page.locator('[data-drawing-id]')).toHaveCount(2);
  await expect(page.locator('svg.drawing-overlay')).toContainText('ACCUMULATION');
  await page.screenshot({ path: '/tmp/signalhive-charts-desktop.png', fullPage: true });
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, screen: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.screen);
});

test('markets, study library, declarative preset editor and volume profile', async ({ page }) => {
  await chooseMarket(page, 'EURUSD');
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await expect(page.getByRole('button', { name: '1h', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Indicators', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const bands = dialog.getByRole('button', { name: /Bollinger bands/ });
  await bands.click(); await expect(bands).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Study editor', exact: true }).click();
  const preset = { version: 1, name: 'UI test clean', indicators: { ema: true, sma: false, bollinger: false, levels: false, volume: true, rsi: false, macd: false, atr: true } };
  await page.getByLabel('Study preset JSON').fill(JSON.stringify(preset));
  await dialog.getByRole('button', { name: 'Save & apply study', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved and applied');
  await page.getByLabel('Study preset JSON').fill('{"version":1,"name":"bad","indicators":{"eval":"alert(1)"}}');
  await dialog.getByRole('button', { name: 'Save & apply study', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/supported indicator/);
  await dialog.getByRole('button', { name: 'Presets', exact: true }).click();
  await dialog.getByRole('button', { name: /UI test clean/ }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Volume profile', exact: true }).click();
  await expect(page.getByLabel('Estimated fixed-range volume profile')).toBeVisible();
  await expect(page.locator('.profile-overlay')).toContainText('POC');
  await page.getByLabel('Last 100 bars').evaluate(element => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, '80');
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.getByLabel('Last 80 bars')).toHaveValue('80');
  await page.getByRole('button', { name: 'Draw profile time range', exact: true }).click();
  await clickChart(page, .32, .3); await clickChart(page, .65, .67);
  await expect(page.locator('svg.drawing-overlay')).toContainText('VOLUME PROFILE · TIME RANGE');
  await expect(page.getByText('Using the drawn time range.', { exact: false })).toBeVisible();
  const profileDrawing = page.locator('[data-drawing-id]').last();
  const rangeBefore = await storedDrawings(page, 'EURUSD');
  const rangeHandle = profileDrawing.locator('circle[r="5"]').nth(1);
  await rangeHandle.hover();
  const point = await rangeHandle.boundingBox();
  if (!point) throw new Error('Profile range resize handle is missing');
  await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2);
  await page.mouse.down(); await page.mouse.move(point.x + 70, point.y + point.height / 2, { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => JSON.stringify(await storedDrawings(page, 'EURUSD'))).not.toBe(JSON.stringify(rangeBefore));
  await expect(page.locator('.profile-overlay')).toContainText('POC');
  await page.getByRole('button', { name: 'Use recent bars instead', exact: true }).click();
  await expect(page.getByText('Using the drawn time range.', { exact: false })).not.toBeVisible();
});

test('CSV import/export and paper risk rejection, replay and manual close', async ({ page }) => {
  await page.getByRole('button', { name: 'Place paper order', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/risk|margin/i);
  await chooseMarket(page, 'EURUSD');
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.getByRole('button', { name: 'Pause replay', exact: true }).click();
  const entry = Number((await page.locator('.quote > strong').textContent())?.replaceAll(',', ''));
  await page.getByLabel('Stop loss', { exact: true }).fill((entry - .0001).toFixed(5));
  await page.getByLabel('Take profit', { exact: true }).fill((entry + .0002).toFixed(5));
  await page.getByRole('button', { name: 'Place paper order', exact: true }).click();
  await expect(page.getByRole('button', { name: /Close now/ })).toBeVisible();
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Close your paper positions');
  await page.getByRole('button', { name: /Close now/ }).click();
  await expect(page.locator('.position-list')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next candle', exact: true }).click();
  await page.getByRole('button', { name: 'Exit replay', exact: false }).click();
  await page.getByRole('button', { name: 'Trade journal', exact: true }).click();
  await expect(page.locator('.journal-table')).toContainText('manual');
  const csv = 'time,open,high,low,close,volume\n2026-10-16T10:00:00Z,1.1000,1.1010,1.0990,1.1005,100\n2026-10-16T10:15:00Z,1.1005,1.1020,1.1000,1.1015,120\n2026-10-16T10:30:00Z,1.1015,1.1030,1.1010,1.1020,110\n';
  await page.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({ name: 'candles.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('status')).toContainText('Imported 3 candles');
  await expect(page.locator('.instrument-heading')).toContainText('CSV');
  await page.getByTitle('Workspace & backups').click();
  const download = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: /Export visible history/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('EURUSD-candles.csv');
  const path = await file.path();
  expect(path).toBeTruthy();
  const content = await readFile(path!, 'utf8');
  expect(content.trim().split('\n')).toHaveLength(4);
  expect(content).toContain('time,open,high,low,close,volume');
});

test('extreme CSV volume cannot crash the volume profile workspace', async ({ page }) => {
  const csv = 'time,open,high,low,close,volume\n1792144800,100,101,99,100,1e308\n1792145700,100,101,99,100,1e308\n';
  await page.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({ name: 'overflow.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('status')).toBeVisible();
  // Either reject this source at import, or report profile calculation failure
  // without unmounting the complete app. Both preserve a usable workspace.
  if ((await page.getByRole('status').textContent())?.includes('Imported'))
    await page.getByRole('button', { name: 'Volume profile', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
});

test('mobile layout, side-panel close and touch drawing', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Close side panel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close side panel', exact: true }).click();
  await expect(page.locator('.side-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Collapse trading panel', exact: true }).click();
  await page.getByRole('button', { name: 'Long position', exact: true }).tap();
  const a = await chartPoint(page, .35, .48), b = await chartPoint(page, .72, .62);
  await page.touchscreen.tap(a.x, a.y); await page.touchscreen.tap(b.x, b.y);
  await expect(page.locator('[data-drawing-id]')).toHaveCount(1);
  await expect(page.locator('svg.drawing-overlay')).toContainText('R/R 1:2.00');
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, screen: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.screen);
  await page.screenshot({ path: '/tmp/signalhive-charts-mobile.png', fullPage: true });
  expect(pageErrors).toEqual([]);
  await context.close();
});
