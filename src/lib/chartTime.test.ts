import { describe, expect, it } from 'vitest';
import { indexToTime, timeToIndex } from './chartTime';
const bars = [1000, 1300, 5000, 5300].map((time) => ({
  time,
  open: 1,
  high: 1,
  low: 1,
  close: 1,
  volume: 0,
}));
describe('chart calendar coordinates', () => {
  it('handles missing trading sessions and fractional anchors without shifting drawings', () => {
    expect(timeToIndex(bars, 5000)).toBe(2);
    expect(timeToIndex(bars, 3150)).toBe(1.5);
    expect(indexToTime(bars, 1.5)).toBe(3150);
  });
  it('extrapolates future and earlier anchors and roundtrips them', () => {
    for (const time of [100, 1000, 1100, 3150, 5000, 5500, 11000])
      expect(indexToTime(bars, timeToIndex(bars, time))).toBeCloseTo(time, 8);
  });
});
