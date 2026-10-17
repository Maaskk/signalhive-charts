import { describe, expect, it } from 'vitest';
import { DEFAULT_CHART_APPEARANCE, parseChartAppearance } from './chartAppearance';

describe('chart appearance workspace import', () => {
  it('preserves an edited preset through JSON round-trip', () => {
    const edited = {
      ...DEFAULT_CHART_APPEARANCE,
      chartType: 'area',
      background: '#ffffff',
      text: '#222222',
      upColor: '#008800',
      borderVisible: true,
      fontSize: 16,
    };
    expect(parseChartAppearance(JSON.parse(JSON.stringify(edited)))).toEqual(edited);
  });
  it('rejects invalid fields independently while retaining valid customizations', () => {
    const result = parseChartAppearance({
      chartType: 'untrusted',
      background: 'url(https://example.com/remote)',
      text: '#ABCDEF',
      gridColor: '#123',
      downColor: null,
      borderVisible: 'true',
      fontSize: Number.NaN,
      arbitrary: 'ignored',
    });
    expect(result).toEqual({ ...DEFAULT_CHART_APPEARANCE, text: '#abcdef' });
    expect('arbitrary' in result).toBe(false);
  });
  it.each([null, undefined, [], 'area', 42])(
    'returns independent defaults for malformed %j',
    (input) => {
      const result = parseChartAppearance(input);
      expect(result).toEqual(DEFAULT_CHART_APPEARANCE);
      result.background = '#ffffff';
      expect(DEFAULT_CHART_APPEARANCE.background).not.toBe('#ffffff');
    }
  );
  it.each([
    [9, 10],
    [10.6, 11],
    [30, 18],
  ])('constrains readable integer font sizes (%s → %s)', (fontSize, expected) => {
    expect(parseChartAppearance({ fontSize }).fontSize).toBe(expected);
  });
});
