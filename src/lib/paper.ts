import type { Candle, InstrumentId } from '../types';
import { INSTRUMENT_BY_ID, validateCandles } from './market';

export type Marks = Partial<Record<InstrumentId, number>>;
export type Side = 'buy' | 'sell';
export type CloseReason = 'manual' | 'stop-loss' | 'take-profit';
export interface PaperSettings {
  leverage: number;
  riskPerTrade: number;
  maxAggregateRisk: number;
}
export interface PaperPosition {
  id: string;
  instrument: InstrumentId;
  side: Side;
  lots: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: number;
  margin: number;
  risk: number;
}
export interface ClosedPaperTrade extends PaperPosition {
  exitPrice: number;
  closedAt: number;
  pnl: number;
  reason: CloseReason;
}
export interface PaperAccount {
  initialBalance: number;
  balance: number;
  positions: PaperPosition[];
  trades: ClosedPaperTrade[];
  nextId: number;
  settings: PaperSettings;
}
export interface OpenPaperRequest {
  instrument: InstrumentId;
  side: Side;
  lots: number;
  price: number;
  stopLoss: number;
  takeProfit: number;
  time: number;
}
export type PaperSizeRequest = Omit<OpenPaperRequest, 'lots' | 'time'>;
export interface PaperSizeResult {
  lots: number | null;
  risk: number;
  margin: number;
  reason: string | null;
}
export interface PaperAmendment {
  stopLoss: number;
  takeProfit: number;
}
export interface PaperSummary {
  balance: number;
  equity: number;
  unrealizedPnl: number;
  usedMargin: number;
  freeMargin: number;
  riskAtStops: number;
  openCount: number;
  closedPnl: number;
}
const DEFAULT_SETTINGS: PaperSettings = {
  leverage: 100,
  riskPerTrade: 0.005,
  maxAggregateRisk: 0.02,
};

function finite(value: unknown, name: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0))
    throw new Error(`${name} must be a finite${positive ? ' positive' : ''} number.`);
  return value;
}
function timeValue(value: unknown, name: string): number {
  const n = finite(value, name);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${name} must be integer UTC seconds.`);
  return n;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid paper account object.');
  return value as Record<string, unknown>;
}
function instrument(value: unknown): InstrumentId {
  if (value !== 'XAUUSD' && value !== 'EURUSD' && value !== 'BTCUSD')
    throw new Error('Unknown paper instrument.');
  return value;
}
function side(value: unknown): Side {
  if (value !== 'buy' && value !== 'sell') throw new Error('Side must be buy or sell.');
  return value;
}
function validateLots(id: InstrumentId, lots: number): void {
  finite(lots, 'Lots', true);
  const spec = INSTRUMENT_BY_ID[id];
  const steps = lots / spec.lotStep;
  if (lots < spec.minLots - 1e-12 || Math.abs(steps - Math.round(steps)) > 1e-8)
    throw new Error(`Lots must be at least ${spec.minLots} in steps of ${spec.lotStep}.`);
}
function validateStops(direction: Side, entry: number, sl: number, tp: number): void {
  finite(entry, 'Entry', true);
  finite(sl, 'Stop loss', true);
  finite(tp, 'Take profit', true);
  if (direction === 'buy' ? !(sl < entry && entry < tp) : !(tp < entry && entry < sl))
    throw new Error(
      direction === 'buy' ? 'Buy requires SL < entry < TP.' : 'Sell requires TP < entry < SL.'
    );
}
function pnl(position: PaperPosition, price: number): number {
  return finite(
    (price - position.entryPrice) *
      (position.side === 'buy' ? 1 : -1) *
      position.lots *
      INSTRUMENT_BY_ID[position.instrument].contractSize,
    'PnL'
  );
}

export function createPaperAccount(initialBalance = 50): PaperAccount {
  finite(initialBalance, 'Initial virtual balance', true);
  return {
    initialBalance,
    balance: initialBalance,
    positions: [],
    trades: [],
    nextId: 1,
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Structural/accounting validation, not cryptographic proof of a client-side paper ledger. */
export function parsePaperAccount(value: unknown): PaperAccount {
  const state = object(value),
    settings = object(state.settings);
  const initialBalance = finite(state.initialBalance, 'Initial balance', true);
  const balance = finite(state.balance, 'Balance');
  const leverage = finite(settings.leverage, 'Leverage', true);
  const riskPerTrade = finite(settings.riskPerTrade, 'Risk limit', true);
  const maxAggregateRisk = finite(settings.maxAggregateRisk, 'Aggregate risk limit', true);
  if (
    leverage > 100 ||
    leverage < 1 ||
    riskPerTrade > DEFAULT_SETTINGS.riskPerTrade ||
    maxAggregateRisk > DEFAULT_SETTINGS.maxAggregateRisk
  )
    throw new Error(
      'Paper limits cannot exceed 1:100 leverage, 0.5% per trade and 2% aggregate risk.'
    );
  if (
    !Array.isArray(state.positions) ||
    !Array.isArray(state.trades) ||
    state.positions.length > 1000 ||
    state.trades.length > 10_000
  )
    throw new Error('Invalid or oversized paper ledger.');
  const ids = new Set<string>();
  let maximumId = 0;
  const readPosition = (value: unknown): PaperPosition => {
    const p = object(value);
    if (typeof p.id !== 'string' || !/^paper-[1-9]\d*$/.test(p.id) || ids.has(p.id))
      throw new Error('Invalid or duplicate paper position ID.');
    ids.add(p.id);
    const number = Number(p.id.slice(6));
    if (!Number.isSafeInteger(number)) throw new Error('Invalid paper ID number.');
    maximumId = Math.max(maximumId, number);
    const id = instrument(p.instrument),
      direction = side(p.side);
    const lots = finite(p.lots, 'Lots', true),
      entryPrice = finite(p.entryPrice, 'Entry', true);
    const stopLoss = finite(p.stopLoss, 'Stop', true),
      takeProfit = finite(p.takeProfit, 'Target', true);
    validateLots(id, lots);
    validateStops(direction, entryPrice, stopLoss, takeProfit);
    const margin = finite(p.margin, 'Margin', true),
      risk = finite(p.risk, 'Risk', true);
    const expectedMargin = (entryPrice * lots * INSTRUMENT_BY_ID[id].contractSize) / leverage;
    const expectedRisk = Math.abs(entryPrice - stopLoss) * lots * INSTRUMENT_BY_ID[id].contractSize;
    if (
      !Number.isFinite(expectedMargin) ||
      !Number.isFinite(expectedRisk) ||
      Math.abs(margin - expectedMargin) > 1e-7 ||
      Math.abs(risk - expectedRisk) > 1e-7
    )
      throw new Error('Stored margin or risk does not match the paper position.');
    return {
      id: p.id,
      instrument: id,
      side: direction,
      lots,
      entryPrice,
      stopLoss,
      takeProfit,
      openedAt: timeValue(p.openedAt, 'Entry time'),
      margin,
      risk,
    };
  };
  const positions = state.positions.map(readPosition);
  const trades: ClosedPaperTrade[] = state.trades.map((value) => {
    const p = object(value),
      position = readPosition(value);
    const exitPrice = finite(p.exitPrice, 'Exit', true),
      closedAt = timeValue(p.closedAt, 'Exit time');
    const profit = finite(p.pnl, 'Realized PnL');
    if (
      closedAt < position.openedAt ||
      Math.abs(profit - pnl(position, exitPrice)) > 1e-7 ||
      !['manual', 'stop-loss', 'take-profit'].includes(p.reason as string)
    )
      throw new Error('Invalid closed paper trade.');
    return { ...position, exitPrice, closedAt, pnl: profit, reason: p.reason as CloseReason };
  });
  const nextId = timeValue(state.nextId, 'Next position ID');
  const expectedBalance = initialBalance + trades.reduce((sum, trade) => sum + trade.pnl, 0);
  if (nextId <= maximumId || nextId < 1 || Math.abs(balance - expectedBalance) > 1e-6)
    throw new Error('Inconsistent paper account balance or sequence.');
  return {
    initialBalance,
    balance,
    positions,
    trades,
    nextId,
    settings: { leverage, riskPerTrade, maxAggregateRisk },
  };
}

/** All monetary values are USD estimates with no spread, commission or funding model. */
export function paperSummary(account: PaperAccount, marks: Marks = {}): PaperSummary {
  const state = parsePaperAccount(account);
  for (const [id, price] of Object.entries(marks)) {
    instrument(id);
    finite(price, 'Mark price', true);
  }
  const unrealizedPnl = finite(
    state.positions.reduce(
      (sum, position) => sum + pnl(position, marks[position.instrument] ?? position.entryPrice),
      0
    ),
    'Unrealized PnL'
  );
  const usedMargin = finite(
    state.positions.reduce((sum, position) => sum + position.margin, 0),
    'Used margin'
  );
  const equity = finite(state.balance + unrealizedPnl, 'Equity');
  return {
    balance: state.balance,
    equity,
    unrealizedPnl,
    usedMargin,
    freeMargin: finite(equity - usedMargin, 'Free margin'),
    riskAtStops: finite(
      state.positions.reduce(
        (sum, position) =>
          sum +
          Math.max(
            position.risk,
            Math.max(
              0,
              ((marks[position.instrument] ?? position.entryPrice) - position.stopLoss) *
                (position.side === 'buy' ? 1 : -1)
            ) *
              position.lots *
              INSTRUMENT_BY_ID[position.instrument].contractSize
          ),
        0
      ),
      'Aggregate risk'
    ),
    openCount: state.positions.length,
    closedPnl: state.balance - state.initialBalance,
  };
}

export function openPaperPosition(
  account: PaperAccount,
  request: OpenPaperRequest,
  marks: Marks = {}
): PaperAccount {
  const state = parsePaperAccount(account);
  const id = instrument(request.instrument),
    direction = side(request.side);
  const lots = finite(request.lots, 'Lots', true),
    price = finite(request.price, 'Entry', true);
  const time = timeValue(request.time, 'Entry time');
  validateLots(id, lots);
  validateStops(direction, price, request.stopLoss, request.takeProfit);
  const units = lots * INSTRUMENT_BY_ID[id].contractSize;
  const risk = finite(Math.abs(price - request.stopLoss) * units, 'Position risk', true);
  const margin = finite((price * units) / state.settings.leverage, 'Required margin', true);
  const summary = paperSummary(state, { ...marks, [id]: price });
  if (summary.equity <= 0) throw new Error('No positive virtual equity is available.');
  if (risk > summary.equity * state.settings.riskPerTrade + 1e-9)
    throw new Error(
      `Risk $${risk.toFixed(2)} exceeds the ${(state.settings.riskPerTrade * 100).toFixed(2)}% budget ($${(summary.equity * state.settings.riskPerTrade).toFixed(2)}).`
    );
  if (summary.riskAtStops + risk > summary.equity * state.settings.maxAggregateRisk + 1e-9)
    throw new Error('Aggregate stop risk exceeds the virtual account limit.');
  if (margin > summary.freeMargin + 1e-9)
    throw new Error(
      `Required margin $${margin.toFixed(2)} exceeds free margin $${summary.freeMargin.toFixed(2)}.`
    );
  if (state.positions.length >= 1000 || state.nextId >= Number.MAX_SAFE_INTEGER)
    throw new Error('Paper ledger position limit reached.');
  const position: PaperPosition = {
    id: `paper-${state.nextId}`,
    instrument: id,
    side: direction,
    lots,
    entryPrice: price,
    stopLoss: request.stopLoss,
    takeProfit: request.takeProfit,
    openedAt: time,
    margin,
    risk,
  };
  return { ...state, nextId: state.nextId + 1, positions: [...state.positions, position] };
}

/** Floors to the broker lot step and never raises the configured risk or margin limits. */
export function calculatePaperSize(
  account: PaperAccount,
  request: PaperSizeRequest,
  marks: Marks = {}
): PaperSizeResult {
  let risk = 0;
  let margin = 0;
  try {
    const state = parsePaperAccount(account);
    const id = instrument(request.instrument);
    const direction = side(request.side);
    const price = finite(request.price, 'Entry', true);
    validateStops(direction, price, request.stopLoss, request.takeProfit);
    const spec = INSTRUMENT_BY_ID[id];
    const riskPerLot = finite(
      Math.abs(price - request.stopLoss) * spec.contractSize,
      'Risk per lot',
      true
    );
    const marginPerLot = finite(
      (price * spec.contractSize) / state.settings.leverage,
      'Margin per lot',
      true
    );
    // When the minimum lot cannot fit, report its cost rather than silently selecting it.
    risk = finite(riskPerLot * spec.minLots, 'Minimum-lot risk', true);
    margin = finite(marginPerLot * spec.minLots, 'Minimum-lot margin', true);
    const summary = paperSummary(state, { ...marks, [id]: price });
    if (summary.equity <= 0) throw new Error('No positive virtual equity is available.');
    const tradeBudget = summary.equity * state.settings.riskPerTrade;
    const aggregateBudget = Math.max(
      0,
      summary.equity * state.settings.maxAggregateRisk - summary.riskAtStops
    );
    const capacity = Math.min(
      (tradeBudget + 1e-9) / riskPerLot,
      (aggregateBudget + 1e-9) / riskPerLot,
      Math.max(0, summary.freeMargin + 1e-9) / marginPerLot
    );
    const rawSteps = capacity / spec.lotStep;
    if (!Number.isFinite(rawSteps) || rawSteps > Number.MAX_SAFE_INTEGER)
      throw new Error('The calculated paper size exceeds the supported numeric range.');
    // Correct only representational error at an exact step; final validation uses open's policy.
    const steps = Math.floor(rawSteps + Number.EPSILON * Math.max(1, rawSteps));
    const lots = Number((steps * spec.lotStep).toFixed(12));
    if (lots < spec.minLots - 1e-12) {
      const cause =
        risk > tradeBudget + 1e-9
          ? 'per-trade risk budget'
          : risk > aggregateBudget + 1e-9
            ? 'aggregate stop-risk budget'
            : 'free margin';
      throw new Error(
        `Minimum ${spec.minLots} lots exceeds the ${cause} (risk $${risk.toFixed(2)}, margin $${margin.toFixed(2)}).`
      );
    }
    // Keep sizing and order admission on exactly the same account, marks and validation path.
    const candidate = openPaperPosition(state, { ...request, lots, time: 0 }, marks);
    const position = candidate.positions[candidate.positions.length - 1];
    return { lots, risk: position.risk, margin: position.margin, reason: null };
  } catch (error) {
    return {
      lots: null,
      risk,
      margin,
      reason: error instanceof Error ? error.message : 'Unable to calculate a paper position size.',
    };
  }
}

/** A stop/target amendment remains protective relative to the original entry, with unchanged lots. */
export function amendPaperPosition(
  account: PaperAccount,
  id: string,
  amendment: PaperAmendment,
  marks: Marks = {}
): PaperAccount {
  const state = parsePaperAccount(account);
  const position = state.positions.find((p) => p.id === id);
  if (!position) throw new Error('Paper position was not found.');
  validateStops(position.side, position.entryPrice, amendment.stopLoss, amendment.takeProfit);
  const updated: PaperPosition = {
    ...position,
    stopLoss: amendment.stopLoss,
    takeProfit: amendment.takeProfit,
    risk: finite(
      Math.abs(position.entryPrice - amendment.stopLoss) *
        position.lots *
        INSTRUMENT_BY_ID[position.instrument].contractSize,
      'Position risk',
      true
    ),
  };
  const result = {
    ...state,
    positions: state.positions.map((p) => (p.id === id ? updated : p)),
  };
  const summary = paperSummary(result, marks);
  if (summary.equity <= 0) throw new Error('No positive virtual equity is available.');
  if (updated.risk > summary.equity * state.settings.riskPerTrade + 1e-9)
    throw new Error('Amended stop risk exceeds the per-trade virtual account limit.');
  if (summary.riskAtStops > summary.equity * state.settings.maxAggregateRisk + 1e-9)
    throw new Error('Amended aggregate stop risk exceeds the virtual account limit.');
  return result;
}

/** Realizes one valid lot-step portion; every partial fill receives its own unique journal ID. */
export function partialClosePaperPosition(
  account: PaperAccount,
  id: string,
  lots: number,
  price: number,
  time: number
): PaperAccount {
  const state = parsePaperAccount(account);
  const position = state.positions.find((p) => p.id === id);
  if (!position) throw new Error('Paper position was not found.');
  finite(price, 'Exit price', true);
  timeValue(time, 'Exit time');
  if (time < position.openedAt) throw new Error('Paper exit time cannot precede entry.');
  validateLots(position.instrument, lots);
  const spec = INSTRUMENT_BY_ID[position.instrument];
  const closeSteps = Math.round(lots / spec.lotStep);
  const remainingSteps = Math.round(position.lots / spec.lotStep) - closeSteps;
  if (remainingSteps < 0) throw new Error('Close lots exceed the open paper position.');
  if (remainingSteps === 0) return closePaperPosition(state, id, price, time);
  const remainingLots = Number((remainingSteps * spec.lotStep).toFixed(12));
  validateLots(position.instrument, remainingLots);
  if (state.trades.length >= 10_000)
    throw new Error('Paper trade history limit reached. Export/reset before continuing.');
  if (state.nextId >= Number.MAX_SAFE_INTEGER)
    throw new Error('Paper ledger position limit reached.');
  const portion = (volume: number): PaperPosition => ({
    ...position,
    lots: volume,
    margin: finite(
      (position.entryPrice * volume * spec.contractSize) / state.settings.leverage,
      'Position margin',
      true
    ),
    risk: finite(
      Math.abs(position.entryPrice - position.stopLoss) * volume * spec.contractSize,
      'Position risk',
      true
    ),
  });
  const closing = portion(Number((closeSteps * spec.lotStep).toFixed(12)));
  const trade: ClosedPaperTrade = {
    ...closing,
    id: `paper-${state.nextId}`,
    exitPrice: price,
    closedAt: time,
    pnl: pnl(closing, price),
    reason: 'manual',
  };
  const trades = [...state.trades, trade];
  return {
    ...state,
    nextId: state.nextId + 1,
    balance: finite(
      state.initialBalance + trades.reduce((sum, item) => sum + item.pnl, 0),
      'Balance'
    ),
    positions: state.positions.map((p) => (p.id === id ? portion(remainingLots) : p)),
    trades,
  };
}

export function closePaperPosition(
  account: PaperAccount,
  id: string,
  price: number,
  time: number,
  reason: CloseReason = 'manual'
): PaperAccount {
  const state = parsePaperAccount(account);
  finite(price, 'Exit price', true);
  timeValue(time, 'Exit time');
  const position = state.positions.find((p) => p.id === id);
  if (!position) throw new Error('Paper position was not found.');
  if (time < position.openedAt || !['manual', 'stop-loss', 'take-profit'].includes(reason))
    throw new Error('Invalid paper exit time or reason.');
  if (state.trades.length >= 10_000)
    throw new Error('Paper trade history limit reached. Export/reset before continuing.');
  const profit = pnl(position, price);
  const trade: ClosedPaperTrade = {
    ...position,
    exitPrice: price,
    closedAt: time,
    pnl: profit,
    reason,
  };
  return {
    ...state,
    balance: finite(
      state.initialBalance + [...state.trades, trade].reduce((sum, item) => sum + item.pnl, 0),
      'Balance'
    ),
    positions: state.positions.filter((p) => p.id !== id),
    trades: [...state.trades, trade],
  };
}

/** Closed bars strictly after entry only. If stop and target both touch, stop wins. */
export function processPaperCandle(
  account: PaperAccount,
  id: InstrumentId,
  candle: Candle
): PaperAccount {
  instrument(id);
  validateCandles([candle]);
  let state = parsePaperAccount(account);
  for (const position of state.positions.filter(
    (p) => p.instrument === id && candle.time > p.openedAt
  )) {
    const isBuy = position.side === 'buy';
    const stopHit = isBuy ? candle.low <= position.stopLoss : candle.high >= position.stopLoss;
    const targetHit = isBuy
      ? candle.high >= position.takeProfit
      : candle.low <= position.takeProfit;
    if (stopHit) {
      const fill = isBuy
        ? Math.min(candle.open, position.stopLoss)
        : Math.max(candle.open, position.stopLoss);
      state = closePaperPosition(state, position.id, fill, candle.time, 'stop-loss');
    } else if (targetHit)
      state = closePaperPosition(
        state,
        position.id,
        position.takeProfit,
        candle.time,
        'take-profit'
      );
  }
  return state;
}
