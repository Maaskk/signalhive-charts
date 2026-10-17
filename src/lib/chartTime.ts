import type { Candle } from '../types';

/** Fractional indices match the chart's compressed calendar, including imported gaps. */
export function timeToIndex(candles: readonly Candle[], time: number): number {
  const n = candles.length;
  if (n < 2) return 0;
  if (time <= candles[0].time)
    return (time - candles[0].time) / (candles[1].time - candles[0].time);
  if (time >= candles[n - 1].time)
    return n - 1 + (time - candles[n - 1].time) / (candles[n - 1].time - candles[n - 2].time);
  let lo = 0,
    hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (candles[mid].time <= time) lo = mid;
    else hi = mid;
  }
  return lo + (time - candles[lo].time) / (candles[hi].time - candles[lo].time);
}
export function indexToTime(candles: readonly Candle[], index: number): number {
  const n = candles.length;
  if (n < 2) return candles[0]?.time ?? 0;
  const lo = Math.max(0, Math.min(n - 2, Math.floor(index)));
  return candles[lo].time + (index - lo) * (candles[lo + 1].time - candles[lo].time);
}
