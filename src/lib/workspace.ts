import { parseDrawingStyle } from './drawingStyle';
import { parseIndicatorConfig, type IndicatorConfig } from './indicatorConfig';
import { parseChartAppearance, type ChartAppearance } from './chartAppearance';
import type { Candle, Drawing, IndicatorSettings, InstrumentId, Timeframe } from '../types';

export const DEFAULT_INDICATORS: IndicatorSettings = {
  ema: true,
  sma: false,
  bollinger: false,
  levels: true,
  volume: false,
  rsi: true,
  macd: true,
  atr: false,
};
export const PRESETS: { name: string; description: string; indicators: IndicatorSettings }[] = [
  {
    name: 'Gold focus',
    description: 'Three EMAs, confirmed levels, RSI and MACD.',
    indicators: DEFAULT_INDICATORS,
  },
  {
    name: 'Clean canvas',
    description: 'Price and your own drawings. Room to think.',
    indicators: {
      ema: false,
      sma: false,
      bollinger: false,
      levels: false,
      volume: false,
      rsi: false,
      macd: false,
      atr: false,
    },
  },
  {
    name: 'Trend & momentum',
    description: 'EMA ribbon, SMA 50, RSI and volume.',
    indicators: { ...DEFAULT_INDICATORS, levels: false, macd: false, sma: true, volume: true },
  },
  {
    name: 'Volatility study',
    description: 'Bollinger bands, volume and ATR.',
    indicators: {
      ema: false,
      sma: false,
      bollinger: true,
      levels: false,
      volume: true,
      rsi: false,
      macd: false,
      atr: true,
    },
  },
];

export function parseIndicators(value: unknown): IndicatorSettings {
  if (!value || typeof value !== 'object') throw new Error('Indicator settings must be an object.');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((k) => !(k in DEFAULT_INDICATORS)) ||
    Object.keys(DEFAULT_INDICATORS).some((k) => typeof input[k] !== 'boolean')
  )
    throw new Error('Use the eight supported indicator names, each with true or false.');
  return Object.fromEntries(
    Object.keys(DEFAULT_INDICATORS).map((k) => [k, input[k]])
  ) as unknown as IndicatorSettings;
}

export function parseDrawings(value: unknown): Drawing[] {
  const tools = [
    'trend',
    'ray',
    'horizontal',
    'vertical',
    'rectangle',
    'ellipse',
    'fib',
    'channel',
    'long',
    'short',
    'text',
    'measure',
    'arrow',
  ];
  if (!Array.isArray(value) || value.length > 500)
    throw new Error('A workspace supports up to 500 drawings per symbol.');
  const ids = new Set<string>();
  return value.map((v: unknown) => {
    if (!v || typeof v !== 'object') throw new Error('Invalid drawing.');
    const d = v as Drawing;
    if (
      typeof d.id !== 'string' ||
      d.id.length > 100 ||
      ids.has(d.id) ||
      !tools.includes(d.tool) ||
      !Array.isArray(d.points) ||
      d.points.length < 1 ||
      d.points.length > 3 ||
      !d.points.every(
        (p) =>
          p &&
          Number.isFinite(p.time) &&
          p.time > 0 &&
          p.time < 4102444800 &&
          Number.isFinite(p.price) &&
          p.price > 0
      )
    )
      throw new Error('Invalid drawing anchors or ID.');
    if (typeof d.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(d.color))
      throw new Error('Drawing colors must be six-digit hex colors.');
    const expected = ['horizontal', 'vertical', 'text'].includes(d.tool)
      ? 1
      : ['long', 'short', 'channel'].includes(d.tool)
        ? 3
        : 2;
    if (d.points.length !== expected) throw new Error('Incorrect anchor count for drawing.');
    ids.add(d.id);
    return {
      id: d.id,
      tool: d.tool,
      points: d.points.map((p) => ({ time: p.time, price: p.price })),
      color: d.color,
      text: typeof d.text === 'string' ? d.text.slice(0, 300) : undefined,
      locked: d.locked === true,
      hidden: d.hidden === true,
      style: d.style === undefined ? undefined : parseDrawingStyle(d.style),
    };
  });
}

export interface WorkspaceFile {
  version: 1;
  symbol: InstrumentId;
  timeframe: Timeframe;
  indicators: IndicatorSettings;
  config?: IndicatorConfig;
  appearance?: ChartAppearance;
  grid?: boolean;
  drawings: Partial<Record<InstrumentId, Drawing[]>>;
  customCandles?: Candle[];
}

export function parseWorkspace(value: unknown): WorkspaceFile {
  if (!value || typeof value !== 'object') throw new Error('Invalid workspace file.');
  const v = value as WorkspaceFile;
  if (
    v.version !== 1 ||
    !['XAUUSD', 'EURUSD', 'BTCUSD'].includes(v.symbol) ||
    !['5m', '15m', '1h', '4h', '1D'].includes(v.timeframe)
  )
    throw new Error('Unsupported workspace version, symbol or timeframe.');
  if (
    !v.drawings ||
    typeof v.drawings !== 'object' ||
    Object.keys(v.drawings).some((k) => !['XAUUSD', 'EURUSD', 'BTCUSD'].includes(k))
  )
    throw new Error('Invalid workspace drawing map.');
  return {
    version: 1,
    symbol: v.symbol,
    timeframe: v.timeframe,
    indicators: parseIndicators(v.indicators),
    config: v.config === undefined ? undefined : parseIndicatorConfig(v.config),
    appearance: v.appearance === undefined ? undefined : parseChartAppearance(v.appearance),
    grid: v.grid !== false,
    drawings: Object.fromEntries(Object.entries(v.drawings).map(([k, d]) => [k, parseDrawings(d)])),
  };
}

export function downloadFile(name: string, data: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function loadJSON<T>(key: string, parse: (value: unknown) => T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parse(JSON.parse(raw)) : fallback;
  } catch {
    return fallback;
  }
}
