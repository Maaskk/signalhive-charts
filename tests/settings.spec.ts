import { test, expect, type Page } from '@playwright/test';

async function openSettings(page: Page, section: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: section, exact: true }).click();
}
async function pixels(page: Page, color: number[]) {
  return page.locator('.chart-canvas canvas').evaluateAll(
    (elements, rgb) =>
      elements.reduce((total, element) => {
        const canvas = element as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return total;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < data.length; i += 4)
          if (
            data[i] === rgb[0] &&
            data[i + 1] === rgb[1] &&
            data[i + 2] === rgb[2] &&
            data[i + 3] > 220
          )
            total++;
        return total;
      }, 0),
    color
  );
}
async function draw(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  const rect = await page.locator('svg.drawing-overlay').boundingBox();
  if (!rect) throw Error('Missing plot');
  await page.mouse.click(rect.x + rect.width * 0.3, rect.y + rect.height * 0.4);
  await page.mouse.click(rect.x + rect.width * 0.58, rect.y + rect.height * 0.6);
}

test('real indicator periods/colors, appearance and workspace export persist', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?workspace=classic');
  await page.locator('svg.drawing-overlay').waitFor();
  await openSettings(page, 'Indicator settings');
  await page.getByLabel('EMA 1 period', { exact: true }).fill('12');
  await page.getByLabel('EMA 1 color', { exact: true }).fill('#ff00ff');
  await page.getByLabel('Line width', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Apply indicator settings', exact: true }).click();
  await expect(page.locator('.indicator-strip')).toContainText('EMA 12');
  // Assert actual canvas pixels, rather than merely the input or legend text changing.
  await expect.poll(() => pixels(page, [255, 0, 255])).toBeGreaterThan(50);
  await openSettings(page, 'Indicator settings');
  await page.getByLabel('Study to edit').selectOption('rsi');
  await page.getByLabel('RSI period').fill('7');
  await page.getByLabel('Upper reference').fill('80');
  await page.getByLabel('Lower reference').fill('20');
  await page.getByRole('button', { name: 'Apply indicator settings', exact: true }).click();
  await openSettings(page, 'Chart appearance');
  await page.getByLabel('Chart type', { exact: true }).selectOption('line');
  await page.getByLabel('Line / area outline', { exact: true }).fill('#00ff22');
  await page.getByRole('button', { name: 'Apply chart appearance', exact: true }).click();
  await expect.poll(() => pixels(page, [0, 255, 34])).toBeGreaterThan(30);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('signalhive-workspace-v1') ?? '{}').appearance?.chartType
      )
    )
    .toBe('line');
  await page.reload();
  await page.locator('svg.drawing-overlay').waitFor();
  await expect(page.locator('.indicator-strip')).toContainText('EMA 12');
  await expect.poll(() => pixels(page, [255, 0, 255])).toBeGreaterThan(50);
  await page.locator('.brand').click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Export workspace/ }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const workspace = JSON.parse(Buffer.concat(chunks).toString());
  expect(workspace.config.ema.periods).toEqual([12, 21, 200]);
  expect(workspace.config.ema.colors[0]).toBe('#ff00ff');
  expect(workspace.config.rsi.period).toBe(7);
  expect(workspace.appearance.chartType).toBe('line');
  expect(workspace.appearance.lineColor).toBe('#00ff22');
  expect(errors).toEqual([]);
});

test('drawing properties change real SVG geometry/styles and editable Fibonacci levels', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?workspace=classic');
  await page.locator('svg.drawing-overlay').waitFor();
  await draw(page, 'Trend line');
  await page.getByRole('button', { name: 'Drawing objects', exact: true }).click();
  await page.getByRole('button', { name: 'Drawing properties', exact: true }).click();
  await page.getByLabel('Line / text color').fill('#aabbcc');
  await page.getByLabel('Line width', { exact: true }).selectOption('4');
  await page.getByLabel('Line pattern').selectOption('dotted');
  await page.getByRole('button', { name: 'Apply drawing properties', exact: true }).click();
  const line = page.locator('svg.drawing-overlay line[stroke="#aabbcc"]').first();
  await expect(line).toHaveAttribute('stroke-width', '4');
  await expect(line).toHaveAttribute('stroke-dasharray', /\S/);
  await draw(page, 'Fibonacci retracement');
  await page.getByRole('button', { name: 'Drawing properties', exact: true }).click();
  await page.getByLabel('Level 3 ratio', { exact: true }).fill('0.333');
  await page.getByLabel('Level 3 color', { exact: true }).fill('#ddee11');
  await page.getByRole('button', { name: 'Apply drawing properties', exact: true }).click();
  await expect(page.locator('svg.drawing-overlay')).toContainText('0.333');
  await expect(page.locator('svg.drawing-overlay line[stroke="#ddee11"]').first()).toHaveAttribute(
    'stroke-width',
    '2'
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('signalhive-workspace-v1') ?? '{}').drawings?.XAUUSD?.[1]
            ?.style?.fibLevels?.[2]?.value
      )
    )
    .toBe(0.333);
  await page.reload();
  await expect(page.locator('svg.drawing-overlay')).toContainText('0.333');
  await page.screenshot({ path: '/tmp/signalhive-editable-settings.png', fullPage: true });
  expect(errors).toEqual([]);
});
