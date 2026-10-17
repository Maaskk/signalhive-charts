import type { Candle } from '../types';
import { validateCandles } from './market';

export interface LinePoint {
  time: number;
  value: number;
}
export interface PivotLevel extends LinePoint {
  kind: 'support' | 'resistance';
  pivotTime: number;
  confirmedAt: number;
}
export interface MacdResult {
  macd: LinePoint[];
  signal: LinePoint[];
  histogram: LinePoint[];
}
export interface BollingerResult {
  upper: LinePoint[];
  middle: LinePoint[];
  lower: LinePoint[];
}

function check(candles: readonly Candle[], period: number): void {
  validateCandles(candles);
  if (!Number.isInteger(period) || period < 1 || period > 100_000)
    throw new Error('Period must be an integer from 1 to 100000.');
}

/** SMA-seeded EMA; the warm-up region is omitted, not filled with zeros. */
export function ema(candles: readonly Candle[], period: number): LinePoint[] {
  check(candles, period);
  if (candles.length < period) return [];
  let value = candles.slice(0, period).reduce((sum, c) => sum + c.close / period, 0);
  const result = [{ time: candles[period - 1].time, value }];
  const alpha = 2 / (period + 1);
  for (let i = period; i < candles.length; i++) {
    value += alpha * (candles[i].close - value);
    result.push({ time: candles[i].time, value });
  }
  return result;
}

export function sma(candles: readonly Candle[], period: number): LinePoint[] {
  check(candles, period);
  const result: LinePoint[] = [];
  let sum = 0;
  candles.forEach((c, i) => {
    if (i >= period) sum -= candles[i - period].close / period;
    sum += c.close / period;
    if (i >= period - 1) result.push({ time: c.time, value: sum });
  });
  return result;
}

export function rsi(candles: readonly Candle[], period = 14): LinePoint[] {
  check(candles, period);
  if (candles.length <= period) return [];
  let gain = 0,
    loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    gain += Math.max(change, 0) / period;
    loss += Math.max(-change, 0) / period;
  }
  const value = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  const result = [{ time: candles[period].time, value: value() }];
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    gain += (Math.max(change, 0) - gain) / period;
    loss += (Math.max(-change, 0) - loss) / period;
    result.push({ time: candles[i].time, value: value() });
  }
  return result;
}

export function macd(
  candles: readonly Candle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MacdResult {
  check(candles, fast);
  check(candles, slow);
  check(candles, signalPeriod);
  if (fast >= slow) throw new Error('MACD fast period must be below slow period.');
  const fastLine = ema(candles, fast),
    slowLine = ema(candles, slow);
  const line = slowLine.map((point, index) => ({
    time: point.time,
    value: fastLine[index + slow - fast].value - point.value,
  }));
  const signal: LinePoint[] = [],
    histogram: LinePoint[] = [];
  if (line.length >= signalPeriod) {
    let average = line.slice(0, signalPeriod).reduce((sum, p) => sum + p.value / signalPeriod, 0);
    for (let i = signalPeriod - 1; i < line.length; i++) {
      if (i >= signalPeriod) {
        const alpha = 2 / (signalPeriod + 1);
        average = (1 - alpha) * average + alpha * line[i].value;
      }
      signal.push({ time: line[i].time, value: average });
      histogram.push({ time: line[i].time, value: line[i].value - average });
    }
  }
  return { macd: line, signal, histogram };
}

/** Population standard deviation; stable sliding Welford updates. */
export function bollinger(
  candles: readonly Candle[],
  period = 20,
  deviations = 2
): BollingerResult {
  check(candles, period);
  if (!Number.isFinite(deviations) || deviations <= 0)
    throw new Error('Band deviations must be positive.');
  const result: BollingerResult = { upper: [], middle: [], lower: [] };
  let mean = 0,
    m2 = 0,
    n = 0;
  candles.forEach((c, i) => {
    if (n === period) {
      if (period === 1) {
        mean = 0;
        m2 = 0;
        n = 0;
      } else {
        const removed = candles[i - period].close;
        const nextMean = mean + (mean - removed) / (period - 1);
        m2 = Math.max(0, m2 - (removed - mean) * (removed - nextMean));
        mean = nextMean;
        n--;
      }
    }
    n++;
    const delta = c.close - mean;
    mean += delta / n;
    m2 += delta * (c.close - mean);
    if (!Number.isFinite(m2))
      throw new Error('Price range is too large to calculate finite variance.');
    if (n === period) {
      const distance = deviations * Math.sqrt(Math.max(0, m2) / period);
      if (!Number.isFinite(mean + distance) || !Number.isFinite(mean - distance))
        throw new Error('Band range exceeds supported numbers.');
      result.middle.push({ time: c.time, value: mean });
      result.upper.push({ time: c.time, value: mean + distance });
      result.lower.push({ time: c.time, value: mean - distance });
    }
  });
  return result;
}

/** Wilder RMA of true range, including first candle's high-low as its true range. */
export function atr(candles: readonly Candle[], period = 14): LinePoint[] {
  check(candles, period);
  const result: LinePoint[] = [];
  let value = 0;
  candles.forEach((c, i) => {
    const previous = i ? candles[i - 1].close : c.open;
    const tr = i
      ? Math.max(c.high - c.low, Math.abs(c.high - previous), Math.abs(c.low - previous))
      : c.high - c.low;
    value = i < period ? value + tr / period : value + (tr - value) / period;
    if (i >= period - 1) result.push({ time: c.time, value });
  });
  return result;
}

/** Rays begin at confirmation, never at the historical pivot. Equal extremes are excluded. */
export function confirmedPivots(candles: readonly Candle[], radius = 3): PivotLevel[] {
  check(candles, radius);
  const result: PivotLevel[] = [];
  for (let i = radius; i + radius + 1 < candles.length; i++) {
    let resistance = true,
      support = true;
    for (let j = 1; j <= radius; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high)
        resistance = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low)
        support = false;
    }
    const time = candles[i + radius + 1].time;
    if (support)
      result.push({
        time,
        value: candles[i].low,
        kind: 'support',
        pivotTime: candles[i].time,
        confirmedAt: time,
      });
    if (resistance)
      result.push({
        time,
        value: candles[i].high,
        kind: 'resistance',
        pivotTime: candles[i].time,
        confirmedAt: time,
      });
  }
  return result;
}
