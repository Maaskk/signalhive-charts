import type { Candle } from '../types';
import { validateCandles } from './market';

export interface VolumeBin {
  low: number;
  high: number;
  volume: number;
}
export interface VolumeProfile {
  bins: VolumeBin[];
  poc: number | null;
  val: number | null;
  vah: number | null;
  totalVolume: number;
}

/**
 * OHLCV estimate, NOT trade-at-price, ask/bid, order flow or institutional activity.
 * Each candle's volume is distributed uniformly over its low/high interval.
 * Only candles whose timestamps lie inside the inclusive selected range are used.
 * Callers must pass only bars available at their replay cursor.
 */
export function volumeProfile(
  candles: readonly Candle[],
  fromTime: number,
  toTime: number,
  bins = 32,
  valueArea = 0.7
): VolumeProfile {
  validateCandles(candles);
  if (
    !Number.isSafeInteger(fromTime) ||
    !Number.isSafeInteger(toTime) ||
    fromTime < 0 ||
    fromTime > toTime
  )
    throw new Error('Profile range requires ordered integer UTC timestamps.');
  if (!Number.isInteger(bins) || bins < 1 || bins > 128)
    throw new Error('Profile bin count must be between 1 and 128.');
  if (!Number.isFinite(valueArea) || valueArea <= 0 || valueArea > 1)
    throw new Error('Value area must be greater than zero and at most one.');
  const selected = candles.filter((c) => c.time >= fromTime && c.time <= toTime);
  if (!selected.length) return { bins: [], poc: null, val: null, vah: null, totalVolume: 0 };
  let low = Infinity,
    high = -Infinity,
    totalVolume = 0;
  for (const candle of selected) {
    low = Math.min(low, candle.low);
    high = Math.max(high, candle.high);
    totalVolume += candle.volume;
  }
  if (!Number.isFinite(totalVolume))
    throw new Error('Profile volume exceeds the supported numeric range.');
  if (high === low)
    return {
      bins: [{ low, high, volume: totalVolume }],
      poc: totalVolume ? low : null,
      val: totalVolume ? low : null,
      vah: totalVolume ? high : null,
      totalVolume,
    };
  const step = (high - low) / bins;
  if (!Number.isFinite(step) || step <= 0)
    throw new Error('Profile price range cannot be represented safely.');
  const result: VolumeBin[] = Array.from({ length: bins }, (_, i) => ({
    low: low + i * step,
    high: i === bins - 1 ? high : low + (i + 1) * step,
    volume: 0,
  }));
  for (const candle of selected) {
    if (!candle.volume) continue;
    if (candle.high === candle.low) {
      result[Math.min(bins - 1, Math.max(0, Math.floor((candle.low - low) / step)))].volume +=
        candle.volume;
      continue;
    }
    const first = Math.max(0, Math.min(bins - 1, Math.floor((candle.low - low) / step)));
    const last = Math.max(first, Math.min(bins - 1, Math.ceil((candle.high - low) / step) - 1));
    let remaining = candle.volume;
    for (let i = first; i <= last; i++) {
      const overlap = Math.max(
        0,
        Math.min(candle.high, result[i].high) - Math.max(candle.low, result[i].low)
      );
      const share =
        i === last
          ? remaining
          : Math.min(remaining, candle.volume * (overlap / (candle.high - candle.low)));
      result[i].volume += share;
      remaining = Math.max(0, remaining - share);
    }
  }
  let peak = 0;
  for (let i = 1; i < bins; i++) if (result[i].volume > result[peak].volume) peak = i;
  // Correct floating summation residue without inventing or discarding volume.
  const sum = result.reduce((acc, bin) => acc + bin.volume, 0);
  result[peak].volume += totalVolume - sum;
  if (!totalVolume) return { bins: result, poc: null, val: null, vah: null, totalVolume };
  let left = peak,
    right = peak,
    accumulated = result[peak].volume;
  while (accumulated < totalVolume * valueArea && (left > 0 || right < bins - 1)) {
    const below = left ? result[left - 1].volume : -1;
    const above = right < bins - 1 ? result[right + 1].volume : -1;
    if (below >= above) accumulated += result[--left].volume;
    else accumulated += result[++right].volume;
  }
  return {
    bins: result,
    poc: result[peak].low + (result[peak].high - result[peak].low) / 2,
    val: result[left].low,
    vah: result[right].high,
    totalVolume,
  };
}
