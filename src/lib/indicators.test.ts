import { describe, expect, it } from 'vitest';
import type { Candle } from '../types';
import { atr, bollinger, confirmedPivots, ema, macd, rsi, sma } from './indicators';

const bars = (values: number[]): Candle[] =>
  values.map((close, i) => ({
    time: i * 300,
    open: close,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 10,
  }));

describe('moving averages and oscillators', () => {
  it('uses SMA seed, known EMA recurrence and omits warmup', () => {
    expect(ema(bars([1, 2, 3, 4, 5]), 3)).toEqual([
      { time: 600, value: 2 },
      { time: 900, value: 3 },
      { time: 1200, value: 4 },
    ]);
    expect(sma(bars([1, 2, 6, 4]), 2).map((p) => p.value)).toEqual([1.5, 4, 5]);
    expect(ema(bars([1, 2]), 3)).toEqual([]);
  });
  it('matches manually calculated Wilder RSI values', () => {
    const result = rsi(bars([1, 2, 3, 2, 4, 3]), 3);
    expect(result[0].value).toBeCloseTo(200 / 3, 10);
    expect(result[1].value).toBeCloseTo(250 / 3, 10);
    expect(result[2].value).toBeCloseTo(2000 / 33, 10);
  });
  it('handles monotonic and flat RSI without NaNs', () => {
    expect(rsi(bars([1, 2, 3, 4]), 3)[0].value).toBe(100);
    expect(rsi(bars([4, 3, 2, 1]), 3)[0].value).toBe(0);
    expect(rsi(bars([2, 2, 2, 2]), 3)[0].value).toBe(50);
  });
  it('matches the classic 14-period RSI gain/loss seed', () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28, 46.28,
    ];
    expect(rsi(bars(closes))[0].value).toBeCloseTo((100 * 3.34) / (3.34 + 1.4), 10);
  });
  it('MACD aligns two differently seeded EMA series and EMA signal', () => {
    const result = macd(bars([1, 2, 3, 4, 5, 6]), 2, 3, 2);
    expect(result.macd.map((p) => p.value)).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(result.signal[0]).toEqual({ time: 900, value: 0.5 });
    expect(result.histogram.every((p) => p.value === 0)).toBe(true);
    expect(macd(bars([1]), 2, 3, 2)).toEqual({ macd: [], signal: [], histogram: [] });
  });
  it('Bollinger bands use population variance and slide accurately', () => {
    const result = bollinger(bars([1, 2, 3, 4]), 3, 2);
    expect(result.middle.map((p) => p.value)).toEqual([2, 3]);
    expect(result.upper[0].value).toBeCloseTo(2 + 2 * Math.sqrt(2 / 3), 12);
    expect(result.lower[1].value).toBeCloseTo(3 - 2 * Math.sqrt(2 / 3), 12);
    expect(bollinger(bars([5, 5]), 1).upper.map((p) => p.value)).toEqual([5, 5]);
  });
  it('ATR includes gap true range and follows Wilder smoothing', () => {
    const candles = bars([2, 3, 5, 6]).map((b, i) => ({
      ...b,
      high: [3, 4, 6, 7][i],
      low: [1, 2, 3, 4][i],
    }));
    const result = atr(candles, 3);
    expect(result[0].value).toBeCloseTo(7 / 3, 12);
    expect(result[1].value).toBeCloseTo(23 / 9, 12);
  });
  it('rejects invalid periods/data instead of creating misleading zero series', () => {
    expect(() => ema(bars([1]), 0)).toThrow();
    expect(() => rsi(bars([1]), 1.5)).toThrow();
    expect(() => macd(bars([1]), 26, 12)).toThrow();
    expect(() => bollinger(bars([1]), 2, NaN)).toThrow();
    expect(() => sma([{ ...bars([1])[0], close: NaN }], 2)).toThrow();
    expect(() => bollinger(bars([1e200, 2e200]), 2)).toThrow(/variance/);
  });
  it('never changes past outputs when future candles are appended', () => {
    const data = bars(Array.from({ length: 80 }, (_, i) => 10 + Math.sin(i) + i / 10));
    for (const calculate of [
      (c: Candle[]) => ema(c, 9),
      (c: Candle[]) => rsi(c),
      (c: Candle[]) => atr(c),
      (c: Candle[]) => bollinger(c).upper,
    ]) {
      const past = calculate(data.slice(0, 50));
      expect(calculate(data).filter((p) => p.time <= data[49].time)).toEqual(past);
    }
  });
});

describe('confirmed support/resistance', () => {
  it('does not backdate a pivot before its right-hand candles have closed', () => {
    const data = bars([2, 4, 2, 3, 2]);
    expect(confirmedPivots(data.slice(0, 3), 1)).toEqual([]);
    const first = confirmedPivots(data.slice(0, 4), 1);
    expect(first.find((p) => p.kind === 'resistance')).toEqual({
      time: 900,
      confirmedAt: 900,
      pivotTime: 300,
      value: 4.5,
      kind: 'resistance',
    });
    expect(confirmedPivots(data, 1).filter((p) => p.time <= 900)).toEqual(first);
  });
  it('excludes equal highs/lows', () => {
    expect(confirmedPivots(bars([2, 4, 4, 2, 2]), 1)).toEqual([]);
  });
});
