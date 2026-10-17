import { describe, expect, it } from 'vitest';
import type { Candle } from '../types';
import { volumeProfile } from './volumeProfile';

const bar = (time: number, low: number, high: number, volume: number): Candle => ({
  time,
  low,
  high,
  open: low,
  close: high,
  volume,
});

describe('estimated fixed-range volume profile', () => {
  it('uniformly allocates overlap and conserves known candle volume', () => {
    const result = volumeProfile([bar(0, 1, 5, 40), bar(300, 1, 3, 20)], 0, 300, 4);
    expect(result.bins.map((b) => b.volume)).toEqual([20, 20, 10, 10]);
    expect(result.totalVolume).toBe(60);
    expect(result.poc).toBe(1.5);
    expect(result.val).toBe(1);
    expect(result.vah).toBe(4); // 50/60 exceeds the requested 70%.
  });
  it('assigns flat candles to one bin including the highest edge', () => {
    const result = volumeProfile([bar(0, 1, 5, 40), bar(300, 5, 5, 20)], 0, 300, 4);
    expect(result.bins.map((b) => b.volume)).toEqual([10, 10, 10, 30]);
    expect(result.poc).toBe(4.5);
    expect(volumeProfile([bar(0, 2, 2, 50)], 0, 0).bins).toEqual([{ low: 2, high: 2, volume: 50 }]);
  });
  it('excludes bars outside the inclusive user range and never adds future candles', () => {
    const data = [bar(0, 1, 2, 10), bar(300, 2, 3, 20), bar(600, 3, 4, 1000)];
    const selected = volumeProfile(data, 0, 300, 2);
    expect(selected.totalVolume).toBe(30);
    expect(selected).toEqual(volumeProfile(data.slice(0, 2), 0, 300, 2));
    expect(volumeProfile(data, 300, 300).totalVolume).toBe(20);
  });
  it('handles empty and zero-volume selections without invented POC prices', () => {
    expect(volumeProfile([], 0, 300)).toEqual({
      bins: [],
      poc: null,
      val: null,
      vah: null,
      totalVolume: 0,
    });
    expect(volumeProfile([bar(0, 1, 2, 0)], 0, 300).poc).toBeNull();
  });
  it('conserves volume over irregular fractional price overlaps', () => {
    const data = Array.from({ length: 100 }, (_, i) =>
      bar(i * 300, 100 + i * 0.003, 100.17 + i * 0.003, 1234.56 + i)
    );
    const result = volumeProfile(data, 0, 100_000, 37, 1);
    expect(result.bins.every((b) => b.volume >= 0 && Number.isFinite(b.volume))).toBe(true);
    expect(result.bins.reduce((sum, b) => sum + b.volume, 0)).toBeCloseTo(result.totalVolume, 7);
    expect(result.val).toBe(data[0].low);
    expect(result.vah).toBe(data[data.length - 1].high);
  });
  it('rejects malformed or unbounded requests', () => {
    expect(() => volumeProfile([], 10, 0)).toThrow();
    expect(() => volumeProfile([], 0, 10, 129)).toThrow();
    expect(() => volumeProfile([], 0, 10, 3.2)).toThrow();
    expect(() => volumeProfile([], 0, 10, 32, 0)).toThrow();
    expect(() => volumeProfile([], 0, 10, 32, Infinity)).toThrow();
  });
});
