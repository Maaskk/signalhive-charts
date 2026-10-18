import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INDICATOR_CONFIG,
  parseIndicatorConfig,
  type IndicatorConfig,
} from './indicatorConfig';

const fresh = () => structuredClone(DEFAULT_INDICATOR_CONFIG);
describe('editable indicator configuration', () => {
  it('keeps the requested blue/yellow/red EMA defaults and creates independent settings', () => {
    const parsed = parseIndicatorConfig(DEFAULT_INDICATOR_CONFIG);
    expect(parsed).toEqual(DEFAULT_INDICATOR_CONFIG);
    expect(parsed.ema.periods).toEqual([9, 21, 200]);
    expect(parsed.ema.colors).toEqual(['#29b6f6', '#facc15', '#ef5350']);
    parsed.ema.periods[0] = 5;
    parsed.macd.fast = 8;
    expect(DEFAULT_INDICATOR_CONFIG.ema.periods[0]).toBe(9);
    expect(DEFAULT_INDICATOR_CONFIG.macd.fast).toBe(12);
  });
  it('round-trips changed periods, references, widths and colors for all eight studies', () => {
    const config: IndicatorConfig = {
      ema: { periods: [5, 13, 233], colors: ['#aabbcc', '#112233', '#ee7744'], width: 4 },
      sma: { period: 120, color: '#123456', width: 3 },
      rsi: { period: 7, color: '#abcdef', width: 1, upper: 80.5, lower: 19.5 },
      macd: {
        fast: 8,
        slow: 34,
        signal: 5,
        macdColor: '#121212',
        signalColor: '#232323',
        positiveColor: '#343434',
        negativeColor: '#454545',
        width: 2,
      },
      bollinger: {
        period: 30,
        deviations: 2.5,
        middleColor: '#565656',
        bandColor: '#676767',
        width: 4,
      },
      atr: { period: 21, color: '#787878', width: 2 },
      volume: { upColor: '#898989', downColor: '#909090' },
      levels: {
        radius: 8,
        count: 5,
        supportColor: '#a1a1a1',
        resistanceColor: '#b2b2b2',
        width: 3,
      },
    };
    expect(parseIndicatorConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
  });
  it('accepts supported boundary values and normalizes case in six-digit colors', () => {
    const value = fresh();
    value.ema.periods = [1, 2000, 1];
    value.ema.colors[0] = '#ABCDEF';
    value.macd = { ...value.macd, fast: 1, slow: 2000, signal: 2000 };
    value.rsi.lower = 0;
    value.rsi.upper = 100;
    value.levels.radius = 50;
    value.levels.count = 20;
    expect(parseIndicatorConfig(value).ema.colors[0]).toBe('#abcdef');
  });
  it.each([
    [
      'EMA period zero',
      (c: IndicatorConfig) => {
        c.ema.periods[0] = 0;
      },
    ],
    [
      'EMA fractional period',
      (c: IndicatorConfig) => {
        c.ema.periods[1] = 2.5;
      },
    ],
    [
      'period too large',
      (c: IndicatorConfig) => {
        c.atr.period = 2001;
      },
    ],
    [
      'period not finite',
      (c: IndicatorConfig) => {
        c.sma.period = NaN;
      },
    ],
    [
      'width too large',
      (c: IndicatorConfig) => {
        Object.assign(c.sma, { width: 5 });
      },
    ],
    [
      'width fractional',
      (c: IndicatorConfig) => {
        Object.assign(c.ema, { width: 1.5 });
      },
    ],
    [
      'invalid hex color',
      (c: IndicatorConfig) => {
        c.volume.upColor = 'red';
      },
    ],
    [
      'CSS injection color',
      (c: IndicatorConfig) => {
        c.volume.downColor = '#fff;display:none';
      },
    ],
    [
      'alpha color unsupported',
      (c: IndicatorConfig) => {
        c.rsi.color = '#ffffff80';
      },
    ],
    [
      'reversed MACD',
      (c: IndicatorConfig) => {
        c.macd.fast = 27;
      },
    ],
    [
      'equal MACD periods',
      (c: IndicatorConfig) => {
        c.macd.fast = 26;
      },
    ],
    [
      'invalid signal period',
      (c: IndicatorConfig) => {
        c.macd.signal = -1;
      },
    ],
    [
      'reversed RSI references',
      (c: IndicatorConfig) => {
        c.rsi.lower = 90;
      },
    ],
    [
      'equal RSI references',
      (c: IndicatorConfig) => {
        c.rsi.lower = 70;
      },
    ],
    [
      'RSI beyond bounds',
      (c: IndicatorConfig) => {
        c.rsi.upper = 101;
      },
    ],
    [
      'zero deviations',
      (c: IndicatorConfig) => {
        c.bollinger.deviations = 0;
      },
    ],
    [
      'excess deviations',
      (c: IndicatorConfig) => {
        c.bollinger.deviations = 11;
      },
    ],
    [
      'unsupported pivot radius',
      (c: IndicatorConfig) => {
        c.levels.radius = 51;
      },
    ],
    [
      'zero level count',
      (c: IndicatorConfig) => {
        c.levels.count = 0;
      },
    ],
    [
      'too many levels',
      (c: IndicatorConfig) => {
        c.levels.count = 21;
      },
    ],
  ])('rejects %s without changing the defaults', (_name, edit) => {
    const value = fresh();
    edit(value);
    expect(() => parseIndicatorConfig(value)).toThrow();
    expect(DEFAULT_INDICATOR_CONFIG.ema.periods).toEqual([9, 21, 200]);
  });
  it.each([
    null,
    [],
    {},
    'code()',
    { ...DEFAULT_INDICATOR_CONFIG, execute: 'alert(1)' },
    { ...DEFAULT_INDICATOR_CONFIG, ema: { ...DEFAULT_INDICATOR_CONFIG.ema, periods: [9, 21] } },
    { ...DEFAULT_INDICATOR_CONFIG, sma: { period: '50', color: '#ffffff', width: 1 } },
  ])('rejects incomplete, executable or incorrectly typed input %#', (input) => {
    expect(() => parseIndicatorConfig(input)).toThrow();
  });
});
