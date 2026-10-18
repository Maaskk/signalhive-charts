import type { BarRange, DataProvider, OHLCV } from '@luxalgo/vela';
import {
  generateCandles,
  INSTRUMENT_BY_ID,
  TIMEFRAME_SECONDS,
  validateCandles,
} from '../lib/market';
import type { Candle, InstrumentId, Timeframe } from '../types';
import type { MT5ConnectedSnapshot } from '../lib/mt5Snapshot';

export type DataSource =
  | { kind: 'simulation' }
  | {
      kind: 'csv';
      name: string;
      symbol: InstrumentId;
      bars: Candle[];
      baseMinutes: number;
      id: string;
    }
  | { kind: 'mt5'; snapshot: MT5ConnectedSnapshot };
export const SIM_TIMEFRAMES = ['5', '15', '60', '240', '1D'];
export function parseCSVSource(value: unknown): Extract<DataSource, { kind: 'csv' }> {
  if (!value || typeof value !== 'object') throw new Error('Invalid CSV dataset.');
  const s = value as Record<string, unknown>;
  if (
    s.kind !== 'csv' ||
    !['XAUUSD', 'EURUSD', 'BTCUSD'].includes(String(s.symbol)) ||
    typeof s.name !== 'string' ||
    s.name.length > 255 ||
    typeof s.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(s.id) ||
    !Array.isArray(s.bars)
  )
    throw new Error('Invalid CSV dataset.');
  const bars = s.bars.map((b) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
  validateCandles(bars);
  if (inferBaseMinutes(bars) !== s.baseMinutes)
    throw new Error('CSV interval does not match its candles.');
  return {
    kind: 'csv',
    name: s.name,
    symbol: s.symbol as InstrumentId,
    id: s.id,
    bars,
    baseMinutes: s.baseMinutes as number,
  };
}
const simulations: Record<string, Timeframe> = {
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
  '1D': '1D',
};
export function timeframeMinutes(value: string): number {
  const match = /^(\d+)(D|W)?$/.exec(value);
  if (!match) throw new Error('Unsupported interval.');
  const n = Number(match[1]) * (match[2] === 'D' ? 1440 : match[2] === 'W' ? 10080 : 1);
  if (!Number.isSafeInteger(n) || n < 1 || n > 525600) throw new Error('Unsupported interval.');
  return n;
}
export function inferBaseMinutes(bars: Candle[]): number {
  validateCandles(bars);
  if (bars.length < 2) throw new Error('Import at least two candles.');
  const counts = new Map<number, number>();
  for (let i = 1; i < bars.length; i++) {
    const delta = (bars[i].time - bars[i - 1].time) / 60;
    if (Number.isSafeInteger(delta) && delta > 0) counts.set(delta, (counts.get(delta) ?? 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const step = ranked[0]?.[0];
  if (!step || bars.some((b, i) => i > 0 && (b.time - bars[i - 1].time) % (step * 60) !== 0))
    throw new Error(
      'CSV spacing is irregular or below one minute. Import candles on a consistent minute interval.'
    );
  return step;
}
export function aggregate(bars: readonly Candle[], minutes: number, baseMinutes: number): Candle[] {
  if (minutes < baseMinutes || minutes % baseMinutes)
    throw new Error('A lower or incompatible interval cannot be reconstructed from these candles.');
  if (minutes === baseMinutes) return [...bars];
  const output: Candle[] = [];
  const seconds = minutes * 60;
  for (const c of bars) {
    const time = Math.floor(c.time / seconds) * seconds;
    const last = output.at(-1);
    if (last?.time === time) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else output.push({ ...c, time });
  }
  return output;
}
export function sourceKey(source: DataSource) {
  return source.kind === 'csv'
    ? `csv-${source.id}`
    : source.kind === 'mt5'
      ? `mt5-${sourceSymbol(source)}-${source.snapshot.timeframe}`
      : source.kind;
}
export function sourceTimeframes(source: DataSource) {
  if (source.kind === 'simulation') return SIM_TIMEFRAMES;
  const base =
    source.kind === 'mt5' ? TIMEFRAME_SECONDS[source.snapshot.timeframe] / 60 : source.baseMinutes;
  return [
    ...new Set([
      String(base),
      ...['5', '15', '30', '60', '120', '240', '1D'].filter(
        (v) => timeframeMinutes(v) >= base && timeframeMinutes(v) % base === 0
      ),
    ]),
  ];
}
export function sourceSymbol(source: DataSource): InstrumentId {
  if (source.kind === 'simulation') return 'XAUUSD';
  if (source.kind === 'csv') return source.symbol;
  if (!Object.hasOwn(INSTRUMENT_BY_ID, source.snapshot.symbol))
    throw new Error(
      'This MT5 symbol is not supported yet. Expected exact XAUUSD, EURUSD or BTCUSD.'
    );
  return source.snapshot.symbol as InstrumentId;
}
export function sourceCandles(source: DataSource, ticker: string, timeframe: string): Candle[] {
  if (!Object.hasOwn(INSTRUMENT_BY_ID, ticker))
    throw new Error('This source does not contain that symbol.');
  if (source.kind === 'simulation') {
    const tf = simulations[timeframe];
    if (!tf) throw new Error('Available simulated intervals: 5m, 15m, 1h, 4h and 1D.');
    return generateCandles(ticker as InstrumentId, tf, 1500);
  }
  if (ticker !== sourceSymbol(source)) throw new Error('This source does not contain that symbol.');
  return aggregate(
    source.kind === 'csv' ? source.bars : source.snapshot.candles,
    timeframeMinutes(timeframe),
    source.kind === 'csv' ? source.baseMinutes : TIMEFRAME_SECONDS[source.snapshot.timeframe] / 60
  );
}
/** Own provider: no credentials, no external network, no silent fallback. */
export class WorkbenchProvider implements DataProvider {
  private source: DataSource;
  private cache = new Map<string, Candle[]>();
  private subscribers = new Set<{
    ticker: string;
    timeframe: string;
    callback: (bar: OHLCV) => void;
  }>();
  constructor(source: DataSource) {
    sourceSymbol(source);
    this.source = source;
  }
  updateSnapshot(snapshot: MT5ConnectedSnapshot) {
    if (this.source.kind !== 'mt5') return;
    if (
      snapshot.timeframe !== this.source.snapshot.timeframe ||
      snapshot.symbol !== this.source.snapshot.symbol
    )
      throw new Error('MT5 market changed. Reconnect this data source.');
    const changed =
      JSON.stringify(this.source.snapshot.candles) !== JSON.stringify(snapshot.candles);
    const previous = new Map(
      [...this.subscribers].map((s) => [s, this.bars(s.ticker, s.timeframe).at(-1)?.time])
    );
    this.source = { kind: 'mt5', snapshot };
    if (!changed) return;
    this.cache.clear();
    for (const s of this.subscribers) {
      const since = previous.get(s);
      const bars = this.bars(s.ticker, s.timeframe);
      for (const bar of since === undefined ? bars.slice(-1) : bars.filter((b) => b.time >= since))
        s.callback({ ...bar, time: bar.time * 1000 });
    }
  }
  private bars(ticker: string, timeframe: string) {
    const key = `${ticker}:${timeframe}`;
    let bars = this.cache.get(key);
    if (!bars) {
      bars = sourceCandles(this.source, ticker, timeframe);
      this.cache.set(key, bars);
    }
    return bars;
  }
  async getBars(ticker: string, timeframe: string, range: BarRange): Promise<OHLCV[]> {
    const limit = Math.min(100000, Math.max(1, range.limit ?? 600));
    return this.bars(ticker, timeframe)
      .filter(
        (b) =>
          (range.from === undefined || b.time * 1000 >= range.from) &&
          (range.to === undefined || b.time * 1000 <= range.to)
      )
      .slice(-limit)
      .map((b) => ({ ...b, time: b.time * 1000 }));
  }
  async listSymbols() {
    return (
      this.source.kind === 'simulation'
        ? Object.values(INSTRUMENT_BY_ID)
        : [INSTRUMENT_BY_ID[sourceSymbol(this.source)]]
    ).map((i) => ({
      ticker: i.id,
      description: `${i.name} · ${this.source.kind === 'simulation' ? 'SIMULATED' : this.source.kind === 'csv' ? 'CSV' : 'MT5 DEMO'}`,
      type: i.category,
    }));
  }
  async getSymbolInfo(ticker: string) {
    const i = INSTRUMENT_BY_ID[ticker as InstrumentId];
    if (!i || (this.source.kind !== 'simulation' && ticker !== sourceSymbol(this.source)))
      return undefined;
    const decimals = this.source.kind === 'mt5' ? this.source.snapshot.spec.decimals : i.decimals;
    return {
      ticker,
      description: i.name,
      currency: 'USD',
      timezone: 'Etc/UTC',
      mintick: 10 ** -decimals,
      pricescale: 10 ** decimals,
      pointvalue: 1,
      minmove: 1,
      type: ticker === 'BTCUSD' ? 'crypto' : 'forex',
    };
  }
  info() {
    return {
      name: 'signalhive',
      displayName:
        this.source.kind === 'simulation'
          ? 'Simulated'
          : this.source.kind === 'csv'
            ? 'Imported CSV'
            : 'MT5 demo',
      supportedTimeframes: sourceTimeframes(this.source),
      capabilities: { enumerate: true, stream: this.source.kind === 'mt5', symbolInfo: true },
    };
  }
  subscribe(ticker: string, timeframe: string, callback: (bar: OHLCV) => void) {
    const subscription = { ticker, timeframe, callback };
    this.subscribers.add(subscription);
    return () => this.subscribers.delete(subscription);
  }
  destroy() {
    this.subscribers.clear();
    this.cache.clear();
  }
}
