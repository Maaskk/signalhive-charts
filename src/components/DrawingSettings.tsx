import { useState } from 'react';
import type { Drawing } from '../types';
import {
  defaultDrawingStyle,
  resolveDrawingStyle,
  validateDrawingProperties,
  type DrawingStyle,
} from '../lib/drawingStyle';
import { positionMetrics } from '../lib/drawings';

export interface DrawingSettingsProps {
  drawing: Drawing;
  onChange: (updated: Drawing) => void;
}
const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: '12px 20px',
};
const utcInput = (time: number) =>
  Number.isFinite(time) && time > 0 && time < 4102444800
    ? new Date(time * 1000).toISOString().slice(0, 19)
    : '';
function fromUTC(value: string): number {
  const time = Date.parse(value + 'Z') / 1000;
  return Number.isFinite(time) && utcInput(time) === value.padEnd(19, ':00') ? time : NaN;
}

/** Mount keyed by drawing.id so changing the selected drawing starts a new draft. */
export function DrawingSettings({ drawing, onChange }: DrawingSettingsProps) {
  const [draft, setDraft] = useState<Drawing>(() => ({
    ...drawing,
    points: drawing.points.map((p) => ({ ...p })),
    style: resolveDrawingStyle(drawing),
  }));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const style = draft.style!;
  const isPosition = draft.tool === 'long' || draft.tool === 'short';
  const filled = ['rectangle', 'ellipse', 'channel', 'measure', 'long', 'short'].includes(
    draft.tool
  );
  const extendable = ['trend', 'ray', 'channel', 'fib', 'rectangle'].includes(draft.tool);
  const update = (change: Partial<Drawing>) => {
    setDraft((d) => ({ ...d, ...change }));
    setError('');
    setMessage('');
  };
  const updateStyle = (change: Partial<DrawingStyle>) => {
    setDraft((d) => ({ ...d, style: { ...d.style!, ...change } }));
    setError('');
    setMessage('');
  };
  const color = (label: string, key: 'fillColor' | 'targetColor' | 'stopColor') => (
    <label className="range-label" key={key}>
      {label}
      <input
        type="color"
        aria-label={label}
        value={style[key]}
        onChange={(e) => updateStyle({ [key]: e.target.value })}
      />
    </label>
  );
  const anchor = (index: number, property: 'price' | 'time', value: number) => {
    setDraft((d) => ({
      ...d,
      points: d.points.map((p, i) =>
        i === index || (isPosition && property === 'time' && index === 1 && i === 2)
          ? { ...p, [property]: value }
          : p
      ),
    }));
    setError('');
    setMessage('');
  };
  const metrics = isPosition ? positionMetrics(draft) : null;
  return (
    <form
      className="drawing-settings"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const next = validateDrawingProperties(draft);
          onChange(next);
          setDraft(next);
          setError('');
          setMessage('Drawing properties applied. Undo restores the previous drawing.');
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Invalid drawing properties.');
          setMessage('');
        }
      }}
    >
      <p className="microcopy">
        Edit this {draft.tool} drawing. Changes stay in this draft until Apply. Price/time anchors
        describe chart geometry; they do not submit or change a trade.
      </p>
      <div style={grid}>
        <label className="range-label">
          {draft.tool === 'text' ? 'Annotation text' : 'Drawing label'}
          <input
            aria-label={draft.tool === 'text' ? 'Annotation text' : 'Drawing label'}
            maxLength={240}
            value={draft.text ?? ''}
            onChange={(e) => update({ text: e.target.value })}
          />
        </label>
        <label className="range-label">
          Line / text color
          <input
            aria-label="Line / text color"
            type="color"
            value={draft.color}
            onChange={(e) => update({ color: e.target.value })}
          />
        </label>
        {draft.tool !== 'text' && (
          <>
            <label className="range-label">
              Line width
              <select
                aria-label="Line width"
                value={style.lineWidth}
                onChange={(e) => updateStyle({ lineWidth: Number(e.target.value) })}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} px
                  </option>
                ))}
              </select>
            </label>
            <label className="range-label">
              Line pattern
              <select
                aria-label="Line pattern"
                value={style.lineStyle}
                onChange={(e) =>
                  updateStyle({ lineStyle: e.target.value as DrawingStyle['lineStyle'] })
                }
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </label>
          </>
        )}
        <label className="range-label">
          Text size
          <input
            aria-label="Text size"
            type="number"
            min={10}
            max={32}
            step={1}
            value={style.fontSize}
            onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
          />
        </label>
        {draft.tool !== 'text' && (
          <label className="range-label">
            Show labels
            <input
              aria-label="Show labels"
              type="checkbox"
              checked={style.showLabels}
              onChange={(e) => updateStyle({ showLabels: e.target.checked })}
            />
          </label>
        )}
        {filled && (
          <>
            {!isPosition && color('Fill color', 'fillColor')}
            <label className="range-label">
              Fill opacity (%)
              <input
                aria-label="Fill opacity (%)"
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(style.fillOpacity * 100)}
                onChange={(e) => updateStyle({ fillOpacity: Number(e.target.value) / 100 })}
              />
            </label>
          </>
        )}
        {isPosition && (
          <>
            {color('Target color', 'targetColor')}
            {color('Stop color', 'stopColor')}
          </>
        )}
        {extendable && (
          <>
            <label className="range-label">
              Extend left
              <input
                aria-label="Extend left"
                type="checkbox"
                checked={style.extendLeft}
                onChange={(e) => updateStyle({ extendLeft: e.target.checked })}
              />
            </label>
            <label className="range-label">
              Extend right
              <input
                aria-label="Extend right"
                type="checkbox"
                checked={style.extendRight}
                onChange={(e) => updateStyle({ extendRight: e.target.checked })}
              />
            </label>
          </>
        )}
      </div>
      <section className="settings-section">
        <h3>{isPosition ? 'Entry, protective stop and target' : 'Exact anchor coordinates'}</h3>
        <p>Dates are UTC, including seconds. Anchor prices must be positive.</p>
        <div style={grid}>
          {draft.points.map((point, index) => {
            const name = isPosition ? ['Entry', 'Stop', 'Target'][index] : `Anchor ${index + 1}`;
            return (
              <div key={index} style={{ display: 'grid', gap: 12 }}>
                {draft.tool !== 'vertical' && (
                  <label className="range-label">
                    {name} price
                    <input
                      aria-label={`${name} price`}
                      type="number"
                      min="0.0000000001"
                      step="any"
                      required
                      value={Number.isFinite(point.price) ? point.price : ''}
                      onChange={(e) =>
                        anchor(index, 'price', e.target.value === '' ? NaN : Number(e.target.value))
                      }
                    />
                  </label>
                )}
                {draft.tool !== 'horizontal' && (!isPosition || index < 2) && (
                  <label className="range-label">
                    {isPosition && index === 1 ? 'End' : name} time (UTC)
                    <input
                      aria-label={`${isPosition && index === 1 ? 'End' : name} time (UTC)`}
                      type="datetime-local"
                      step={1}
                      required
                      value={utcInput(point.time)}
                      onChange={(e) => anchor(index, 'time', fromUTC(e.target.value))}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
        {isPosition && (
          <p className={metrics?.valid ? 'positive' : 'negative'}>
            {metrics?.valid
              ? `Price-distance R/R 1:${metrics.ratio!.toFixed(2)}. This excludes lot size, fees and execution.`
              : draft.tool === 'long'
                ? 'Required: stop < entry < target.'
                : 'Required: target < entry < stop.'}
          </p>
        )}
      </section>
      {draft.tool === 'fib' && (
        <section className="settings-section">
          <h3>Fibonacci levels</h3>
          <p>
            Ratios are multiples: 0.618 is 61.8%; 1.618 is 161.8%. Each level has its own color and
            visibility.
          </p>
          <label className="range-label">
            Reverse levels
            <input
              aria-label="Reverse levels"
              type="checkbox"
              checked={style.reverseFib}
              onChange={(e) => updateStyle({ reverseFib: e.target.checked })}
            />
          </label>
          {style.fibLevels.map((level, index) => (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(78px,1fr) 48px 50px 60px',
                gap: 10,
                alignItems: 'end',
                marginTop: 10,
              }}
            >
              <label className="range-label">
                Level {index + 1} ratio
                <input
                  aria-label={`Level ${index + 1} ratio`}
                  type="number"
                  min={-10}
                  max={10}
                  step="any"
                  value={Number.isFinite(level.value) ? level.value : ''}
                  onChange={(e) =>
                    updateStyle({
                      fibLevels: style.fibLevels.map((l, i) =>
                        i === index
                          ? { ...l, value: e.target.value === '' ? NaN : Number(e.target.value) }
                          : l
                      ),
                    })
                  }
                />
              </label>
              <label className="range-label">
                Color
                <input
                  aria-label={`Level ${index + 1} color`}
                  type="color"
                  value={level.color}
                  onChange={(e) =>
                    updateStyle({
                      fibLevels: style.fibLevels.map((l, i) =>
                        i === index ? { ...l, color: e.target.value } : l
                      ),
                    })
                  }
                />
              </label>
              <label className="range-label">
                Visible
                <input
                  aria-label={`Level ${index + 1} visible`}
                  type="checkbox"
                  checked={level.visible}
                  onChange={(e) =>
                    updateStyle({
                      fibLevels: style.fibLevels.map((l, i) =>
                        i === index ? { ...l, visible: e.target.checked } : l
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="secondary-button"
                disabled={style.fibLevels.length <= 2}
                aria-label={`Remove level ${index + 1}`}
                onClick={() =>
                  updateStyle({ fibLevels: style.fibLevels.filter((_, i) => i !== index) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            style={{ marginTop: 14 }}
            disabled={style.fibLevels.length >= 24}
            onClick={() => {
              const used = new Set(style.fibLevels.map((l) => l.value));
              let value = 1.618;
              while (used.has(value) && value < 10) value = Number((value + 0.1).toFixed(3));
              if (!used.has(value) && value <= 10)
                updateStyle({
                  fibLevels: [...style.fibLevels, { value, color: draft.color, visible: true }],
                });
            }}
          >
            Add Fibonacci level
          </button>
        </section>
      )}
      {error && (
        <p className="negative" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="positive" role="status">
          {message}
        </p>
      )}
      <div className="modal-actions" style={{ marginTop: 20 }}>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            updateStyle({ ...defaultDrawingStyle(draft.color), extendRight: draft.tool === 'ray' });
            setMessage('Style defaults restored in this draft. Apply to update.');
          }}
        >
          Reset style
        </button>
        <button type="submit" className="primary-button">
          Apply drawing properties
        </button>
      </div>
    </form>
  );
}
