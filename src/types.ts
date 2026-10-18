import type { DrawingStyle } from './lib/drawingStyle';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '5m' | '15m' | '1h' | '4h' | '1D';
export type InstrumentId = 'XAUUSD' | 'EURUSD' | 'BTCUSD';
export interface Instrument {
  id: InstrumentId;
  name: string;
  category: string;
  decimals: number;
  contractSize: number;
  minLots: number;
  lotStep: number;
}

export type Tool =
  | 'cursor'
  | 'trend'
  | 'ray'
  | 'horizontal'
  | 'vertical'
  | 'rectangle'
  | 'ellipse'
  | 'fib'
  | 'channel'
  | 'long'
  | 'short'
  | 'text'
  | 'measure'
  | 'arrow';
export interface Anchor {
  time: number;
  price: number;
}
export interface Drawing {
  id: string;
  tool: Exclude<Tool, 'cursor'>;
  points: Anchor[];
  color: string;
  text?: string;
  locked?: boolean;
  hidden?: boolean;
  style?: DrawingStyle;
}
export interface Projection {
  x: (time: number) => number | null;
  y: (price: number) => number | null;
  from: (x: number, y: number) => Anchor | null;
  width: number;
  height: number;
  revision: number;
}
export type IndicatorId =
  'ema' | 'sma' | 'bollinger' | 'levels' | 'volume' | 'rsi' | 'macd' | 'atr';
export interface IndicatorSettings {
  ema: boolean;
  sma: boolean;
  bollinger: boolean;
  levels: boolean;
  volume: boolean;
  rsi: boolean;
  macd: boolean;
  atr: boolean;
}
