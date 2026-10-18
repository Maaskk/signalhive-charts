import { VelaWorkspace } from '@luxalgo/vela/workspace';
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
});
window.addEventListener('pagehide', () => window.engineEval.destroy());
