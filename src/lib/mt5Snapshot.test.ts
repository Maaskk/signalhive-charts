import { describe, expect, it } from 'vitest';
import { mt5SnapshotFreshness, parseMT5Snapshot } from './mt5Snapshot';

const time = 1_800_000_000;
function fixture() {
  return {
    version: 1,
    source: 'mt5',
    capturedAt: time,
    connected: true,
    demo: true,
    symbol: 'XAUUSD',
    timeframe: '15m',
    candles: [
      { time: time - 1800, open: 100, high: 103, low: 99, close: 102, volume: 10 },
      { time: time - 900, open: 102, high: 104, low: 100, close: 101, volume: 20 },
    ],
    quote: { bid: 101, ask: 101.1, time: time - 5 },
    spec: { decimals: 2, contractSize: 100, minLots: 0.01, lotStep: 0.01 },
    account: {
      balance: 50,
      equity: 49,
      freeMargin: 45,
      currency: 'USD',
      positionsCount: 1,
      ordersCount: 0,
    },
  };
}

describe('read-only MT5 snapshot boundary', () => {
  it('accepts a valid demo and copies only allowed fields, without retaining identifiers', () => {
    const value = fixture();
    const snapshot = parseMT5Snapshot({
      ...value,
      login: 'private',
      account: { ...value.account, name: 'private' },
    });
    expect(snapshot).toEqual(value);
    expect(snapshot).not.toBe(value);
    if (snapshot.connected) expect(snapshot.candles[0]).not.toBe(value.candles[0]);
    expect(JSON.stringify(snapshot)).not.toContain('private');
  });
  it('does not silently turn real or unknown accounts into demo data', () => {
    expect(() => parseMT5Snapshot({ ...fixture(), demo: false })).toThrow(/demo/);
    expect(() => parseMT5Snapshot({ ...fixture(), demo: undefined })).toThrow(/demo/);
    expect(() => parseMT5Snapshot({ ...fixture(), connected: 1 })).toThrow();
  });
  it('accepts generic disconnected status without retaining stale data', () => {
    expect(
      parseMT5Snapshot({ ...fixture(), connected: false, error: 'terminal_not_running' })
    ).toEqual({
      version: 1,
      source: 'mt5',
      capturedAt: time,
      connected: false,
      error: 'terminal_not_running',
    });
    expect(() =>
      parseMT5Snapshot({ ...fixture(), connected: false, error: 'private terminal details' })
    ).toThrow();
  });
  it.each([
    { version: 2 },
    { source: 'untrusted' },
    { capturedAt: NaN },
    { capturedAt: '1800000000' },
    { symbol: '' },
    { symbol: '<script>' },
    { timeframe: '1m' },
    { candles: [] },
    { quote: { bid: 100, ask: 99, time } },
    { quote: { bid: 0, ask: 1, time } },
    { quote: { bid: 1, ask: 2, time: time + 301 } },
    { spec: { decimals: 20, contractSize: 100, minLots: 0.01, lotStep: 0.01 } },
    { spec: { decimals: 2, contractSize: 0, minLots: 0.01, lotStep: 0.01 } },
    { spec: { decimals: 2, contractSize: 100, minLots: 0.01, lotStep: NaN } },
    {
      account: {
        balance: Infinity,
        equity: 50,
        freeMargin: 50,
        currency: 'USD',
        positionsCount: 0,
        ordersCount: 0,
      },
    },
    {
      account: {
        balance: 50,
        equity: 50,
        freeMargin: 50,
        currency: 'USD',
        positionsCount: -1,
        ordersCount: 0,
      },
    },
  ])('rejects malformed input %#', (change) => {
    expect(() => parseMT5Snapshot({ ...fixture(), ...change })).toThrow();
  });
  it('rejects duplicate/reversed timestamps, future bars, invalid OHLC and oversized data', () => {
    const value = fixture();
    for (const candles of [
      [value.candles[0], value.candles[0]],
      [...value.candles].reverse(),
      [value.candles[0], { ...value.candles[1], time: time + 301 }],
      [value.candles[0], { ...value.candles[1], high: 50 }],
      Array.from({ length: 601 }, (_, i) => ({ ...value.candles[0], time: time - 10000 + i })),
    ])
      expect(() => parseMT5Snapshot({ ...value, candles })).toThrow();
  });
  it('preserves finite negative account equity instead of hiding it', () => {
    const value = fixture();
    const snapshot = parseMT5Snapshot({
      ...value,
      account: { ...value.account, equity: -5, freeMargin: -10 },
    });
    if (!snapshot.connected) throw new Error('Connected expected');
    expect(snapshot.account.equity).toBe(-5);
  });
});

describe('snapshot versus market-quote freshness', () => {
  it('flags a weekend quote even when the exporter just refreshed its file', () => {
    const value = fixture();
    const snapshot = parseMT5Snapshot({
      ...value,
      quote: { ...value.quote, time: time - 100_000 },
    });
    expect(mt5SnapshotFreshness(snapshot, time + 2)).toEqual({
      snapshotStale: false,
      quoteStale: true,
      snapshotAge: 2,
      quoteAge: 100_002,
    });
  });
  it('flags a stopped exporter, disconnected status, and clock skew', () => {
    const snapshot = parseMT5Snapshot(fixture());
    expect(mt5SnapshotFreshness(snapshot, time + 20).snapshotStale).toBe(true);
    expect(mt5SnapshotFreshness(snapshot, time - 10).snapshotStale).toBe(true);
    const disconnected = parseMT5Snapshot({
      version: 1,
      source: 'mt5',
      capturedAt: time,
      connected: false,
      error: 'demo_required',
    });
    expect(mt5SnapshotFreshness(disconnected, time)).toMatchObject({
      snapshotStale: true,
      quoteStale: true,
      quoteAge: null,
    });
    expect(() => mt5SnapshotFreshness(snapshot, NaN)).toThrow();
  });
});
