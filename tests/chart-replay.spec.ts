import { expect, test } from '@playwright/test';

test('replay updates keep the canvas and a panned, zoomed drawing viewport stable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?workspace=classic');
  await expect(page.locator('svg.drawing-overlay')).toBeVisible();
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.getByRole('button', { name: 'Pause replay', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const pane = await page.locator('svg.drawing-overlay').boundingBox();
  if (!pane) throw new Error('Chart pane missing');
  // Pan into history so advancing replay must not follow the last bar.
  await page.mouse.move(pane.x + pane.width * 0.3, pane.y + pane.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(pane.x + pane.width * 0.8, pane.y + pane.height * 0.35, { steps: 12 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Trend line', exact: true }).click();
  await page.mouse.click(pane.x + pane.width * 0.35, pane.y + pane.height * 0.45);
  await page.mouse.click(pane.x + pane.width * 0.65, pane.y + pane.height * 0.6);
  const line = page.locator('[data-drawing-id] line').first();
  await expect(line).toBeVisible();
  const firstX = Number(await line.getAttribute('x1'));
  const lastX = Number(await line.getAttribute('x2'));
  const canvas = await page.locator('[data-testid="chart-canvas"] canvas').first().elementHandle();
  if (!canvas) throw new Error('Chart canvas missing');
  for (let i = 0; i < 4; ++i)
    await page.getByRole('button', { name: 'Next candle', exact: true }).click();
  expect(await canvas.evaluate((element) => element.isConnected)).toBe(true);
  await expect.poll(async () => Number(await line.getAttribute('x1'))).toBeCloseTo(firstX, 0);
  expect(Number(await line.getAttribute('x2'))).toBeCloseTo(lastX, 0);
  // Toggling studies may recreate panes but retains the same horizontal viewport.
  await page.getByRole('button', { name: 'Indicators', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Bollinger bands/ })
    .click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => Number(await line.getAttribute('x1'))).toBeCloseTo(firstX, 0);
  expect(Number(await line.getAttribute('x2'))).toBeCloseTo(lastX, 0);
  await page.screenshot({ path: '/tmp/signalhive-replay-viewport.png', fullPage: true });
  expect(errors).toEqual([]);
});
