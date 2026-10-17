import { describe, expect, it } from 'vitest';
import {
  closePaperPosition,
  createPaperAccount,
  openPaperPosition,
  paperSummary,
  parsePaperAccount,
  processPaperCandle,
} from './paper';
import type { OpenPaperRequest } from './paper';

const request: OpenPaperRequest = {
  instrument: 'XAUUSD',
  side: 'buy',
  lots: 0.01,
  price: 100,
  stopLoss: 99.9,
  takeProfit: 100.2,
  time: 1000,
};

describe('isolated paper ledger', () => {
  it('begins with virtual $50, derives margin/equity and closes immutably', () => {
    const initial = createPaperAccount();
    const opened = openPaperPosition(initial, request);
    expect(initial.positions).toEqual([]);
    expect(opened.positions[0].margin).toBe(1);
    const summary = paperSummary(opened, { XAUUSD: 100.1 });
    expect(summary.equity).toBeCloseTo(50.1, 10);
    expect(summary.freeMargin).toBeCloseTo(49.1, 10);
    const closed = closePaperPosition(opened, opened.positions[0].id, 100.2, 1300);
    expect(opened.positions).toHaveLength(1);
    expect(closed.balance).toBeCloseTo(50.2, 10);
    expect(closed.positions).toEqual([]);
    expect(paperSummary(closed).usedMargin).toBe(0);
    expect(parsePaperAccount(JSON.parse(JSON.stringify(closed)))).toEqual(closed);
  });
  it('calculates short gold PnL with the 100-ounce contract', () => {
    const state = openPaperPosition(createPaperAccount(), {
      ...request,
      side: 'sell',
      stopLoss: 100.1,
      takeProfit: 99.8,
    });
    expect(closePaperPosition(state, state.positions[0].id, 99.8, 1300).balance).toBeCloseTo(
      50.2,
      10
    );
  });
  it('uses forex 100k and BTC one-unit contracts and lot steps', () => {
    const forex = openPaperPosition(createPaperAccount(), {
      ...request,
      instrument: 'EURUSD',
      price: 1.1,
      stopLoss: 1.0998,
      takeProfit: 1.1004,
    });
    expect(forex.positions[0].margin).toBeCloseTo(11, 10);
    expect(forex.positions[0].risk).toBeCloseTo(0.2, 10);
    const btc = openPaperPosition(createPaperAccount(), {
      ...request,
      instrument: 'BTCUSD',
      lots: 0.001,
      price: 60_000,
      stopLoss: 59_900,
      takeProfit: 60_200,
    });
    expect(btc.positions[0].margin).toBeCloseTo(0.6, 10);
    expect(btc.positions[0].risk).toBeCloseTo(0.1, 10);
  });
  it('rejects the real example $13 gold risk with a $0.25 budget', () => {
    expect(() =>
      openPaperPosition(createPaperAccount(), {
        ...request,
        side: 'sell',
        price: 4180,
        stopLoss: 4193,
        takeProfit: 4165,
      })
    ).toThrow(/13.00.*0.25/);
  });
  it('enforces free margin independently of stop risk', () => {
    expect(() =>
      openPaperPosition(createPaperAccount(), {
        ...request,
        price: 6000,
        stopLoss: 5999.9,
        takeProfit: 6000.2,
      })
    ).toThrow(/margin/);
  });
  it('enforces aggregate exposure without multiplying the budget per ticket', () => {
    let state = createPaperAccount();
    for (let i = 0; i < 5; i++) state = openPaperPosition(state, { ...request, stopLoss: 99.8 });
    expect(() => openPaperPosition(state, { ...request, stopLoss: 99.8 })).toThrow(/Aggregate/);
  });
  it.each([
    { lots: 0.015 },
    { lots: 0 },
    { lots: NaN },
    { stopLoss: 101 },
    { takeProfit: 99 },
    { price: Infinity },
    { time: 1.2 },
  ])('rejects invalid request %s', (change) =>
    expect(() => openPaperPosition(createPaperAccount(), { ...request, ...change })).toThrow()
  );
  it('accounts for marked losses in free margin', () => {
    const state = openPaperPosition(createPaperAccount(), request);
    expect(paperSummary(state, { XAUUSD: 90 }).freeMargin).toBe(39);
    expect(() => paperSummary(state, { XAUUSD: NaN })).toThrow();
  });
  it('refuses duplicate closes and exits before entry', () => {
    const state = openPaperPosition(createPaperAccount(), request);
    expect(() => closePaperPosition(state, 'missing', 101, 1300)).toThrow();
    expect(() => closePaperPosition(state, state.positions[0].id, 101, 999)).toThrow();
  });
  it('rejects malformed and tampered persisted account state', () => {
    const state = openPaperPosition(createPaperAccount(), request);
    expect(() => parsePaperAccount({ ...state, balance: '50' })).toThrow();
    expect(() => parsePaperAccount({ ...state, balance: NaN })).toThrow();
    expect(() => parsePaperAccount({ ...state, balance: 500 })).toThrow();
    expect(() =>
      parsePaperAccount({ ...state, positions: [{ ...state.positions[0], margin: 0.001 }] })
    ).toThrow();
    expect(() =>
      parsePaperAccount({ ...state, positions: [...state.positions, ...state.positions] })
    ).toThrow();
    expect(() =>
      parsePaperAccount({ ...state, settings: { ...state.settings, leverage: 1e9 } })
    ).toThrow();
    expect(() =>
      parsePaperAccount({ ...state, settings: { ...state.settings, riskPerTrade: 0.5 } })
    ).toThrow();
  });
  it('includes marked profit given back at the stop in aggregate equity exposure', () => {
    const state = openPaperPosition(createPaperAccount(), request);
    expect(paperSummary(state, { XAUUSD: 200 }).riskAtStops).toBeCloseTo(100.1, 10);
    expect(() =>
      openPaperPosition(state, { ...request, price: 200, stopLoss: 199.9, takeProfit: 200.2 })
    ).toThrow(/Aggregate/);
  });
});

describe('bar-based exits', () => {
  const both = { time: 1300, open: 100, high: 101, low: 99, close: 100, volume: 10 };
  it('does not use the entry candle or any earlier bar', () => {
    const state = openPaperPosition(createPaperAccount(), request);
    expect(
      processPaperCandle(state, 'XAUUSD', { ...both, time: request.time }).positions
    ).toHaveLength(1);
    expect(processPaperCandle(state, 'XAUUSD', { ...both, time: 999 }).positions).toHaveLength(1);
  });
  it('uses stop-first when both targets touched and allows adverse gap slippage', () => {
    const state = openPaperPosition(createPaperAccount(), request);
    const closed = processPaperCandle(state, 'XAUUSD', both);
    expect(closed.trades[0].reason).toBe('stop-loss');
    expect(closed.trades[0].exitPrice).toBe(99.9);
    expect(processPaperCandle(state, 'XAUUSD', { ...both, open: 99.5 }).trades[0].exitPrice).toBe(
      99.5
    );
  });
  it('handles short stop-first and target fills without favorable gap invention', () => {
    const state = openPaperPosition(createPaperAccount(), {
      ...request,
      side: 'sell',
      stopLoss: 100.1,
      takeProfit: 99.8,
    });
    expect(processPaperCandle(state, 'XAUUSD', both).trades[0].exitPrice).toBe(100.1);
    expect(
      processPaperCandle(state, 'XAUUSD', { ...both, open: 99.5, high: 99.7, close: 99.6 })
        .trades[0].exitPrice
    ).toBe(99.8);
  });
});
