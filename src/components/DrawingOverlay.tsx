import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Anchor, Drawing, Projection, Tool } from '../types';
import {
  clipExtendedLine,
  drawingDash,
  fibPriceAt,
  resolveDrawingStyle,
} from '../lib/drawingStyle';
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
  onProperties?: (id: string) => void;
}
type XY = { x: number; y: number };
type Drag = { original: Drawing; start: Anchor; handle: number | null; pointerId: number };
const priceText = (price: number) =>
  price.toLocaleString('en-US', { maximumFractionDigits: Math.abs(price) < 10 ? 5 : 2 });

function Label({
  x,
  y,
  text,
  color = '#d8e0ef',
  background = '#182131',
  align = 'start',
  fontSize = 12,
}: {
  x: number;
  y: number;
  text: string;
  color?: string;
  background?: string;
  align?: 'start' | 'middle' | 'end';
  fontSize?: number;
}) {
  const width = Math.max(36, text.length * fontSize * 0.61 + 16),
    height = fontSize + 12;
  const left = align === 'middle' ? x - width / 2 : align === 'end' ? x - width : x;
  return (
    <g pointerEvents="none">
      <rect
        x={left}
        y={y - fontSize - 6}
        width={width}
        height={height}
        rx={5}
        fill={background}
        fillOpacity={0.96}
      />
      <text
        x={left + 8}
        y={y - 2}
        fill={color}
        fontSize={fontSize}
        fontWeight={500}
        fontFamily="Inter, system-ui, sans-serif"
      >
        {text}
      </text>
    </g>
  );
}

/** Shared rendered geometry; actual properties are applied to SVG rather than stored as decoration. */
export function DrawingGeometry({
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
  const pts = points as XY[],
    [a, b = a, c = b] = pts;
  const color = d.color || '#879bff',
    style = resolveDrawingStyle(d),
    dash = drawingDash(style.lineStyle);
  const target = style.targetColor,
    stop = style.stopColor;
  const line = (x1: number, y1: number, x2: number, y2: number, shade = color) => (
    <>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={shade}
        strokeWidth={style.lineWidth}
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
  const extended = (first: XY, second: XY, shade = color) => {
    const ends = clipExtendedLine(
      first,
      second,
      p.width,
      p.height,
      style.extendLeft,
      style.extendRight
    );
    return ends ? line(ends[0].x, ends[0].y, ends[1].x, ends[1].y, shade) : null;
  };
  const label = (
    x: number,
    y: number,
    text: string,
    shade = color,
    align: 'start' | 'middle' | 'end' = 'start'
  ) =>
    style.showLabels ? (
      <Label x={x} y={y} text={text} color={shade} align={align} fontSize={style.fontSize} />
    ) : null;
  const shapeStyle = {
    fill: style.fillColor,
    fillOpacity: style.fillOpacity,
    stroke: color,
    strokeWidth: style.lineWidth,
    strokeDasharray: dash,
    pointerEvents: draft ? ('none' as const) : ('all' as const),
  };
  let content: ReactNode;
  switch (d.tool) {
    case 'horizontal':
      content = (
        <>
          {line(0, a.y, p.width, a.y)}
          {label(
            p.width - 8,
            Math.max(style.fontSize + 10, a.y - 6),
            `${d.text ? d.text + ' · ' : ''}${priceText(d.points[0].price)}`,
            color,
            'end'
          )}
        </>
      );
      break;
    case 'vertical':
      content = (
        <>
          {line(a.x, 0, a.x, p.height)}
          {label(
            a.x + 6,
            style.fontSize + 15,
            new Date(d.points[0].time * 1000).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
          )}
        </>
      );
      break;
    case 'ray':
    case 'trend':
      content = extended(a, b);
      break;
    case 'rectangle': {
      const left = style.extendLeft ? 0 : Math.min(a.x, b.x),
        right = style.extendRight ? p.width : Math.max(a.x, b.x),
        top = Math.min(a.y, b.y);
      content = (
        <>
          <rect
            x={left}
            y={top}
            width={Math.max(1, right - left)}
            height={Math.max(1, Math.abs(b.y - a.y))}
            {...shapeStyle}
          />
          {d.text && label(left + 7, top + style.fontSize + 12, d.text)}
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
          {...shapeStyle}
        />
      );
      break;
    case 'fib': {
      const left = style.extendLeft ? 0 : Math.min(a.x, b.x),
        right = style.extendRight ? p.width : Math.max(a.x, b.x);
      content = (
        <>
          {style.fibLevels
            .filter((level) => level.visible)
            .map((level) => {
              const y = fibPriceAt(a.y, b.y, level.value, style.reverseFib);
              const price = fibPriceAt(
                d.points[0].price,
                d.points[1].price,
                level.value,
                style.reverseFib
              );
              return (
                <g key={level.value} data-fib-ratio={level.value}>
                  {line(left, y, right, y, level.color)}
                  {style.showLabels && (
                    <text
                      x={left + 5}
                      y={y - 5}
                      fill={level.color}
                      fontSize={style.fontSize}
                      pointerEvents="none"
                    >
                      {level.value.toFixed(3)} · {priceText(price)}
                    </text>
                  )}
                </g>
              );
            })}
          {line(a.x, a.y, b.x, b.y)}
        </>
      );
      break;
    }
    case 'channel': {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length2 = dx * dx + dy * dy;
      const t = length2 ? ((c.x - a.x) * dx + (c.y - a.y) * dy) / length2 : 0;
      const ox = c.x - a.x - t * dx,
        oy = c.y - a.y - t * dy;
      const ends = clipExtendedLine(a, b, p.width, p.height, style.extendLeft, style.extendRight);
      const [first, second] = ends ?? [a, b];
      content = (
        <>
          <polygon
            points={`${first.x},${first.y} ${second.x},${second.y} ${second.x + ox},${second.y + oy} ${first.x + ox},${first.y + oy}`}
            fill={style.fillColor}
            fillOpacity={style.fillOpacity}
            pointerEvents={draft ? 'none' : 'all'}
          />
          {extended(a, b)}
          {extended({ x: a.x + ox, y: a.y + oy }, { x: b.x + ox, y: b.y + oy })}
          {extended({ x: a.x + ox / 2, y: a.y + oy / 2 }, { x: b.x + ox / 2, y: b.y + oy / 2 })}
        </>
      );
      break;
    }
    case 'long':
    case 'short': {
      if (d.points.length < 3) {
        content = line(a.x, a.y, b.x, b.y);
        break;
      }
      const metrics = positionMetrics(d),
        left = Math.min(a.x, b.x),
        width = Math.max(30, Math.abs(b.x - a.x)),
        right = left + width;
      content = (
        <>
          <rect
            x={left}
            y={Math.min(a.y, c.y)}
            width={width}
            height={Math.abs(c.y - a.y)}
            {...shapeStyle}
            fill={target}
            stroke={target}
          />
          <rect
            x={left}
            y={Math.min(a.y, b.y)}
            width={width}
            height={Math.abs(b.y - a.y)}
            {...shapeStyle}
            fill={stop}
            stroke={stop}
          />
          {line(left, a.y, right, a.y, color)}
          {line(left, b.y, right, b.y, stop)}
          {line(left, c.y, right, c.y, target)}
          {label(
            left + width / 2,
            Math.max(style.fontSize + 8, c.y - 7),
            `TARGET ${priceText(d.points[2].price)}`,
            target,
            'middle'
          )}
          {label(
            left + width / 2,
            Math.min(p.height - 8, b.y + style.fontSize + 12),
            `STOP ${priceText(d.points[1].price)}`,
            stop,
            'middle'
          )}
          {label(
            left + width / 2,
            a.y - 7,
            `${d.tool.toUpperCase()} · ${priceText(d.points[0].price)} · ${metrics.valid ? `R/R 1:${metrics.ratio!.toFixed(2)}` : 'INVALID LEVELS'}`,
            metrics.valid ? '#e0e7f5' : stop,
            'middle'
          )}
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
            y={a.y - style.fontSize - 7}
            width={Math.max(60, text.length * style.fontSize * 0.61 + 16)}
            height={style.fontSize + 14}
            rx={5}
            fill={style.fillColor}
            fillOpacity={style.fillOpacity}
            stroke={selected ? color : 'transparent'}
            pointerEvents={draft ? 'none' : 'all'}
          />
          <text x={a.x + 4} y={a.y - 2} fill={color} fontSize={style.fontSize} pointerEvents="none">
            {text}
          </text>
        </g>
      );
      break;
    }
    case 'measure': {
      const measure = measureBetween(d.points[0], d.points[1] ?? d.points[0]);
      content = (
        <>
          <rect
            x={Math.min(a.x, b.x)}
            y={Math.min(a.y, b.y)}
            width={Math.max(1, Math.abs(b.x - a.x))}
            height={Math.max(1, Math.abs(b.y - a.y))}
            {...shapeStyle}
          />
          {line(a.x, a.y, b.x, b.y)}
          {label(
            (a.x + b.x) / 2,
            Math.min(a.y, b.y) - 8,
            `${measure.change >= 0 ? '+' : ''}${priceText(measure.change)} (${measure.percent?.toFixed(2) ?? '—'}%) · ${formatDuration(measure.seconds)}`,
            color,
            'middle'
          )}
        </>
      );
      break;
    }
    case 'arrow': {
      const angle = Math.atan2(b.y - a.y, b.x - a.x),
        length = 10 + style.lineWidth * 2;
      content = (
        <>
          {line(a.x, a.y, b.x, b.y)}
          <polygon
            points={`${b.x},${b.y} ${b.x - length * Math.cos(angle - 0.45)},${b.y - length * Math.sin(angle - 0.45)} ${b.x - length * Math.cos(angle + 0.45)},${b.y - length * Math.sin(angle + 0.45)}`}
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
  return (
    <g opacity={draft ? 0.7 : 1}>
      {content}
      {d.text &&
        !['rectangle', 'text', 'horizontal'].includes(d.tool) &&
        label(a.x + 7, a.y - 10, d.text)}
    </g>
  );
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
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelect(d.id);
                props.onProperties?.(d.id);
              }}
              style={{ cursor: d.locked ? 'default' : 'grab' }}
              data-drawing-id={d.id}
            >
              <DrawingGeometry drawing={d} projection={projection} selected={selected} />
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
                              ? resolveDrawingStyle(d).stopColor
                              : i === 2
                                ? resolveDrawingStyle(d).targetColor
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
          <DrawingGeometry drawing={preview} projection={projection} selected={false} draft />
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
