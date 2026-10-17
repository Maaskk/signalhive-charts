import type { Anchor, Drawing, Tool } from '../types';

export const DRAWING_TOOL_STEPS: Record<Tool, number> = {
  cursor: 0,
  trend: 2,
  ray: 2,
  horizontal: 1,
  vertical: 1,
  rectangle: 2,
  ellipse: 2,
  fib: 2,
  channel: 3,
  long: 2,
  short: 2,
  text: 1,
  measure: 2,
  arrow: 2,
};

export function isFiniteAnchor(point: Anchor): boolean {
  return Number.isFinite(point.time) && Number.isFinite(point.price);
}
const validAnchor = (point: Anchor) =>
  isFiniteAnchor(point) && point.price > 0 && point.time > 0 && point.time < 4102444800;

export function translateDrawing(drawing: Drawing, delta: Anchor): Drawing {
  if (drawing.locked || !isFiniteAnchor(delta)) return drawing;
  const points = drawing.points.map((p) => ({
    time: p.time + delta.time,
    price: p.price + delta.price,
  }));
  return points.every(validAnchor) ? { ...drawing, points } : drawing;
}

export function positionMetrics(drawing: Drawing): {
  valid: boolean;
  risk: number;
  reward: number;
  ratio: number | null;
} {
  if (
    (drawing.tool !== 'long' && drawing.tool !== 'short') ||
    drawing.points.length < 3 ||
    !drawing.points.every(isFiniteAnchor)
  )
    return { valid: false, risk: 0, reward: 0, ratio: null };
  const [entry, stop, target] = drawing.points;
  const sign = drawing.tool === 'long' ? 1 : -1;
  const risk = (entry.price - stop.price) * sign;
  const reward = (target.price - entry.price) * sign;
  const valid = risk > 0 && reward > 0;
  return { valid, risk, reward, ratio: valid ? reward / risk : null };
}

/** Two clicks: entry then protective-stop side. The initial target is 2R geometry, never a signal. */
export function makeDrawing(
  tool: Exclude<Tool, 'cursor'>,
  points: Anchor[],
  color = '#879bff'
): Drawing | null {
  if (points.length < DRAWING_TOOL_STEPS[tool] || !points.every(validAnchor)) return null;
  const anchors = points.map((p) => ({ ...p }));
  if (tool === 'long' || tool === 'short') {
    const [entry, stop] = anchors;
    const distance = tool === 'long' ? entry.price - stop.price : stop.price - entry.price;
    if (distance <= 0) return null;
    anchors.push({ time: stop.time, price: entry.price + (tool === 'long' ? 2 : -2) * distance });
  }
  if (!anchors.every(validAnchor)) return null;
  return {
    id: crypto.randomUUID(),
    tool,
    points: anchors,
    color,
    ...(tool === 'text' ? { text: 'Add your note' } : {}),
  };
}

/** Position entry translates the complete plan; stop and target stay on their correct sides. */
export function moveDrawingHandle(drawing: Drawing, index: number, point: Anchor): Drawing {
  if (drawing.locked || !validAnchor(point) || index < 0 || index >= drawing.points.length)
    return drawing;
  if (drawing.tool !== 'long' && drawing.tool !== 'short')
    return { ...drawing, points: drawing.points.map((p, i) => (i === index ? { ...point } : p)) };
  const entry = drawing.points[0];
  if (index === 0)
    return translateDrawing(drawing, {
      time: point.time - entry.time,
      price: point.price - entry.price,
    });
  const epsilon = Math.max(Math.abs(entry.price) * 1e-8, 1e-8);
  const isLong = drawing.tool === 'long';
  const price =
    index === 1
      ? isLong
        ? Math.min(point.price, entry.price - epsilon)
        : Math.max(point.price, entry.price + epsilon)
      : isLong
        ? Math.max(point.price, entry.price + epsilon)
        : Math.min(point.price, entry.price - epsilon);
  // Both risk/reward blocks share a single right edge.
  const points = drawing.points.map((p, i) =>
    i === index ? { time: point.time, price } : { ...p }
  );
  if (points[1] && points[2]) {
    points[1].time = point.time;
    points[2].time = point.time;
  }
  return { ...drawing, points };
}

export function measureBetween(a: Anchor, b: Anchor) {
  const change = b.price - a.price;
  return {
    change,
    percent: a.price === 0 ? null : (change / a.price) * 100,
    seconds: Math.abs(b.time - a.time),
  };
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)}h`;
  return `${(minutes / 1440).toFixed(minutes % 1440 ? 1 : 0)}d`;
}
