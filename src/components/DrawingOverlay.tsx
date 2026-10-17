import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Anchor, Drawing, Projection, Tool } from '../types';
import {
  DRAWING_TOOL_STEPS,
  formatDuration,
  makeDrawing,
  measureBetween,
  moveDrawingHandle,
  positionMetrics,
  translateDrawing,
} from '../lib/drawings';

export { DRAWING_TOOL_STEPS } from '../lib/drawings';
export interface DrawingOverlayProps {
  projection: Projection;
  tool: Tool;
  drawings: Drawing[];
  selectedId: string | null;
  onChange: (drawings: Drawing[]) => void;
  onSelect: (id: string | null) => void;
  onToolChange: (tool: Tool) => void;
}
type XY = { x: number; y: number };
type Drag = { original: Drawing; start: Anchor; handle: number | null; pointerId: number };
const green = '#2dd4a7',
  red = '#fb7185';
const priceText = (price: number) =>
  price.toLocaleString('en-US', { maximumFractionDigits: Math.abs(price) < 10 ? 5 : 2 });

function Label({
  x,
  y,
  text,
  color = '#d8e0ef',
  background = '#182131',
  align = 'start',
}: {
  x: number;
  y: number;
  text: string;
  color?: string;
  background?: string;
  align?: 'start' | 'middle' | 'end';
}) {
  const width = Math.max(36, text.length * 6.6 + 16);
  const left = align === 'middle' ? x - width / 2 : align === 'end' ? x - width : x;
  return (
    <g pointerEvents="none">
      <rect
        x={left}
        y={y - 17}
        width={width}
        height={23}
        rx={5}
        fill={background}
        fillOpacity={0.96}
      />
      <text
        x={left + 8}
        y={y - 2}
        fill={color}
        fontSize={11}
        fontWeight={500}
        fontFamily="Inter, system-ui, sans-serif"
      >
        {text}
      </text>
    </g>
  );
}

function Geometry({
  drawing: d,
  projection: p,
  selected,
  draft,
}: {
  drawing: Drawing;
  projection: Projection;
  selected: boolean;
  draft?: boolean;
}) {
  const points = d.points.map((a) => ({ x: p.x(a.time), y: p.y(a.price) }));
  if (
    !points.length ||
    points.some(
      (a) => a.x === null || a.y === null || !Number.isFinite(a.x) || !Number.isFinite(a.y)
    )
  )
    return null;
  const pts = points as XY[];
  const [a, b = a, c = b] = pts;
  const color = d.color || '#879bff';
  const strokeWidth = selected ? 2 : 1.6;
  const line = (x1: number, y1: number, x2: number, y2: number, shade = color, dash?: string) => (
    <>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={shade}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        pointerEvents="none"
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="transparent"
        strokeWidth={16}
        pointerEvents={draft ? 'none' : 'stroke'}
      />
    </>
  );
  let content: ReactNode;
  switch (d.tool) {
    case 'horizontal':
      content = (
        <>
          {line(0, a.y, p.width, a.y)}
          <Label
            x={p.width - 8}
            y={Math.max(20, a.y - 6)}
            text={priceText(d.points[0].price)}
            color={color}
            align="end"
          />
        </>
      );
      break;
    case 'vertical':
      content = line(a.x, 0, a.x, p.height, color, '4 4');
      break;
    case 'ray': {
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const scale =
        Math.abs(dx) < 0.01
          ? p.height / Math.max(1, Math.abs(dy)) + 2
          : (dx > 0 ? p.width - a.x : -a.x) / dx;
      content = line(a.x, a.y, a.x + dx * Math.max(1, scale), a.y + dy * Math.max(1, scale));
      break;
    }
    case 'rectangle': {
      const x = Math.min(a.x, b.x),
        y = Math.min(a.y, b.y),
        width = Math.max(1, Math.abs(b.x - a.x)),
        height = Math.max(1, Math.abs(b.y - a.y));
      content = (
        <>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill={color}
            fillOpacity={0.11}
            stroke={color}
            strokeWidth={strokeWidth}
            pointerEvents={draft ? 'none' : 'all'}
          />
          {d.text && <Label x={x + 7} y={y + 24} text={d.text} color={color} />}
        </>
      );
      break;
    }
    case 'ellipse':
      content = (
        <ellipse
          cx={(a.x + b.x) / 2}
          cy={(a.y + b.y) / 2}
          rx={Math.max(1, Math.abs(b.x - a.x) / 2)}
          ry={Math.max(1, Math.abs(b.y - a.y) / 2)}
          fill={color}
          fillOpacity={0.08}
          stroke={color}
          strokeWidth={strokeWidth}
          pointerEvents={draft ? 'none' : 'all'}
        />
      );
      break;
    case 'fib': {
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const left = Math.min(a.x, b.x),
        right = Math.max(a.x, b.x);
      content = (
        <>
          {levels.map((level, i) => {
            const y = a.y + (b.y - a.y) * level;
            const price = d.points[0].price + (d.points[1].price - d.points[0].price) * level;
            const shade = [
              '#8d9ab1',
              '#ef9a76',
              '#e8c776',
              '#2dd4a7',
              '#60c2e5',
              '#a493ee',
              '#8d9ab1',
            ][i];
            return (
              <g key={level}>
                {line(left, y, right, y, shade, '4 3')}
                <text x={left + 5} y={y - 5} fill={shade} fontSize={10} pointerEvents="none">
                  {level.toFixed(3)} · {priceText(price)}
                </text>
              </g>
            );
          })}
          {line(a.x, a.y, b.x, b.y, color, '2 5')}
        </>
      );
      break;
    }
    case 'channel': {
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const length2 = dx * dx + dy * dy;
      const t = length2 ? ((c.x - a.x) * dx + (c.y - a.y) * dy) / length2 : 0;
      const ox = c.x - a.x - t * dx,
        oy = c.y - a.y - t * dy;
      content = (
        <>
          <polygon
            points={`${a.x},${a.y} ${b.x},${b.y} ${b.x + ox},${b.y + oy} ${a.x + ox},${a.y + oy}`}
            fill={color}
            fillOpacity={0.07}
            pointerEvents={draft ? 'none' : 'all'}
          />
          {line(a.x, a.y, b.x, b.y)}
          {line(a.x + ox, a.y + oy, b.x + ox, b.y + oy)}
          {line(a.x + ox / 2, a.y + oy / 2, b.x + ox / 2, b.y + oy / 2, color, '5 5')}
        </>
      );
      break;
    }
    case 'long':
    case 'short': {
      if (d.points.length < 3) {
        content = line(a.x, a.y, b.x, b.y, color, '4 4');
        break;
      }
      const metrics = positionMetrics(d);
      const left = Math.min(a.x, b.x),
        width = Math.max(30, Math.abs(b.x - a.x)),
        right = left + width;
      content = (
        <>
          <rect
            x={left}
            y={Math.min(a.y, c.y)}
            width={width}
            height={Math.abs(c.y - a.y)}
            fill={green}
            fillOpacity={0.16}
            stroke={green}
            strokeOpacity={0.5}
            pointerEvents={draft ? 'none' : 'all'}
          />
          <rect
            x={left}
            y={Math.min(a.y, b.y)}
            width={width}
            height={Math.abs(b.y - a.y)}
            fill={red}
            fillOpacity={0.16}
            stroke={red}
            strokeOpacity={0.5}
            pointerEvents={draft ? 'none' : 'all'}
          />
          {line(left, a.y, right, a.y, '#c4cede')}
          {line(left, b.y, right, b.y, red)}
          {line(left, c.y, right, c.y, green)}
          <Label
            x={left + width / 2}
            y={Math.max(19, c.y - 7)}
            align="middle"
            text={`TARGET ${priceText(d.points[2].price)}`}
            color={green}
            background="#15382f"
          />
          <Label
            x={left + width / 2}
            y={Math.min(p.height - 8, b.y + 24)}
            align="middle"
            text={`STOP ${priceText(d.points[1].price)}`}
            color={red}
            background="#3c222b"
          />
          <Label
            x={left + width / 2}
            y={a.y - 7}
            align="middle"
            text={`${d.tool.toUpperCase()} · ${priceText(d.points[0].price)} · ${metrics.valid ? `R/R 1:${metrics.ratio!.toFixed(2)}` : 'INVALID LEVELS'}`}
            color={metrics.valid ? '#e0e7f5' : red}
          />
        </>
      );
      break;
    }
    case 'text': {
      const text = d.text || 'Add your note';
      content = (
        <g>
          <rect
            x={a.x - 4}
            y={a.y - 20}
            width={Math.max(60, text.length * 7.5 + 14)}
            height={28}
            rx={5}
            fill="#182131"
            fillOpacity={0.9}
            stroke={selected ? color : 'transparent'}
            pointerEvents={draft ? 'none' : 'all'}
          />
          <text x={a.x + 4} y={a.y - 2} fill={color} fontSize={13} pointerEvents="none">
            {text}
          </text>
        </g>
      );
      break;
    }
    case 'measure': {
      const measure = measureBetween(d.points[0], d.points[1] ?? d.points[0]);
      const text = `${measure.change >= 0 ? '+' : ''}${priceText(measure.change)} (${measure.percent?.toFixed(2) ?? '—'}%) · ${formatDuration(measure.seconds)}`;
      content = (
        <>
          <rect
            x={Math.min(a.x, b.x)}
            y={Math.min(a.y, b.y)}
            width={Math.max(1, Math.abs(b.x - a.x))}
            height={Math.max(1, Math.abs(b.y - a.y))}
            fill={color}
            fillOpacity={0.08}
            stroke={color}
            strokeDasharray="4 3"
            pointerEvents={draft ? 'none' : 'all'}
          />
          {line(a.x, a.y, b.x, b.y, color, '3 4')}
          <Label
            x={(a.x + b.x) / 2}
            y={Math.min(a.y, b.y) - 8}
            text={text}
            align="middle"
            color={color}
          />
        </>
      );
      break;
    }
    case 'arrow': {
      const angle = Math.atan2(b.y - a.y, b.x - a.x),
        length = 12;
      const x1 = b.x - length * Math.cos(angle - 0.45),
        y1 = b.y - length * Math.sin(angle - 0.45);
      const x2 = b.x - length * Math.cos(angle + 0.45),
        y2 = b.y - length * Math.sin(angle + 0.45);
      content = (
        <>
          {line(a.x, a.y, b.x, b.y)}
          <polygon
            points={`${b.x},${b.y} ${x1},${y1} ${x2},${y2}`}
            fill={color}
            pointerEvents="none"
          />
        </>
      );
      break;
    }
    default:
      content = line(a.x, a.y, b.x, b.y);
  }
  return <g opacity={draft ? 0.7 : 1}>{content}</g>;
}

export function DrawingOverlay(props: DrawingOverlayProps) {
  const { projection, tool, drawings, selectedId, onChange, onSelect, onToolChange } = props;
  const svg = useRef<SVGSVGElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const drag = useRef<Drag | null>(null);
  const movingRef = useRef<Drawing | null>(null);
  const [moving, setMoving] = useState<Drawing | null>(null);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [pointer, setPointer] = useState<Anchor | null>(null);

  const cancel = () => {
    const pointerId = drag.current?.pointerId;
    if (pointerId !== undefined && svg.current?.hasPointerCapture(pointerId))
      svg.current.releasePointerCapture(pointerId);
    drag.current = null;
    movingRef.current = null;
    setMoving(null);
    setAnchors([]);
    setPointer(null);
  };
  useEffect(() => {
    cancel();
  }, [tool]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancel();
        latest.current.onSelect(null);
        latest.current.onToolChange('cursor');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const anchorFrom = (e: ReactPointerEvent) => {
    const bounds = svg.current?.getBoundingClientRect();
    return bounds ? projection.from(e.clientX - bounds.left, e.clientY - bounds.top) : null;
  };
  const startDrag = (e: ReactPointerEvent, drawing: Drawing, handle: number | null = null) => {
    if (tool !== 'cursor' || drag.current || !e.isPrimary) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(drawing.id);
    const start = anchorFrom(e);
    if (drawing.locked || !start) return;
    drag.current = { original: drawing, start, handle, pointerId: e.pointerId };
    movingRef.current = drawing;
    setMoving(drawing);
    svg.current?.setPointerCapture(e.pointerId);
  };
  const create = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === 'cursor' || e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    const point = anchorFrom(e);
    if (!point) return;
    const next = [...anchors, point];
    if (next.length >= DRAWING_TOOL_STEPS[tool]) {
      const drawing = makeDrawing(tool, next);
      if (!drawing) return;
      onChange([...drawings, drawing]);
      onSelect(drawing.id);
      setAnchors([]);
      setPointer(null);
      onToolChange('cursor');
    } else {
      setAnchors(next);
      setPointer(point);
    }
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const point = anchorFrom(e);
    if (!point) return;
    const active = drag.current;
    if (active) {
      if (active.pointerId !== e.pointerId) return;
      const drawing =
        active.handle === null
          ? translateDrawing(active.original, {
              time: point.time - active.start.time,
              price: point.price - active.start.price,
            })
          : moveDrawingHandle(active.original, active.handle, point);
      movingRef.current = drawing;
      setMoving(drawing);
    } else if (tool !== 'cursor') setPointer(point);
  };
  const finish = (e: ReactPointerEvent<SVGSVGElement>) => {
    const active = drag.current,
      drawing = movingRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
    drag.current = null;
    movingRef.current = null;
    setMoving(null);
    if (drawing && JSON.stringify(drawing.points) !== JSON.stringify(active.original.points))
      latest.current.onChange(
        latest.current.drawings.map((d) => (d.id === drawing.id ? drawing : d))
      );
  };

  let preview: Drawing | null = null;
  if (tool !== 'cursor' && anchors.length && pointer) {
    const points = [...anchors, pointer];
    preview = makeDrawing(tool, points);
    if (!preview)
      preview = {
        id: 'draft',
        tool: tool === 'channel' ? 'trend' : tool,
        points,
        color: '#879bff',
      };
  }
  const hints: Partial<Record<Tool, string>> = {
    long: anchors.length
      ? 'Click BELOW entry for stop. Target starts at 2R; drag to adjust.'
      : 'Click entry, then protective stop. Drawing only; no order.',
    short: anchors.length
      ? 'Click ABOVE entry for stop. Target starts at 2R; drag to adjust.'
      : 'Click entry, then protective stop. Drawing only; no order.',
    channel:
      anchors.length === 2 ? 'Click to set channel width' : 'Click two points for the base trend',
    text: 'Click to place a note, then edit its text in the inspector',
  };
  return (
    <svg
      ref={svg}
      className="drawing-overlay"
      xmlns="http://www.w3.org/2000/svg"
      width={projection.width}
      height={projection.height}
      viewBox={`0 0 ${projection.width} ${projection.height}`}
      aria-label="Interactive chart drawings"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        zIndex: 4,
        overflow: 'hidden',
        pointerEvents: tool === 'cursor' && !moving ? 'none' : 'auto',
        touchAction: tool === 'cursor' && !moving ? 'auto' : 'none',
        cursor: tool === 'cursor' ? undefined : 'crosshair',
      }}
      onPointerDown={create}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={() => cancel()}
    >
      {drawings
        .filter((d) => !d.hidden)
        .map((drawing) => {
          const d = moving?.id === drawing.id ? moving : drawing;
          const selected = selectedId === d.id;
          return (
            <g
              key={d.id}
              onPointerDown={(e) => startDrag(e, d)}
              style={{ cursor: d.locked ? 'default' : 'grab' }}
              data-drawing-id={d.id}
            >
              <Geometry drawing={d} projection={projection} selected={selected} />
              {selected &&
                !d.locked &&
                d.points.map((point, i) => {
                  const x = projection.x(point.time),
                    y = projection.y(point.price);
                  if (x === null || y === null) return null;
                  return (
                    <g
                      key={i}
                      onPointerDown={(e) => startDrag(e, d, i)}
                      pointerEvents="all"
                      style={{ cursor: 'grab' }}
                    >
                      <circle cx={x} cy={y} r={12} fill="transparent" />
                      <circle
                        cx={x}
                        cy={y}
                        r={5}
                        fill="#121a29"
                        stroke={
                          d.tool === 'long' || d.tool === 'short'
                            ? i === 1
                              ? red
                              : i === 2
                                ? green
                                : '#c4cede'
                            : d.color
                        }
                        strokeWidth={2}
                      />
                    </g>
                  );
                })}
            </g>
          );
        })}
      {preview && (
        <g pointerEvents="none">
          <Geometry drawing={preview} projection={projection} selected={false} draft />
        </g>
      )}
      {tool !== 'cursor' && (
        <Label
          x={12}
          y={projection.height - 13}
          text={`${anchors.length + 1}/${DRAWING_TOOL_STEPS[tool]} · ${hints[tool] ?? 'Click to place the next point'} · Esc cancels`}
          color="#b2c0ff"
        />
      )}
    </svg>
  );
}

export default DrawingOverlay;
