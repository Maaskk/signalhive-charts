import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Projection } from '../types';
import type { PaperPosition } from '../lib/paper';

type Kind = 'stopLoss' | 'takeProfit';
interface Drag {
  id: string;
  kind: Kind;
  pointerId: number;
  price: number;
}
interface Props {
  projection: Projection;
  positions: PaperPosition[];
  decimals: number;
  onAmend: (id: string, patch: { stopLoss: number; takeProfit: number }) => void;
}

/** Only virtual paper levels are amendable here; this component has no broker/network access. */
export function PaperLevels({ projection, positions, decimals, onAmend }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const active = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Drag | null>(null);
  const latest = useRef({ projection, positions, onAmend });
  latest.current = { projection, positions, onAmend };
  const cancel = () => {
    const drag = active.current;
    if (drag && svg.current?.hasPointerCapture(drag.pointerId))
      svg.current.releasePointerCapture(drag.pointerId);
    active.current = null;
    setPreview(null);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const start = (e: PointerEvent<SVGGElement>, position: PaperPosition, kind: Kind) => {
    if (e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    active.current = { id: position.id, kind, pointerId: e.pointerId, price: position[kind] };
    setPreview(active.current);
    svg.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const drag = active.current,
      bounds = svg.current?.getBoundingClientRect();
    if (!drag || !bounds || drag.pointerId !== e.pointerId) return;
    const point = latest.current.projection.from(e.clientX - bounds.left, e.clientY - bounds.top);
    if (!point || point.price <= 0) return;
    active.current = { ...drag, price: Number(point.price.toFixed(decimals)) };
    setPreview(active.current);
  };
  const finish = (e: PointerEvent<SVGSVGElement>) => {
    const drag = active.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const position = latest.current.positions.find((p) => p.id === drag.id);
    cancel();
    if (position && drag.price !== position[drag.kind])
      latest.current.onAmend(drag.id, {
        stopLoss: drag.kind === 'stopLoss' ? drag.price : position.stopLoss,
        takeProfit: drag.kind === 'takeProfit' ? drag.price : position.takeProfit,
      });
  };
  return (
    <svg
      ref={svg}
      className="paper-levels"
      xmlns="http://www.w3.org/2000/svg"
      width={projection.width}
      height={projection.height}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        zIndex: 5,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
      aria-label="Draggable paper stop loss and take profit"
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
    >
      {positions.map((position) => (
        <g key={position.id}>
          {(['stopLoss', 'takeProfit'] as const).map((kind) => {
            const price =
              preview?.id === position.id && preview.kind === kind ? preview.price : position[kind];
            const y = projection.y(price);
            if (y === null) return null;
            const color = kind === 'stopLoss' ? '#ef6476' : '#2cc9a1';
            const label = `PAPER ${kind === 'stopLoss' ? 'SL' : 'TP'} ${price.toFixed(decimals)}`;
            const right = projection.width - 8;
            return (
              <g
                key={kind}
                onPointerDown={(e) => start(e, position, kind)}
                style={{ pointerEvents: 'all', cursor: 'ns-resize', touchAction: 'none' }}
                data-paper-level={kind}
              >
                <line
                  x1={0}
                  y1={y}
                  x2={right}
                  y2={y}
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="5 4"
                  pointerEvents="none"
                />
                <line
                  x1={Math.max(0, right - 250)}
                  y1={y}
                  x2={right}
                  y2={y}
                  stroke="transparent"
                  strokeWidth={18}
                  pointerEvents="stroke"
                />
                <rect
                  x={Math.max(4, right - 175)}
                  y={y - 12}
                  width={169}
                  height={24}
                  rx={4}
                  fill="#152033"
                  stroke={color}
                  strokeOpacity={0.7}
                />
                <text
                  x={right - 164}
                  y={y + 4}
                  fill={color}
                  fontFamily="system-ui"
                  fontSize={10}
                  pointerEvents="none"
                >
                  {label}
                </text>
                <circle cx={right - 13} cy={y} r={4} fill={color} />
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
