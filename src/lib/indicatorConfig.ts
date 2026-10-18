export type IndicatorLineWidth = 1 | 2 | 3 | 4;
interface SimpleLine {
  period: number;
  color: string;
  width: IndicatorLineWidth;
}
export interface IndicatorConfig {
  ema: {
    periods: [number, number, number];
    colors: [string, string, string];
    width: IndicatorLineWidth;
  };
  sma: SimpleLine;
  rsi: SimpleLine & { upper: number; lower: number };
  macd: {
    fast: number;
    slow: number;
    signal: number;
    macdColor: string;
    signalColor: string;
    positiveColor: string;
    negativeColor: string;
    width: IndicatorLineWidth;
  };
  bollinger: {
    period: number;
    deviations: number;
    middleColor: string;
    bandColor: string;
    width: IndicatorLineWidth;
  };
  atr: SimpleLine;
  volume: { upColor: string; downColor: string };
  levels: {
    radius: number;
    count: number;
    supportColor: string;
    resistanceColor: string;
    width: IndicatorLineWidth;
  };
}
export const DEFAULT_INDICATOR_CONFIG: IndicatorConfig = {
  ema: { periods: [9, 21, 200], colors: ['#29b6f6', '#facc15', '#ef5350'], width: 2 },
  sma: { period: 50, color: '#c59aff', width: 1 },
  rsi: { period: 14, color: '#b39aef', width: 2, upper: 70, lower: 30 },
  macd: {
    fast: 12,
    slow: 26,
    signal: 9,
    macdColor: '#60a5fa',
    signalColor: '#f1ba65',
    positiveColor: '#2cc9a1',
    negativeColor: '#ef6476',
    width: 1,
  },
  bollinger: { period: 20, deviations: 2, middleColor: '#839cc2', bandColor: '#657fa4', width: 1 },
  atr: { period: 14, color: '#dfc591', width: 1 },
  volume: { upColor: '#2cc9a1', downColor: '#ef6476' },
  levels: { radius: 3, count: 3, supportColor: '#2cc9a1', resistanceColor: '#ef6476', width: 1 },
};
function record(value: unknown, fields: string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${name} must be an object.`);
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== fields.length || fields.some((key) => !Object.hasOwn(obj, key)))
    throw new Error(`${name} has missing or unsupported settings.`);
  return obj;
}
function number(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
  integer = true
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(
      `${name} must be ${integer ? 'an integer' : 'a number'} from ${minimum} to ${maximum}.`
    );
  return value;
}
function period(value: unknown, name: string) {
  return number(value, name, 1, 2000);
}
function color(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`${name} must be a six-digit hex color, such as #29b6f6.`);
  return value.toLowerCase();
}
function width(value: unknown, name: string): IndicatorLineWidth {
  return number(value, name, 1, 4) as IndicatorLineWidth;
}
function simpleLine(value: unknown, name: string): SimpleLine {
  const obj = record(value, ['period', 'color', 'width'], name);
  return {
    period: period(obj.period, `${name} period`),
    color: color(obj.color, `${name} color`),
    width: width(obj.width, `${name} width`),
  };
}
/** Validates and copies all configurable studies; executable/Pine code is never accepted. */
export function parseIndicatorConfig(value: unknown): IndicatorConfig {
  const obj = record(value, Object.keys(DEFAULT_INDICATOR_CONFIG), 'Indicator configuration');
  const e = record(obj.ema, ['periods', 'colors', 'width'], 'EMA');
  if (
    !Array.isArray(e.periods) ||
    e.periods.length !== 3 ||
    !Array.isArray(e.colors) ||
    e.colors.length !== 3
  )
    throw new Error('EMA requires exactly three periods and colors.');
  const r = record(obj.rsi, ['period', 'color', 'width', 'upper', 'lower'], 'RSI');
  const lower = number(r.lower, 'RSI lower reference', 0, 100, false);
  const upper = number(r.upper, 'RSI upper reference', 0, 100, false);
  if (lower >= upper) throw new Error('RSI lower reference must be below the upper reference.');
  const m = record(
    obj.macd,
    [
      'fast',
      'slow',
      'signal',
      'macdColor',
      'signalColor',
      'positiveColor',
      'negativeColor',
      'width',
    ],
    'MACD'
  );
  const fast = period(m.fast, 'MACD fast period'),
    slow = period(m.slow, 'MACD slow period');
  if (fast >= slow) throw new Error('MACD fast period must be below the slow period.');
  const b = record(
    obj.bollinger,
    ['period', 'deviations', 'middleColor', 'bandColor', 'width'],
    'Bollinger bands'
  );
  const deviations = number(b.deviations, 'Bollinger standard deviations', 0, 10, false);
  if (deviations === 0) throw new Error('Bollinger standard deviations must be greater than zero.');
  const v = record(obj.volume, ['upColor', 'downColor'], 'Volume');
  const l = record(
    obj.levels,
    ['radius', 'count', 'supportColor', 'resistanceColor', 'width'],
    'Support/resistance'
  );
  return {
    ema: {
      periods: e.periods.map((p, i) => period(p, `EMA ${i + 1} period`)) as [
        number,
        number,
        number,
      ],
      colors: e.colors.map((c, i) => color(c, `EMA ${i + 1} color`)) as [string, string, string],
      width: width(e.width, 'EMA width'),
    },
    sma: simpleLine(obj.sma, 'SMA'),
    rsi: {
      period: period(r.period, 'RSI period'),
      color: color(r.color, 'RSI color'),
      width: width(r.width, 'RSI width'),
      upper,
      lower,
    },
    macd: {
      fast,
      slow,
      signal: period(m.signal, 'MACD signal period'),
      macdColor: color(m.macdColor, 'MACD line color'),
      signalColor: color(m.signalColor, 'MACD signal color'),
      positiveColor: color(m.positiveColor, 'Positive histogram color'),
      negativeColor: color(m.negativeColor, 'Negative histogram color'),
      width: width(m.width, 'MACD width'),
    },
    bollinger: {
      period: period(b.period, 'Bollinger period'),
      deviations,
      middleColor: color(b.middleColor, 'Bollinger middle color'),
      bandColor: color(b.bandColor, 'Bollinger band color'),
      width: width(b.width, 'Bollinger width'),
    },
    atr: simpleLine(obj.atr, 'ATR'),
    volume: {
      upColor: color(v.upColor, 'Rising volume color'),
      downColor: color(v.downColor, 'Falling volume color'),
    },
    levels: {
      radius: number(l.radius, 'Pivot confirmation radius', 1, 50),
      count: number(l.count, 'Levels per side', 1, 20),
      supportColor: color(l.supportColor, 'Support color'),
      resistanceColor: color(l.resistanceColor, 'Resistance color'),
      width: width(l.width, 'Level width'),
    },
  };
}
