import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { Drawing, Projection } from '../types';
import { DrawingGeometry } from '../components/DrawingOverlay';
import {
  clipExtendedLine,
  defaultDrawingStyle,
  drawingDash,
  fibPriceAt,
  parseDrawingStyle,
  resolveDrawingStyle,
  validateDrawingProperties,
} from './drawingStyle';
const first = { time: 1_800_000_000, price: 100 };
function drawing(tool: Drawing['tool'] = 'trend'): Drawing {
  return {
    id: 'test',
    tool,
    color: '#abcdef',
    points: [{ ...first }, { time: first.time + 900, price: 110 }],
  };
}
const projection: Projection = {
  x: (time) => (time - first.time) / 10 + 20,
  y: (price) => 200 - price,
  from: () => null,
  width: 400,
  height: 300,
  revision: 1,
};
const svg = (d: Drawing) =>
  renderToStaticMarkup(
    createElement(
      'svg',
      null,
      createElement(DrawingGeometry, { drawing: d, projection, selected: false })
    )
  );

describe('drawing styles and validated property commits', () => {
  it('uses backwards-compatible defaults without sharing mutable Fibonacci levels', () => {
    expect(resolveDrawingStyle(drawing()).fillColor).toBe('#abcdef');
    expect(resolveDrawingStyle(drawing('ray')).extendRight).toBe(true);
    const a = defaultDrawingStyle(),
      b = defaultDrawingStyle();
    a.fibLevels[0].color = '#ffffff';
    expect(b.fibLevels[0].color).not.toBe('#ffffff');
    expect(parseDrawingStyle({ lineWidth: 4 }).lineWidth).toBe(4);
    expect(parseDrawingStyle(undefined)).toEqual(defaultDrawingStyle());
  });
  it.each([
    null,
    [],
    { lineWidth: 0 },
    { lineWidth: 2.5 },
    { lineWidth: 5 },
    { lineStyle: 'wavy' },
    { fillOpacity: -0.1 },
    { fillOpacity: 1.1 },
    { fontSize: 33 },
    { fontSize: 10.5 },
    { extendLeft: 1 },
    { fillColor: 'red' },
    { targetColor: '#fff' },
    { stopColor: '<script>' },
    { extra: true },
    { fibLevels: [] },
    { reverseFib: 'yes' },
    {
      fibLevels: [
        { value: 0, color: '#123456', visible: true },
        { value: 0, color: '#abcdef', visible: true },
      ],
    },
    {
      fibLevels: [
        { value: 0, color: '#123456', visible: true },
        { value: 11, color: '#abcdef', visible: true },
      ],
    },
  ])('refuses malformed style %#', (value) => expect(() => parseDrawingStyle(value)).toThrow());
  it('validates protective stop and target rules for both sides, without mutating the original', () => {
    const d: Drawing = {
      ...drawing('long'),
      points: [
        { ...first },
        { time: first.time + 900, price: 95 },
        { time: first.time + 900, price: 110 },
      ],
    };
    const result = validateDrawingProperties(d);
    expect(result.points).toEqual(d.points);
    expect(result.points).not.toBe(d.points);
    expect(result.style?.lineWidth).toBe(2);
    expect(
      validateDrawingProperties({
        ...d,
        points: d.points.map((p) => ({ ...p, time: p.time + 0.25 })),
      }).points[0].time
    ).toBe(first.time + 0.25);
    expect(() =>
      validateDrawingProperties({
        ...d,
        points: [d.points[0], { ...d.points[1], price: 101 }, d.points[2]],
      })
    ).toThrow(/stop < entry < target/);
    expect(() => validateDrawingProperties({ ...d, tool: 'short' })).toThrow(
      /target < entry < stop/
    );
    expect(() =>
      validateDrawingProperties({
        ...d,
        points: [d.points[0], { ...d.points[1], time: first.time }, d.points[2]],
      })
    ).toThrow(/different UTC times/);
    expect(() =>
      validateDrawingProperties({ ...d, points: [{ ...first, price: NaN }, ...d.points.slice(1)] })
    ).toThrow();
  });
  it('clips finite, extended, reversed and vertical lines correctly', () => {
    const a = { x: 20, y: 50 },
      b = { x: 40, y: 50 };
    expect(clipExtendedLine(a, b, 100, 100, false, false)).toEqual([a, b]);
    expect(clipExtendedLine(a, b, 100, 100, true, true)).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ]);
    expect(clipExtendedLine(b, a, 100, 100, false, true)).toEqual([b, { x: 0, y: 50 }]);
    expect(clipExtendedLine({ x: 50, y: 20 }, { x: 50, y: 40 }, 100, 100, true, true)).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]);
    expect(clipExtendedLine({ x: -10, y: 0 }, { x: -10, y: 40 }, 100, 100, true, true)).toBeNull();
  });
  it('computes reversible retracements and extensions rather than relabeling fixed geometry', () => {
    expect(fibPriceAt(100, 200, 0.25)).toBe(125);
    expect(fibPriceAt(100, 200, 0.25, true)).toBe(175);
    expect(fibPriceAt(100, 200, 1.618)).toBeCloseTo(261.8);
    expect(drawingDash('dashed')).toBe('8 5');
    expect(drawingDash('dotted')).toBe('2 4');
    expect(drawingDash('solid')).toBeUndefined();
  });
});

describe('SVG applies actual drawing properties', () => {
  it('renders chosen line width/pattern/extensions and configurable shape fill', () => {
    const style = {
      ...defaultDrawingStyle(),
      lineWidth: 4,
      lineStyle: 'dotted' as const,
      extendLeft: true,
      extendRight: true,
    };
    const line = svg({ ...drawing(), style });
    expect(line).toContain('stroke-width="4"');
    expect(line).toContain('stroke-dasharray="2 4"');
    expect(line).toContain('x1="0"');
    const zone = svg({
      ...drawing('rectangle'),
      style: { ...style, fillColor: '#123456', fillOpacity: 0.65 },
    });
    expect(zone).toContain('fill="#123456"');
    expect(zone).toContain('fill-opacity="0.65"');
    expect(zone).toContain('width="400"');
  });
  it('uses independently configured Fibonacci levels/colors/visibility and reverses prices', () => {
    const style = {
      ...defaultDrawingStyle(),
      fibLevels: [
        { value: 0, color: '#123456', visible: true },
        { value: 0.5, color: '#654321', visible: false },
      ],
      reverseFib: true,
      fontSize: 20,
    };
    const markup = svg({ ...drawing('fib'), style });
    expect(markup).toContain('0.000 · 110');
    expect(markup).toContain('stroke="#123456"');
    expect(markup).not.toContain('data-fib-ratio="0.5"');
    expect(markup).toContain('font-size="20"');
  });
  it('honors custom target/stop colors, opacity, and hidden position labels', () => {
    const d: Drawing = {
      ...drawing('long'),
      points: [
        { ...first },
        { time: first.time + 900, price: 95 },
        { time: first.time + 900, price: 110 },
      ],
      style: {
        ...defaultDrawingStyle(),
        targetColor: '#112233',
        stopColor: '#445566',
        fillOpacity: 0.4,
        showLabels: false,
      },
    };
    const markup = svg(d);
    expect(markup).toContain('fill="#112233"');
    expect(markup).toContain('fill="#445566"');
    expect(markup).toContain('fill-opacity="0.4"');
    expect(markup).not.toContain('TARGET');
    expect(markup).not.toContain('STOP');
    expect(markup).not.toContain('R/R');
  });
  it('uses text font size and keeps body hit targets for touch dragging', () => {
    const markup = svg({
      ...drawing('text'),
      points: [{ ...first }],
      text: 'My note',
      style: { ...defaultDrawingStyle(), fontSize: 24 },
    });
    expect(markup).toContain('font-size="24"');
    expect(markup).toContain('My note');
    expect(svg(drawing())).toContain('stroke-width="16"');
  });
});
