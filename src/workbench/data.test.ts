import { describe, it, expect } from 'vitest';
import {
  aggregate,
  inferBaseMinutes,
  parseCSVSource,
  sourceCandles,
  sourceTimeframes,
  WorkbenchProvider,
} from './data';
import type { Candle } from '../types';
import type { MT5ConnectedSnapshot } from '../lib/mt5Snapshot';
const bars: Candle[] = Array.from({ length: 6 }, (_, i) => ({
  time: 1800000000 + i * 60,
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: 101 + i,
  volume: 10 + i,
}));
const csv = {
  kind: 'csv',
  id: 'test',
  name: 'test.csv',
  symbol: 'XAUUSD',
  baseMinutes: 1,
  bars,
} as const;
function mt5(candles = bars): MT5ConnectedSnapshot {
  return {
    version: 1,
    source: 'mt5',
    connected: true,
    demo: true,
    symbol: 'XAUUSD',
    timeframe: '5m',
    capturedAt: 1800000000,
    candles,
    quote: { bid: 100, ask: 101, time: 1800000000 },
    spec: { decimals: 2, contractSize: 100, minLots: 0.01, lotStep: 0.01 },
    account: {
      balance: 50,
      equity: 50,
      freeMargin: 50,
      currency: 'USD',
      positionsCount: 0,
      ordersCount: 0,
    },
  };
}
describe('isolated workbench market data', () => {
  it('validates imported backups and drops unknown fields', () => {
    expect(parseCSVSource({ ...csv, privateExtra: 'not retained' })).toEqual(csv);
    expect(() => parseCSVSource({ ...csv, baseMinutes: 15 })).toThrow(/interval/);
    expect(() => parseCSVSource({ ...csv, bars: [null] })).toThrow();
    expect(
      () => new WorkbenchProvider({ kind: 'mt5', snapshot: { ...mt5(), symbol: 'UNKNOWN' } })
    ).toThrow(/not supported/);
  });
  it('resamples OHLC and conserves volume without filling absent candles', () => {
    const result = aggregate(bars, 5, 1);
    expect(result).toEqual([
      { time: 1800000000, open: 100, high: 106, low: 99, close: 105, volume: 60 },
      { ...bars[5] },
    ]);
    expect(result.reduce((n, b) => n + b.volume, 0)).toBe(bars.reduce((n, b) => n + b.volume, 0));
    expect(() => aggregate(bars, 1, 5)).toThrow(/lower/);
    expect(() => aggregate(bars, 7, 5)).toThrow(/incompatible/);
  });
  it('detects regular base spacing including missing whole bars, rejects irregular gaps', () => {
    expect(inferBaseMinutes(bars.filter((_, i) => i !== 3))).toBe(1);
    expect(() =>
      inferBaseMinutes([...bars.slice(0, 3), { ...bars[3], time: bars[3].time + 1 }])
    ).toThrow(/irregular/);
  });
  it('never invents other symbols or lower intervals in imported/MT5 sources', () => {
    expect(() => sourceCandles(csv, 'EURUSD', '5')).toThrow(/symbol/);
    expect(sourceTimeframes({ kind: 'mt5', snapshot: mt5() })).toContain('5');
    expect(
      sourceTimeframes({ kind: 'mt5', snapshot: { ...mt5(), timeframe: '1h' } })
    ).not.toContain('15');
  });
  it('serves epoch milliseconds with inclusive bounds and bounded history', async () => {
    const p = new WorkbenchProvider(csv);
    expect(
      await p.getBars('XAUUSD', '1', {
        from: bars[1].time * 1000,
        to: bars[3].time * 1000,
        limit: 2,
      })
    ).toEqual(bars.slice(2, 4).map((b) => ({ ...b, time: b.time * 1000 })));
    expect(await p.getSymbolInfo('EURUSD')).toBeUndefined();
    p.destroy();
  });
  it('streams the changed forming candle and every missed new bar, then unsubscribes', () => {
    const spaced = bars.map((b, i) => ({ ...b, time: bars[0].time + i * 300 }));
    const p = new WorkbenchProvider({ kind: 'mt5', snapshot: mt5(spaced.slice(0, 3)) });
    const received: number[] = [];
    const off = p.subscribe('XAUUSD', '5', (b) => received.push(b.time));
    p.updateSnapshot(mt5(spaced));
    expect(received).toEqual(spaced.slice(2).map((b) => b.time * 1000));
    p.updateSnapshot(mt5(spaced));
    expect(received).toHaveLength(4);
    off();
    p.updateSnapshot(mt5(spaced.slice(0, 5)));
    expect(received).toHaveLength(4);
    expect(() => p.updateSnapshot({ ...mt5(), symbol: 'EURUSD' })).toThrow(/market changed/);
    p.destroy();
  });
});
