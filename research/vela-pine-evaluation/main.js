import { VelaWorkspace } from '@luxalgo/vela/workspace';
import { PineWorkerEngine } from '@luxalgo/vela-pinets';
const ema = `//@version=6
indicator("EMA 9 / 21 / 200", overlay=true)
fast = input.int(9, "Fast EMA", minval=1)
medium = input.int(21, "Medium EMA", minval=1)
slow = input.int(200, "Slow EMA", minval=1)
plot(ta.ema(close,fast), "EMA fast", color=color.blue, linewidth=2)
plot(ta.ema(close,medium), "EMA medium", color=color.yellow, linewidth=2)
plot(ta.ema(close,slow), "EMA slow", color=color.red, linewidth=2)`;
const rsi = `//@version=6
indicator("RSI", overlay=false)
period = input.int(14, "Period", minval=1)
plot(ta.rsi(close,period), "RSI", color=color.purple)
hline(70, "Upper")
hline(30, "Lower")`;
const macd = `//@version=6
indicator("MACD", overlay=false)
fast=input.int(12, "Fast", minval=1)
slow=input.int(26, "Slow", minval=1)
signal=input.int(9, "Signal", minval=1)
[m,s,h]=ta.macd(close,fast,slow,signal)
plot(m, "MACD", color=color.blue)
plot(s, "Signal", color=color.orange)
plot(h, "Histogram", style=plot.style_histogram, color=h>=0?color.green:color.red)`;
const known = new Set([ema, rsi, macd]);
class KnownScriptsEngine extends PineWorkerEngine {
  prepare(source, id) {
    if (!known.has(source))
      return Promise.reject(new Error('This evaluation runs only the three included scripts.'));
    return super.prepare(source, id);
  }
}
const end = Date.UTC(2026, 9, 16);
const data = Array.from({ length: 600 }, (_, i) => {
  const open = 4180 + 12 * Math.sin(i / 25) + 4 * Math.sin(i / 8);
  const close = 4180 + 12 * Math.sin((i + 1) / 25) + 4 * Math.sin((i + 1) / 8);
  return {
    time: end - (600 - i) * 900000,
    open,
    close,
    high: Math.max(open, close) + 1.1,
    low: Math.min(open, close) - 1.3,
    volume: 100 + ((i * 137) % 2000),
  };
});
window.engineEval = new VelaWorkspace('#chart', {
  symbol: 'XAUUSD',
  timeframe: '15',
  data,
  theme: 'dark',
  live: false,
  persist: false,
  layout: false,
  nativeBackend: 'canvas2d',
  engines: { pine: () => new KnownScriptsEngine() },
  indicators: [
    { name: 'EMA 9/21/200', script: ema, language: 'pine', enabled: true },
    { name: 'RSI', script: rsi, language: 'pine', enabled: true },
    { name: 'MACD', script: macd, language: 'pine', enabled: true },
  ],
});
window.addEventListener('pagehide', () => window.engineEval.destroy());
