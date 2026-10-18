import { PineTS } from 'pinets';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const bars = Array.from({ length: 600 }, (_, i) => ({
  openTime: 1760000000000 + i * 900000,
  open: 100 + i / 10,
  high: 100.3 + i / 10,
  low: 99.9 + i / 10,
  close: 100.1 + i / 10,
  volume: 100 + i,
}));
const source = `//@version=6
indicator("Signalhive compatibility probe", overlay=true)
length = input.int(9, "Length", minval=1)
plot(ta.sma(close, length), "SMA")
plot(ta.ema(close, 9), "EMA9", color=color.blue)
plot(ta.ema(close, 21), "EMA21", color=color.yellow)
plot(ta.ema(close, 200), "EMA200", color=color.red)
plot(ta.rsi(close, 14), "RSI")
[macdLine, signalLine, hist] = ta.macd(close, 12, 26, 9)
plot(macdLine, "MACD")
plot(signalLine, "Signal")
plot(hist, "Histogram")
`;
const result = await new PineTS(bars).run(source);
const output = Object.fromEntries(
  Object.entries(result.plots).map(([key, p]) => [
    key,
    { count: p.data.length, last: p.data.at(-1).value },
  ])
);
assert.ok(
  ['SMA', 'EMA9', 'EMA21', 'EMA200', 'RSI', 'MACD', 'Signal', 'Histogram'].every((k) =>
    Object.hasOwn(output, k)
  )
);
const named = Object.fromEntries(
  Object.entries(output).filter(([k]) =>
    ['SMA', 'EMA9', 'EMA21', 'EMA200', 'RSI', 'MACD', 'Signal', 'Histogram'].includes(k)
  )
);
for (const p of Object.values(named)) {
  assert.equal(p.count, 600);
  assert.ok(Number.isFinite(p.last));
}
assert.ok(Math.abs(output.SMA.last - 159.6) < 1e-8);
assert.ok(Math.abs(output.RSI.last - 100) < 1e-8);
writeFileSync(
  new URL('./result.json', import.meta.url),
  JSON.stringify(
    {
      version: '0.11.1',
      source: 'synthetic',
      checks:
        'Native Pine v6 parsed and executed; 8 plots; independently checked SMA9=159.6 and RSI14=100. Not full TradingView compatibility certification.',
      output,
    },
    null,
    2
  )
);
console.log(JSON.stringify(output, null, 2));
