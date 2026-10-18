import type { Drawing } from '../types';

export interface FibLevel {
  value: number;
  color: string;
  visible: boolean;
}
export interface DrawingStyle {
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  fillOpacity: number;
  fillColor: string;
  extendLeft: boolean;
  extendRight: boolean;
  showLabels: boolean;
  fontSize: number;
  targetColor: string;
  stopColor: string;
  fibLevels: FibLevel[];
  reverseFib: boolean;
}
const colors = ['#8d9ab1', '#ef9a76', '#e8c776', '#2dd4a7', '#60c2e5', '#a493ee', '#8d9ab1'];
export const DEFAULT_FIB_LEVELS: ReadonlyArray<Readonly<FibLevel>> = [
  0, 0.236, 0.382, 0.5, 0.618, 0.786, 1,
].map((value, index) => ({ value, color: colors[index], visible: true }));

export function defaultDrawingStyle(color = '#879bff'): DrawingStyle {
  return {
    lineWidth: 2,
    lineStyle: 'solid',
    fillOpacity: 0.12,
    fillColor: color,
    extendLeft: false,
    extendRight: false,
    showLabels: true,
    fontSize: 12,
    targetColor: '#2dd4a7',
    stopColor: '#fb7185',
    fibLevels: DEFAULT_FIB_LEVELS.map((level) => ({ ...level })),
    reverseFib: false,
  };
}
export function isDrawingColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Drawing style must be an object.');
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number, label: string, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(`${label} must be ${min}–${max}${integer ? ' in whole numbers' : ''}.`);
  return value;
}

/** Strict supplied-value validation with defaults for older saved drawings. */
export function parseDrawingStyle(value: unknown): DrawingStyle {
  const defaults = defaultDrawingStyle();
  if (value === undefined) return defaults;
  const input = object(value);
  const allowed = new Set(Object.keys(defaults));
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new Error('Unknown drawing style field.');
  const result = { ...defaults };
  for (const key of ['fillColor', 'targetColor', 'stopColor'] as const) {
    if (input[key] !== undefined) {
      if (!isDrawingColor(input[key])) throw new Error(`${key} requires a six-digit hex color.`);
      result[key] = input[key];
    }
  }
  for (const key of ['extendLeft', 'extendRight', 'showLabels', 'reverseFib'] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') throw new Error(`${key} must be true or false.`);
      result[key] = input[key];
    }
  }
  if (input.lineWidth !== undefined)
    result.lineWidth = number(input.lineWidth, 1, 4, 'Line width', true);
  if (input.fillOpacity !== undefined)
    result.fillOpacity = number(input.fillOpacity, 0, 1, 'Fill opacity');
  if (input.fontSize !== undefined)
    result.fontSize = number(input.fontSize, 10, 32, 'Font size', true);
  if (input.lineStyle !== undefined) {
    if (!['solid', 'dashed', 'dotted'].includes(input.lineStyle as string))
      throw new Error('Unknown line pattern.');
    result.lineStyle = input.lineStyle as DrawingStyle['lineStyle'];
  }
  if (input.fibLevels !== undefined) {
    if (
      !Array.isArray(input.fibLevels) ||
      input.fibLevels.length < 2 ||
      input.fibLevels.length > 24
    )
      throw new Error('Fibonacci requires 2–24 configured levels.');
    result.fibLevels = input.fibLevels.map((value) => {
      const level = object(value);
      if (Object.keys(level).some((key) => !['value', 'color', 'visible'].includes(key)))
        throw new Error('Unknown Fibonacci level field.');
      if (!isDrawingColor(level.color) || typeof level.visible !== 'boolean')
        throw new Error('Each Fibonacci level requires a color and visibility.');
      return {
        value: number(level.value, -10, 10, 'Fibonacci ratio'),
        color: level.color,
        visible: level.visible,
      };
    });
    if (new Set(result.fibLevels.map((level) => level.value)).size !== result.fibLevels.length)
      throw new Error('Fibonacci ratios must be unique.');
  }
  return result;
}

export function resolveDrawingStyle(
  drawing: Pick<Drawing, 'color' | 'style' | 'tool'>
): DrawingStyle {
  if (!drawing.style)
    return { ...defaultDrawingStyle(drawing.color), extendRight: drawing.tool === 'ray' };
  return parseDrawingStyle(drawing.style);
}
export function drawingDash(style: DrawingStyle['lineStyle']): string | undefined {
  return style === 'dashed' ? '8 5' : style === 'dotted' ? '2 4' : undefined;
}
export function fibPriceAt(first: number, second: number, ratio: number, reverse = false): number {
  return first + (second - first) * (reverse ? 1 - ratio : ratio);
}
export interface PointXY {
  x: number;
  y: number;
}

/** Parametric segment/ray clipping, including vertical lines and off-screen anchors. */
export function clipExtendedLine(
  a: PointXY,
  b: PointXY,
  width: number,
  height: number,
  extendLeft: boolean,
  extendRight: boolean
): [PointXY, PointXY] | null {
  if (![a.x, a.y, b.x, b.y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
    return null;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return [a, b];
  let minimum = extendLeft ? -Infinity : 0,
    maximum = extendRight ? Infinity : 1;
  for (const [origin, delta, limit] of [
    [a.x, dx, width],
    [a.y, dy, height],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < 0 || origin > limit) return null;
    } else {
      const first = -origin / delta,
        second = (limit - origin) / delta;
      minimum = Math.max(minimum, Math.min(first, second));
      maximum = Math.min(maximum, Math.max(first, second));
    }
  }
  if (minimum > maximum) return null;
  return [
    { x: a.x + dx * minimum, y: a.y + dy * minimum },
    { x: a.x + dx * maximum, y: a.y + dy * maximum },
  ];
}

/** Validate exact property edits before a single history commit. No monetary/execution claim. */
export function validateDrawingProperties(drawing: Drawing): Drawing {
  if (!isDrawingColor(drawing.color)) throw new Error('Line color requires a six-digit hex color.');
  if (drawing.text !== undefined && (typeof drawing.text !== 'string' || drawing.text.length > 240))
    throw new Error('Drawing label must contain at most 240 characters.');
  const count = ['long', 'short', 'channel'].includes(drawing.tool)
    ? 3
    : ['horizontal', 'vertical', 'text'].includes(drawing.tool)
      ? 1
      : 2;
  if (
    drawing.points.length !== count ||
    !drawing.points.every(
      (p) =>
        Number.isFinite(p.time) &&
        p.time > 0 &&
        p.time < 4102444800 &&
        Number.isFinite(p.price) &&
        p.price > 0
    )
  )
    throw new Error(
      'Each anchor requires a positive finite price and a valid UTC date before 2100.'
    );
  if (drawing.tool === 'long' || drawing.tool === 'short') {
    const [entry, stop, target] = drawing.points;
    const sign = drawing.tool === 'long' ? 1 : -1;
    if ((entry.price - stop.price) * sign <= 0 || (target.price - entry.price) * sign <= 0)
      throw new Error(
        drawing.tool === 'long'
          ? 'A long drawing requires stop < entry < target.'
          : 'A short drawing requires target < entry < stop.'
      );
    if (entry.time === stop.time) throw new Error('Entry and end must have different UTC times.');
  }
  return {
    ...drawing,
    points: drawing.points.map((p) => ({ ...p })),
    style: parseDrawingStyle(drawing.style),
  };
}
