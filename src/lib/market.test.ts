import { describe, expect, it } from 'vitest';
import {
  DATA_SOURCE,
  exportCSV,
  generateCandles,
  parseCSV,
  resampleCandles,
  validateCandles,
} from './market';

describe('simulated data', () => {
  it('is deterministic, valid, continuous and explicitly simulated', () => {
    const candles = generateCandles('XAUUSD', '5m', 30);
    expect(candles).toEqual(generateCandles('XAUUSD', '5m', 30));
    expect(candles).not.toEqual(generateCandles('XAUUSD', '5m', 30, 43));
    expect(DATA_SOURCE).toMatch(/SIMULATED/);
    expect(() => validateCandles(candles)).not.toThrow();
    expect(candles.slice(1).every((c, i) => c.open === candles[i].close)).toBe(true);
  });
  it('has identical OHLCV when resampling the shared base path', () => {
    expect(resampleCandles(generateCandles('XAUUSD', '5m', 600), '15m')).toEqual(
      generateCandles('XAUUSD', '15m', 200)
    );
    expect(resampleCandles(generateCandles('EURUSD', '5m', 576), '1D')).toEqual(
      generateCandles('EURUSD', '1D', 2)
    );
    expect(resampleCandles(generateCandles('BTCUSD', '5m', 96), '4h')).toEqual(
      generateCandles('BTCUSD', '4h', 2)
    );
  });
  it('does not mutate original candles on resampling', () => {
    const candles = generateCandles('BTCUSD', '5m', 6);
    const original = structuredClone(candles);
    resampleCandles(candles, '15m');
    expect(candles).toEqual(original);
  });
});

describe('CSV exchange', () => {
  const header = 'time,open,high,low,close,volume\n';
  it('roundtrips data and allows reordered quoted headers', () => {
    const candles = generateCandles('EURUSD', '1h', 10);
    expect(parseCSV(exportCSV(candles))).toEqual(candles);
    expect(parseCSV('"close",volume,time,low,high,open\n2,5,1000,1,3,2')[0].close).toBe(2);
  });
  it('normalizes explicit ISO and millisecond timestamps', () => {
    expect(parseCSV(header + '2026-01-01T00:00:00Z,2,3,1,2,5')[0].time).toBe(1767225600);
    expect(parseCSV(header + '1767225600000,2,3,1,2,5')[0].time).toBe(1767225600);
    expect(parseCSV(header + '2026-01-01T01:00:00+01:00,2,3,1,2,5')[0].time).toBe(1767225600);
  });
  it.each([
    '1000,2,1,1,2,5',
    '1000,2,3,1,2,-5',
    '1000,,3,1,2,5',
    '1000,2,Infinity,1,2,5',
    '1000,2,3,1,NaN,5',
    '1000,2,3,0,2,5',
    '2026-02-30T00:00:00Z,2,3,1,2,5',
    '2026-01-01 00:00:00,2,3,1,2,5',
    '1000,2,3,1,2,5,extra',
    '1000,2,3,1,2,5\n1000,2,3,1,2,5',
    '1001,2,3,1,2,5\n1000,2,3,1,2,5',
    '1000,1"2"3,200,1,2,5',
    '1000,"2"trailing,3,1,2,5',
  ])('rejects malformed values, impossible ranges and chronology: %s', (row) => {
    expect(() => parseCSV(header + row)).toThrow();
  });
  it('rejects missing/duplicate headers and datasets above 100k', () => {
    expect(() => parseCSV('time,open,high,low,close,close\n1000,2,3,1,2,5')).toThrow();
    expect(() =>
      parseCSV(header + Array.from({ length: 100_001 }, (_, i) => `${i},2,3,1,2,5`).join('\n'))
    ).toThrow(/100000/);
  });
  it('rejects total volume overflow and timestamps outside the supported calendar', () => {
    expect(() => parseCSV(header + '1000,100,101,99,100,1e308\n1300,100,101,99,100,1e308')).toThrow(
      /volume/
    );
    expect(() =>
      validateCandles([{ time: 9007199254740990, open: 1, high: 1, low: 1, close: 1, volume: 1 }])
    ).toThrow(/2100/);
  });
});
