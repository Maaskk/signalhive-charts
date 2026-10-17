import { useEffect, useId, useState } from 'react';
import {
  DEFAULT_CHART_APPEARANCE,
  parseChartAppearance,
  type ChartAppearance,
  type ChartType,
} from '../lib/chartAppearance';

type ColorKey = Exclude<keyof ChartAppearance, 'chartType' | 'fontSize' | 'borderVisible'>;

const canvasColors: [ColorKey, string][] = [
  ['background', 'Background'],
  ['text', 'Text and price scale'],
  ['gridColor', 'Grid'],
  ['crosshairColor', 'Crosshair'],
];
const candleColors: [ColorKey, string][] = [
  ['upColor', 'Bullish candle / bar'],
  ['downColor', 'Bearish candle / bar'],
  ['wickUpColor', 'Bullish wick'],
  ['wickDownColor', 'Bearish wick'],
];
const lineColors: [ColorKey, string][] = [
  ['lineColor', 'Line / area outline'],
  ['areaTopColor', 'Area fill top'],
  ['areaBottomColor', 'Area fill bottom'],
];

export function ChartAppearanceSettings({
  value,
  onChange,
}: {
  value: ChartAppearance;
  onChange: (next: ChartAppearance) => void;
}) {
  const [draft, setDraft] = useState(() => parseChartAppearance(value));
  const [status, setStatus] = useState('');
  const id = useId();
  useEffect(() => {
    setDraft(parseChartAppearance(value));
  }, [value]);
  const change = <K extends keyof ChartAppearance>(key: K, next: ChartAppearance[K]) => {
    setDraft((current) => ({ ...current, [key]: next }));
    setStatus('Changes are ready to apply.');
  };
  const colors = (fields: [ColorKey, string][]) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12,
        marginTop: 12,
      }}
    >
      {fields.map(([key, label]) => (
        <label key={key} style={{ display: 'grid', gap: 7, fontSize: 12 }}>
          {label}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <input
              type="color"
              value={draft[key]}
              onChange={(event) => change(key, event.target.value)}
              aria-label={label}
              style={{ width: 45, height: 33, padding: 2, cursor: 'pointer' }}
            />
            <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{draft[key]}</span>
          </div>
        </label>
      ))}
    </div>
  );
  return (
    <form
      aria-label="Chart appearance"
      onSubmit={(event) => {
        event.preventDefault();
        onChange(parseChartAppearance(draft));
        setStatus('Chart appearance applied.');
      }}
    >
      <div className="settings-section">
        <h3>Chart appearance</h3>
        <p>
          Set the chart style and colors, then apply. Your drawings and indicators stay in place.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          <label htmlFor={`${id}-type`}>
            Chart type{' '}
            <select
              id={`${id}-type`}
              value={draft.chartType}
              onChange={(event) => change('chartType', event.target.value as ChartType)}
            >
              <option value="candles">Candlesticks</option>
              <option value="bars">OHLC bars</option>
              <option value="line">Line</option>
              <option value="area">Area</option>
            </select>
          </label>
          <label htmlFor={`${id}-font`}>
            Chart font{' '}
            <select
              id={`${id}-font`}
              value={draft.fontSize}
              onChange={(event) => change('fontSize', Number(event.target.value))}
            >
              {Array.from({ length: 9 }, (_, index) => index + 10).map((size) => (
                <option key={size} value={size}>
                  {size} px
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={draft.borderVisible}
              onChange={(event) => change('borderVisible', event.target.checked)}
            />
            Candle borders
          </label>
        </div>
        {colors(canvasColors)}
      </div>
      <div className="settings-section">
        <h3>Candlesticks and bars</h3>
        {colors(candleColors)}
      </div>
      <div className="settings-section">
        <h3>Line and area</h3>
        {colors(lineColors)}
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setDraft({ ...DEFAULT_CHART_APPEARANCE });
            setStatus('Default colors selected. Apply to restore the chart.');
          }}
        >
          Reset appearance defaults
        </button>
        <button type="submit" className="primary-button">
          Apply chart appearance
        </button>
      </div>
      <p role="status" style={{ minHeight: 18, fontSize: 12, marginTop: 10 }}>
        {status}
      </p>
    </form>
  );
}
