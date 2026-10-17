import type { Candle, Instrument, InstrumentId, Timeframe } from '../types';

export const INSTRUMENTS: Instrument[] = [
  {
    id: 'XAUUSD',
    name: 'Gold / US Dollar',
    category: 'Simulated metal',
    decimals: 2,
    contractSize: 100,
    minLots: 0.01,
    lotStep: 0.01,
  },
  {
    id: 'EURUSD',
    name: 'Euro / US Dollar',
    category: 'Simulated forex',
    decimals: 5,
    contractSize: 100_000,
    minLots: 0.01,
    lotStep: 0.01,
  },
  {
    id: 'BTCUSD',
    name: 'Bitcoin / US Dollar',
    category: 'Simulated crypto',
    decimals: 2,
    contractSize: 1,
    minLots: 0.001,
    lotStep: 0.001,
  },
];
export const INSTRUMENT_BY_ID = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i])) as Record<
  InstrumentId,
  Instrument
>;
export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
};
export const DATA_SOURCE =
  'SIMULATED — seeded synthetic OHLCV, not live or historical market prices';
export const DEMO_END_TIME = Date.UTC(2026, 9, 16) / 1000;
export const MAX_CANDLES = 100_000;

export function validateCandles(candles: readonly Candle[]): void {
  if (!Array.isArray(candles) || candles.length > MAX_CANDLES)
    throw new Error(`At most ${MAX_CANDLES} candles are supported.`);
  let previous = -1;
  let totalVolume = 0;
  candles.forEach((c, index) => {
    if (
      !c ||
      ![c.time, c.open, c.high, c.low, c.close, c.volume].every(
        (v) => typeof v === 'number' && Number.isFinite(v)
      )
    )
      throw new Error(`Candle ${index + 1}: all six fields must be finite numbers.`);
    if (!Number.isSafeInteger(c.time) || c.time < 0 || c.time > 4102444800 || c.time <= previous)
      throw new Error(
        `Candle ${index + 1}: timestamps must be integer UTC seconds from 1970 to 2100 in strictly increasing order.`
      );
    if (
      c.low <= 0 ||
      c.high < c.low ||
      c.high < Math.max(c.open, c.close) ||
      c.low > Math.min(c.open, c.close) ||
      c.volume < 0
    )
      throw new Error(
        `Candle ${index + 1}: invalid OHLC range, positive prices or nonnegative volume.`
      );
    previous = c.time;
    totalVolume += c.volume;
    if (!Number.isFinite(totalVolume))
      throw new Error('Total candle volume exceeds the supported numeric range.');
  });
}

function randomAt(index: number, seed: number): number {
  let x = (index ^ seed) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** A deterministic historical simulation. Every timeframe aggregates the same 5-minute path. */
export function generateCandles(
  id: InstrumentId,
  timeframe: Timeframe,
  count = 600,
  seed = 42
): Candle[] {
  const instrument = INSTRUMENT_BY_ID[id];
  const seconds = TIMEFRAME_SECONDS[timeframe];
  if (!Object.hasOwn(INSTRUMENT_BY_ID, id) || !Object.hasOwn(TIMEFRAME_SECONDS, timeframe))
    throw new Error('Unknown instrument or timeframe.');
  if (!Number.isInteger(count) || count < 1 || count > 5000 || !Number.isSafeInteger(seed))
    throw new Error('Simulation requires 1–5000 candles and an integer seed.');
  const baseline = { XAUUSD: 4180, EURUSD: 1.085, BTCUSD: 68_000 }[id];
  const salt = seed ^ { XAUUSD: 1957, EURUSD: 8071, BTCUSD: 4561 }[id];
  const round = (value: number) => Number(value.toFixed(instrument.decimals));
  const price = (i: number) =>
    round(
      baseline *
        Math.exp(
          0.007 * Math.sin(i / 1750 + salt) +
            0.003 * Math.sin(i / 117) +
            0.0005 * Math.sin(i / 9) +
            0.0003 * (randomAt(i, salt) - 0.5)
        )
    );
  const result: Candle[] = [];
  for (let time = DEMO_END_TIME - count * seconds; time < DEMO_END_TIME; time += seconds) {
    let open = 0,
      high = -Infinity,
      low = Infinity,
      close = 0,
      volume = 0;
    for (let t = time; t < time + seconds; t += 300) {
      const i = Math.floor(t / 300);
      const o = price(i),
        c = price(i + 1);
      const wick = baseline * (0.00003 + randomAt(i, salt + 3) * 0.00012);
      if (t === time) open = o;
      high = Math.max(high, round(Math.max(o, c) + wick));
      low = Math.min(low, round(Math.min(o, c) - wick));
      close = c;
      volume += 100 + Math.floor(randomAt(i, salt + 11) * 4900);
    }
    result.push({ time, open, high, low, close, volume });
  }
  return result;
}

/** Buckets in UTC; partial edge buckets are retained, never invented or forward-filled. */
export function resampleCandles(candles: readonly Candle[], timeframe: Timeframe): Candle[] {
  validateCandles(candles);
  const interval = TIMEFRAME_SECONDS[timeframe];
  if (!Object.hasOwn(TIMEFRAME_SECONDS, timeframe)) throw new Error('Unknown timeframe.');
  const result: Candle[] = [];
  for (const candle of candles) {
    const time = Math.floor(candle.time / interval) * interval;
    const last = result[result.length - 1];
    if (last?.time === time) {
      last.high = Math.max(last.high, candle.high);
      last.low = Math.min(last.low, candle.low);
      last.close = candle.close;
      last.volume += candle.volume;
      if (!Number.isFinite(last.volume))
        throw new Error('Aggregated volume exceeds the supported numeric range.');
    } else result.push({ ...candle, time });
  }
  return result;
}

function fields(line: string): string[] {
  const result: string[] = [];
  let value = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        closed = true;
      } else if (!closed && !value.trim()) {
        quoted = true;
        value = '';
      } else throw new Error('Unexpected quote in CSV field.');
    } else if (character === ',' && !quoted) {
      result.push(value.trim());
      value = '';
      closed = false;
    } else if (closed && !/\s/.test(character))
      throw new Error('Unexpected text after a quoted CSV field.');
    else if (!closed) value += character;
  }
  if (quoted) throw new Error('Unclosed CSV quote. Multiline fields are not supported.');
  result.push(value.trim());
  return result;
}

function numeric(value: string, name: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
    throw new Error(`Invalid numeric ${name}.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Nonfinite ${name}.`);
  return number;
}

function timestamp(value: string): number {
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    const seconds = n >= 1_000_000_000_000 ? n / 1000 : n;
    if (!Number.isSafeInteger(seconds))
      throw new Error('Timestamp must resolve to whole UTC seconds.');
    return seconds;
  }
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.000)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts)
    throw new Error(
      'Time must be Unix seconds/milliseconds or ISO 8601 with seconds and explicit timezone.'
    );
  const [, year, month, day, hour, minute, second, zone] = parts;
  const y = Number(year),
    m = Number(month),
    d = Number(day);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (
    y < 1970 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > days ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59))
  )
    throw new Error('Invalid calendar timestamp.');
  const parsed = Date.parse(value) / 1000;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Invalid calendar timestamp.');
  return parsed;
}

export function parseCSV(text: string): Candle[] {
  if (typeof text !== 'string' || text.length > 32_000_000)
    throw new Error('CSV must be text of at most 32 MB.');
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length) throw new Error('CSV is empty.');
  const headers = fields(lines[0]).map((v) => v.toLowerCase());
  const required = ['time', 'open', 'high', 'low', 'close', 'volume'];
  if (
    headers.length !== 6 ||
    new Set(headers).size !== 6 ||
    required.some((v) => !headers.includes(v))
  )
    throw new Error('CSV requires exactly these six headers: time,open,high,low,close,volume.');
  if (lines.length - 1 > MAX_CANDLES) throw new Error(`CSV exceeds ${MAX_CANDLES} candles.`);
  const candles = lines.slice(1).map((line, index) => {
    try {
      const cells = fields(line);
      if (cells.length !== 6) throw new Error('Expected six columns.');
      const get = (name: string) => cells[headers.indexOf(name)];
      return {
        time: timestamp(get('time')),
        open: numeric(get('open'), 'open'),
        high: numeric(get('high'), 'high'),
        low: numeric(get('low'), 'low'),
        close: numeric(get('close'), 'close'),
        volume: numeric(get('volume'), 'volume'),
      };
    } catch (error) {
      throw new Error(`CSV row ${index + 2}: ${(error as Error).message}`);
    }
  });
  if (!candles.length) throw new Error('CSV has no candles.');
  validateCandles(candles);
  return candles;
}

export function exportCSV(candles: readonly Candle[]): string {
  validateCandles(candles);
  return (
    'time,open,high,low,close,volume\n' +
    candles.map((c) => [c.time, c.open, c.high, c.low, c.close, c.volume].join(',')).join('\n') +
    '\n'
  );
}
