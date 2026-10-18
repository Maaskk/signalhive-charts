import { useState } from 'react';
import {
  DEFAULT_INDICATOR_CONFIG,
  parseIndicatorConfig,
  type IndicatorConfig,
} from '../lib/indicatorConfig';

interface Props {
  value: IndicatorConfig;
  onChange: (value: IndicatorConfig) => void;
}
type Study = keyof IndicatorConfig;
const STUDIES: [Study, string][] = [
  ['ema', 'Exponential moving averages'],
  ['sma', 'Simple moving average'],
  ['rsi', 'Relative strength index'],
  ['macd', 'MACD'],
  ['bollinger', 'Bollinger bands'],
  ['atr', 'Average true range'],
  ['volume', 'Volume'],
  ['levels', 'Support / resistance'],
];
export function IndicatorSettings({ value, onChange }: Props) {
  const [draft, setDraft] = useState(() => structuredClone(value));
  const [study, setStudy] = useState<Study>('ema');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const update = (key: string, next: number | string) => {
    setDraft((current) => ({ ...current, [study]: { ...current[study], [key]: next } }));
    setMessage('');
    setError('');
  };
  const numeric = (label: string, key: string, min = 1, max = 2000, step = 1) => (
    <label className="range-label" key={key}>
      {label}
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={(draft[study] as unknown as Record<string, number>)[key]}
        onChange={(e) => update(key, Number(e.target.value))}
      />
    </label>
  );
  const color = (label: string, key: string) => (
    <label className="range-label" key={key}>
      {label}
      <input
        type="color"
        aria-label={label}
        value={(draft[study] as unknown as Record<string, string>)[key]}
        onChange={(e) => update(key, e.target.value)}
      />
    </label>
  );
  const lineWidth = () => numeric('Line width', 'width', 1, 4);
  return (
    <form
      className="indicator-settings"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const next = parseIndicatorConfig(draft);
          onChange(next);
          setDraft(next);
          setMessage('Indicator settings applied.');
          setError('');
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Invalid indicator settings.');
          setMessage('');
        }
      }}
    >
      <label className="range-label">
        Study to edit
        <select
          aria-label="Study to edit"
          value={study}
          onChange={(e) => {
            setStudy(e.target.value as Study);
            setError('');
            setMessage('');
          }}
        >
          {STUDIES.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <p className="microcopy">
        These parameters change the calculated chart studies. Study visibility is controlled in the
        indicator library. Periods count candles on the selected timeframe. A study stays empty
        until enough candles are available for its warm-up.
      </p>
      <div
        className="indicator-fields"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px 20px',
        }}
      >
        {study === 'ema' ? (
          <>
            {draft.ema.periods.map((p, i) => (
              <label className="range-label" key={`period-${i}`}>
                EMA {i + 1} period
                <input
                  aria-label={`EMA ${i + 1} period`}
                  type="number"
                  min={1}
                  max={2000}
                  value={p}
                  onChange={(e) => {
                    const periods: [number, number, number] = [...draft.ema.periods];
                    periods[i] = Number(e.target.value);
                    setDraft((d) => ({ ...d, ema: { ...d.ema, periods } }));
                    setMessage('');
                    setError('');
                  }}
                />
              </label>
            ))}
            {draft.ema.colors.map((c, i) => (
              <label className="range-label" key={`color-${i}`}>
                EMA {i + 1} color
                <input
                  aria-label={`EMA ${i + 1} color`}
                  type="color"
                  value={c}
                  onChange={(e) => {
                    const colors: [string, string, string] = [...draft.ema.colors];
                    colors[i] = e.target.value;
                    setDraft((d) => ({ ...d, ema: { ...d.ema, colors } }));
                    setMessage('');
                    setError('');
                  }}
                />
              </label>
            ))}
            {lineWidth()}
          </>
        ) : null}
        {study === 'sma' || study === 'atr' ? (
          <>
            {numeric('Period', 'period')}
            {color('Line color', 'color')}
            {lineWidth()}
          </>
        ) : null}
        {study === 'rsi' ? (
          <>
            {numeric('RSI period', 'period')}
            {numeric('Upper reference', 'upper', 0, 100, 0.1)}
            {numeric('Lower reference', 'lower', 0, 100, 0.1)}
            {color('RSI line color', 'color')}
            {lineWidth()}
          </>
        ) : null}
        {study === 'macd' ? (
          <>
            {numeric('Fast period', 'fast')}
            {numeric('Slow period', 'slow')}
            {numeric('Signal period', 'signal')}
            {color('MACD line color', 'macdColor')}
            {color('Signal line color', 'signalColor')}
            {color('Positive histogram color', 'positiveColor')}
            {color('Negative histogram color', 'negativeColor')}
            {lineWidth()}
          </>
        ) : null}
        {study === 'bollinger' ? (
          <>
            {numeric('Band period', 'period')}
            {numeric('Standard deviations', 'deviations', 0.1, 10, 0.1)}
            {color('Middle line color', 'middleColor')}
            {color('Band line color', 'bandColor')}
            {lineWidth()}
          </>
        ) : null}
        {study === 'volume' ? (
          <>
            {color('Rising volume color', 'upColor')}
            {color('Falling volume color', 'downColor')}
          </>
        ) : null}
        {study === 'levels' ? (
          <>
            {numeric('Confirmation radius', 'radius', 1, 50)}
            {numeric('Levels per side', 'count', 1, 20)}
            {color('Support color', 'supportColor')}
            {color('Resistance color', 'resistanceColor')}
            {lineWidth()}
            <p className="microcopy">
              Pivots require the chosen number of candles on each side and appear only after
              confirmation. More levels or a larger radius do not imply stronger signals.
            </p>
          </>
        ) : null}
      </div>
      {error ? (
        <p className="negative" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="positive" role="status">
          {message}
        </p>
      ) : null}
      <div className="modal-actions" style={{ marginTop: 20 }}>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setDraft((d) => ({ ...d, [study]: structuredClone(DEFAULT_INDICATOR_CONFIG[study]) }));
            setError('');
            setMessage('Defaults restored in the draft. Apply to update the chart.');
          }}
        >
          Reset this study
        </button>
        <button type="submit" className="primary-button">
          Apply indicator settings
        </button>
      </div>
    </form>
  );
}
