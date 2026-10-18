import { expect, test, type Page } from '@playwright/test';

async function ledger(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('signalhive-session-v1') || '{}').paper
  );
}

async function setupEuro(page: Page) {
  await page.goto('/?workspace=classic');
  await expect(page.locator('svg.drawing-overlay')).toBeVisible();
  await page.getByRole('button', { name: 'Place paper order', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/risk|margin/i);
  expect((await ledger(page)).positions).toHaveLength(0);
  await page.locator('.symbol-select').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^EURUSD/ })
    .click();
  const csv =
    'time,open,high,low,close,volume\n1792144800,1.10000,1.10050,1.09950,1.10000,100\n1792145700,1.10000,1.10050,1.09950,1.10000,100\n1792146600,1.10000,1.10050,1.09950,1.10000,100\n';
  await page.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({
    name: 'euro-paper-controls.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await expect(page.getByRole('status')).toContainText('Imported 3 candles');
  await page.getByLabel('Stop loss', { exact: true }).fill('1.09990');
  await page.getByLabel('Take profit', { exact: true }).fill('1.10020');
  await page.getByLabel('Order lots', { exact: true }).fill('0.3');
  await page.getByRole('button', { name: 'Auto-size to risk budget', exact: true }).click();
  await expect(page.getByLabel('Order lots', { exact: true })).toHaveValue('0.02');
  await expect(page.getByRole('status')).toContainText(/risk \$0.20, margin \$22.00/);
  await page.getByRole('button', { name: 'Place paper order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close part', exact: true })).toBeEnabled();
  await expect.poll(async () => (await ledger(page)).positions.length).toBe(1);
}

test('auto sizing and a partial close preserve the remaining paper stop, target and journal', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setupEuro(page);
  const before = await ledger(page);
  expect(before.positions[0].lots).toBe(0.02);
  expect(before.positions[0].risk).toBeCloseTo(0.2, 10);
  expect(before.positions[0].margin).toBeCloseTo(22, 10);
  await page.getByRole('button', { name: 'Close part', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Partial close lots')).toHaveValue('0.01');
  await dialog.getByRole('button', { name: 'Close paper portion', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await ledger(page)).trades.length).toBe(1);
  const after = await ledger(page);
  expect(after.positions[0]).toMatchObject({
    id: before.positions[0].id,
    lots: 0.01,
    stopLoss: 1.0999,
    takeProfit: 1.1002,
    margin: 11,
  });
  expect(after.positions[0].risk).toBeCloseTo(0.1, 10);
  expect(after.trades[0]).toMatchObject({ lots: 0.01, reason: 'manual', pnl: 0 });
  expect(after.trades[0].id).not.toBe(after.positions[0].id);
  expect(after.nextId).toBe(before.nextId + 1);
  await expect(page.getByRole('button', { name: 'Close part', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Close now', exact: false })).toBeVisible();
  expect((await ledger(page)).positions[0].lots).toBe(0.01);
  await page.getByRole('button', { name: 'Trade journal', exact: true }).click();
  await expect(page.locator('.journal-table')).toContainText('manual');
  expect(errors).toEqual([]);
});

test('paper stop drag reduces risk and an over-budget drag resets without amending the ledger', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setupEuro(page);
  const initial = await ledger(page);
  const sl = page.locator('[data-paper-level="stopLoss"]');
  const tp = page.locator('[data-paper-level="takeProfit"]');
  await expect(sl).toContainText('PAPER SL 1.09990');
  const slPoint = await sl.locator('circle').boundingBox();
  const tpPoint = await tp.locator('circle').boundingBox();
  if (!slPoint || !tpPoint) throw new Error('Paper level handles are not visible');
  const ySl = slPoint.y + slPoint.height / 2;
  const yTp = tpPoint.y + tpPoint.height / 2;
  const pixelsPerPrice = (ySl - yTp) / (1.1002 - 1.0999);
  const dragTo = async (price: number) => {
    const current = (await ledger(page)).positions[0].stopLoss;
    const point = await sl.locator('circle').boundingBox();
    if (!point) throw new Error('Paper SL handle is missing');
    const x = point.x + point.width / 2,
      y = point.y + point.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + (current - price) * pixelsPerPrice, { steps: 8 });
    await page.mouse.up();
  };
  await dragTo(1.09995);
  await expect(page.getByRole('status')).toContainText('Paper stop / target updated');
  await expect.poll(async () => (await ledger(page)).positions[0].stopLoss).toBe(1.09995);
  const reduced = await ledger(page);
  expect(reduced.positions[0].risk).toBeLessThan(initial.positions[0].risk);
  expect(reduced.positions[0].risk).toBeCloseTo(0.1, 10);
  await dragTo(1.0996);
  await expect(page.getByRole('status')).toContainText(/per-trade.*limit/);
  await expect(sl).toContainText('PAPER SL 1.09995');
  expect(await ledger(page)).toEqual(reduced);
  await page.screenshot({ path: '/tmp/signalhive-paper-levels.png', fullPage: true });
  expect(errors).toEqual([]);
});
