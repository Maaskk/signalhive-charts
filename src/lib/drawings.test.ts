import { describe, expect, it } from 'vitest';
import {
  makeDrawing,
  measureBetween,
  moveDrawingHandle,
  positionMetrics,
  translateDrawing,
} from './drawings';
import type { Drawing } from '../types';

describe('position drawing geometry', () => {
  it('creates a 2R long from entry and stop without monetary promises', () => {
    const drawing = makeDrawing('long', [
      { time: 100, price: 4180 },
      { time: 200, price: 4167 },
    ])!;
    expect(drawing.points[2]).toEqual({ time: 200, price: 4206 });
    expect(positionMetrics(drawing)).toEqual({ valid: true, risk: 13, reward: 26, ratio: 2 });
  });
  it('creates a short with reward below entry and rejects a reversed stop', () => {
    const points = [
      { time: 100, price: 4180 },
      { time: 200, price: 4193 },
    ];
    expect(makeDrawing('long', points)).toBeNull();
    expect(makeDrawing('short', points)!.points[2].price).toBe(4154);
  });
  it('moves the entry and preserves both risk distances and time span', () => {
    const drawing = makeDrawing('long', [
      { time: 100, price: 100 },
      { time: 200, price: 90 },
    ])!;
    const moved = moveDrawingHandle(drawing, 0, { time: 150, price: 110 });
    expect(moved.points).toEqual([
      { time: 150, price: 110 },
      { time: 250, price: 100 },
      { time: 250, price: 130 },
    ]);
    expect(positionMetrics(moved).ratio).toBe(2);
  });
  it('keeps a dragged stop protective and preserves the shared width', () => {
    const drawing = makeDrawing('short', [
      { time: 100, price: 100 },
      { time: 200, price: 110 },
    ])!;
    const moved = moveDrawingHandle(drawing, 1, { time: 250, price: 80 });
    expect(moved.points[1].price).toBeGreaterThan(100);
    expect(moved.points[2].time).toBe(250);
    expect(positionMetrics(moved).valid).toBe(true);
  });
  it('reports invalid imported geometry without a misleading ratio', () => {
    const drawing = {
      tool: 'long',
      points: [
        { time: 1, price: 10 },
        { time: 2, price: 12 },
        { time: 2, price: 20 },
      ],
    } as Drawing;
    expect(positionMetrics(drawing).ratio).toBeNull();
  });
  it('never moves locked drawings and rejects non-finite coordinates', () => {
    const drawing = {
      ...makeDrawing('trend', [
        { time: 1, price: 1 },
        { time: 2, price: 2 },
      ])!,
      locked: true,
    };
    expect(translateDrawing(drawing, { time: 1, price: 2 })).toBe(drawing);
    expect(
      makeDrawing('trend', [
        { time: NaN, price: 1 },
        { time: 2, price: 2 },
      ])
    ).toBeNull();
  });
  it('measures both directions and avoids division by zero', () => {
    expect(measureBetween({ time: 100, price: 100 }, { time: 160, price: 90 })).toEqual({
      change: -10,
      percent: -10,
      seconds: 60,
    });
    expect(measureBetween({ time: 100, price: 0 }, { time: 160, price: 90 }).percent).toBeNull();
  });
});
