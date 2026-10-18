import type { Candle, Timeframe } from '../types';
import { validateCandles } from './market';

export const MT5_SNAPSHOT_ERRORS = [
  'unsupported_platform',
  'terminal_not_running',
  'sdk_unavailable',
  'attach_failed',
  'terminal_mismatch',
  'demo_required',
  'account_changed',
  'terminal_disconnected',
  'snapshot_unavailable',
  'snapshot_invalid',
] as const;
export type MT5SnapshotError = (typeof MT5_SNAPSHOT_ERRORS)[number];
interface SnapshotBase {
  version: 1;
  source: 'mt5';
  capturedAt: number;
}
export interface MT5ConnectedSnapshot extends SnapshotBase {
  connected: true;
  demo: true;
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  quote: { bid: number; ask: number; time: number };
  spec: { decimals: number; contractSize: number; minLots: number; lotStep: number };
  account: {
    balance: number;
    equity: number;
    freeMargin: number;
    currency: string;
    positionsCount: number;
    ordersCount: number;
  };
}
export interface MT5DisconnectedSnapshot extends SnapshotBase {
  connected: false;
  error: MT5SnapshotError;
}
export type MT5Snapshot = MT5ConnectedSnapshot | MT5DisconnectedSnapshot;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid MT5 snapshot object.');
  return value as Record<string, unknown>;
}
function numeric(value: unknown, minimum = -Infinity, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new Error('Invalid MT5 numeric field.');
  return value;
}
function timestamp(value: unknown): number {
  const time = numeric(value, 1, true);
  if (time > 4102444800) throw new Error('MT5 timestamp exceeds the supported calendar.');
  return time;
}

/** Validate untrusted local JSON and copy only the documented fields; discard identifiers. */
export function parseMT5Snapshot(value: unknown): MT5Snapshot {
  const input = record(value);
  if (input.version !== 1 || input.source !== 'mt5') throw new Error('Unsupported MT5 snapshot.');
  const base: SnapshotBase = { version: 1, source: 'mt5', capturedAt: timestamp(input.capturedAt) };
  if (input.connected === false) {
    if (!(MT5_SNAPSHOT_ERRORS as readonly unknown[]).includes(input.error))
      throw new Error('Unknown MT5 snapshot status.');
    return { ...base, connected: false, error: input.error as MT5SnapshotError };
  }
  if (input.connected !== true || input.demo !== true)
    throw new Error('An MT5 demo snapshot is required.');
  if (typeof input.symbol !== 'string' || !/^[A-Za-z0-9_.#-]{1,32}$/.test(input.symbol))
    throw new Error('Invalid MT5 symbol.');
  if (!(['5m', '15m', '1h', '4h', '1D'] as unknown[]).includes(input.timeframe))
    throw new Error('Unsupported MT5 timeframe.');
  if (!Array.isArray(input.candles) || input.candles.length < 2 || input.candles.length > 600)
    throw new Error('MT5 snapshots require 2–600 candles.');
  const candles = input.candles.map((value): Candle => {
    const c = record(value);
    return {
      time: timestamp(c.time),
      open: numeric(c.open),
      high: numeric(c.high),
      low: numeric(c.low),
      close: numeric(c.close),
      volume: numeric(c.volume, 0),
    };
  });
  validateCandles(candles);
  if (candles.at(-1)!.time > base.capturedAt + 300)
    throw new Error('MT5 candles are from the future.');
  const q = record(input.quote);
  const quote = {
    bid: numeric(q.bid, Number.MIN_VALUE),
    ask: numeric(q.ask, Number.MIN_VALUE),
    time: timestamp(q.time),
  };
  if (quote.ask < quote.bid || quote.time > base.capturedAt + 300)
    throw new Error('Invalid MT5 quote.');
  const s = record(input.spec);
  const decimals = numeric(s.decimals, 0, true);
  if (decimals > 10) throw new Error('Unsupported MT5 price precision.');
  const spec = {
    decimals,
    contractSize: numeric(s.contractSize, Number.MIN_VALUE),
    minLots: numeric(s.minLots, Number.MIN_VALUE),
    lotStep: numeric(s.lotStep, Number.MIN_VALUE),
  };
  const a = record(input.account);
  if (typeof a.currency !== 'string' || !/^[A-Za-z0-9]{2,12}$/.test(a.currency))
    throw new Error('Invalid MT5 account currency.');
  const account = {
    balance: numeric(a.balance),
    equity: numeric(a.equity),
    freeMargin: numeric(a.freeMargin),
    currency: a.currency,
    positionsCount: numeric(a.positionsCount, 0, true),
    ordersCount: numeric(a.ordersCount, 0, true),
  };
  return {
    ...base,
    connected: true,
    demo: true,
    symbol: input.symbol,
    timeframe: input.timeframe as Timeframe,
    candles,
    quote,
    spec,
    account,
  };
}

/** Quote freshness is separate from file freshness: a weekend feed remains visibly stale. */
export function mt5SnapshotFreshness(
  snapshot: MT5Snapshot,
  nowSeconds = Date.now() / 1000,
  maxSnapshotAge = 10,
  maxQuoteAge = 60
): { snapshotStale: boolean; quoteStale: boolean; snapshotAge: number; quoteAge: number | null } {
  if (
    !Number.isFinite(nowSeconds) ||
    !Number.isFinite(maxSnapshotAge) ||
    !Number.isFinite(maxQuoteAge) ||
    maxSnapshotAge < 0 ||
    maxQuoteAge < 0
  )
    throw new Error('Invalid freshness clock or threshold.');
  const snapshotAge = Math.max(0, nowSeconds - snapshot.capturedAt);
  const quoteAge = snapshot.connected ? Math.max(0, nowSeconds - snapshot.quote.time) : null;
  return {
    snapshotStale:
      !snapshot.connected || snapshotAge > maxSnapshotAge || snapshot.capturedAt > nowSeconds + 5,
    quoteStale:
      !snapshot.connected ||
      quoteAge === null ||
      quoteAge > maxQuoteAge ||
      (snapshot.connected && snapshot.quote.time > nowSeconds + 5),
    snapshotAge,
    quoteAge,
  };
}
