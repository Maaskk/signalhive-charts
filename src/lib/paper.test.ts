import { describe, expect, it } from 'vitest';
import {
  amendPaperPosition,
  calculatePaperSize,
  closePaperPosition,
  partialClosePaperPosition,
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

describe('risk-based paper position sizing', () => {
  it('floors at the instrument step without increasing the $0.25 budget', () => {
    const account = createPaperAccount();
    const size = calculatePaperSize(account, request);
    expect(size.reason).toBeNull();
    expect(size.lots).toBe(0.02);
    expect(size.risk).toBeCloseTo(0.2, 10);
    expect(size.margin).toBe(2);
    expect(account.positions).toEqual([]);
    expect(
      openPaperPosition(account, { ...request, lots: size.lots! }).positions[0].risk
    ).toBeCloseTo(size.risk, 10);
    expect(() => openPaperPosition(account, { ...request, lots: 0.03 })).toThrow(/Risk/);
  });
  it('reports an unaffordable minimum instead of raising the lot or risk limit', () => {
    const size = calculatePaperSize(createPaperAccount(), {
      ...request,
      side: 'sell',
      price: 4180,
      stopLoss: 4193,
      takeProfit: 4165,
    });
    expect(size.lots).toBeNull();
    expect(size.risk).toBe(13);
    expect(size.margin).toBeCloseTo(41.8, 10);
    expect(size.reason).toMatch(/Minimum 0.01.*per-trade risk/);
  });
  it('sizes independently to available margin and rejects an impossible minimum', () => {
    const size = calculatePaperSize(createPaperAccount(), {
      ...request,
      stopLoss: 99.999,
      takeProfit: 100.002,
    });
    expect(size.lots).toBe(0.5);
    expect(size.margin).toBe(50);
    const rejected = calculatePaperSize(createPaperAccount(), {
      ...request,
      price: 6000,
      stopLoss: 5999.999,
      takeProfit: 6000.002,
    });
    expect(rejected.lots).toBeNull();
    expect(rejected.reason).toMatch(/free margin/);
  });
  it('respects aggregate risk and the same floating tolerance as order admission', () => {
    let state = createPaperAccount();
    for (let i = 0; i < 4; ++i) state = openPaperPosition(state, { ...request, stopLoss: 99.8 });
    const size = calculatePaperSize(state, { ...request, stopLoss: 99.8 });
    expect(size.lots).toBe(0.01);
    state = openPaperPosition(state, { ...request, stopLoss: 99.8, lots: size.lots! });
    const rejected = calculatePaperSize(state, request);
    expect(rejected.lots).toBeNull();
    expect(rejected.reason).toMatch(/aggregate/);
  });
  it('uses marked losses on other instruments in the same margin and equity model', () => {
    const state = openPaperPosition(createPaperAccount(), request);
    const forex = {
      ...request,
      instrument: 'EURUSD' as const,
      price: 1.1,
      stopLoss: 1.09995,
      takeProfit: 1.1001,
    };
    expect(calculatePaperSize(state, forex).lots).toBe(0.04);
    expect(calculatePaperSize(state, forex, { XAUUSD: 90 }).lots).toBe(0.03);
  });
  it('returns a clear rejection for invalid stops, marks or an account with no equity', () => {
    expect(calculatePaperSize(createPaperAccount(), { ...request, stopLoss: 101 }).reason).toMatch(
      /SL < entry < TP/
    );
    expect(calculatePaperSize(createPaperAccount(), request, { EURUSD: NaN }).lots).toBeNull();
    const state = openPaperPosition(createPaperAccount(), request);
    const result = calculatePaperSize(
      state,
      {
        ...request,
        instrument: 'EURUSD',
        price: 1.1,
        stopLoss: 1.0999,
        takeProfit: 1.1002,
      },
      { XAUUSD: 1 }
    );
    expect(result.lots).toBeNull();
    expect(result.reason).toMatch(/No positive/);
  });
});

describe('partial paper exits', () => {
  const large = { ...request, lots: 0.03, stopLoss: 99.95, takeProfit: 100.2 };
  it('realizes only the selected portion and recomputes remaining risk and margin', () => {
    const opened = openPaperPosition(createPaperAccount(), large);
    const closed = partialClosePaperPosition(opened, 'paper-1', 0.01, 100.2, 1300);
    expect(opened.positions[0].lots).toBe(0.03);
    expect(opened.trades).toHaveLength(0);
    expect(closed.positions[0].id).toBe('paper-1');
    expect(closed.positions[0].lots).toBe(0.02);
    expect(closed.positions[0].margin).toBe(2);
    expect(closed.positions[0].risk).toBeCloseTo(0.1, 10);
    expect(closed.trades[0]).toMatchObject({
      id: 'paper-2',
      lots: 0.01,
      exitPrice: 100.2,
      closedAt: 1300,
      openedAt: 1000,
      reason: 'manual',
      margin: 1,
    });
    expect(closed.trades[0].risk).toBeCloseTo(0.05, 10);
    expect(closed.trades[0].pnl).toBeCloseTo(0.2, 10);
    expect(closed.balance).toBeCloseTo(50.2, 10);
    expect(paperSummary(closed).usedMargin).toBe(2);
    expect(closed.nextId).toBe(3);
    expect(parsePaperAccount(JSON.parse(JSON.stringify(closed)))).toEqual(closed);
  });
  it('assigns every realized portion a unique ID and keeps full-close history parseable', () => {
    let state = openPaperPosition(createPaperAccount(), large);
    state = partialClosePaperPosition(state, 'paper-1', 0.01, 100.2, 1300);
    state = partialClosePaperPosition(state, 'paper-1', 0.01, 99.9, 1400);
    expect(state.trades.map((trade) => trade.id)).toEqual(['paper-2', 'paper-3']);
    expect(state.positions[0].lots).toBe(0.01);
    expect(state.nextId).toBe(4);
    state = partialClosePaperPosition(state, 'paper-1', 0.01, 100.1, 1500);
    expect(state.positions).toEqual([]);
    expect(state.trades.map((trade) => trade.id)).toEqual(['paper-2', 'paper-3', 'paper-1']);
    expect(new Set(state.trades.map((trade) => trade.id)).size).toBe(3);
    expect(state.nextId).toBe(4);
    expect(state.balance).toBeCloseTo(50.2, 10);
    expect(parsePaperAccount(JSON.parse(JSON.stringify(state)))).toEqual(state);
    const reopened = openPaperPosition(state, request);
    expect(reopened.positions[0].id).toBe('paper-4');
  });
  it('handles the smaller crypto step and short direction without ratio drift', () => {
    const opened = openPaperPosition(createPaperAccount(), {
      ...request,
      instrument: 'BTCUSD',
      side: 'sell',
      lots: 0.003,
      price: 60000,
      stopLoss: 60050,
      takeProfit: 59900,
    });
    const closed = partialClosePaperPosition(opened, 'paper-1', 0.001, 59900, 1300);
    expect(closed.positions[0].lots).toBe(0.002);
    expect(closed.positions[0].margin).toBe(1.2);
    expect(closed.positions[0].risk).toBe(0.1);
    expect(closed.trades[0].pnl).toBe(0.1);
    expect(parsePaperAccount(closed)).toEqual(closed);
  });
  it.each([
    { lots: 0 },
    { lots: 0.005 },
    { lots: 0.025 },
    { lots: 0.04 },
    { lots: NaN },
    { time: 999 },
    { time: 1000.5 },
    { price: Infinity },
    { price: 0 },
    { id: 'missing' },
  ])('rejects invalid portions, an invalid remainder or invalid exit %s', (change) => {
    const state = openPaperPosition(createPaperAccount(), large);
    const args = { id: 'paper-1', lots: 0.01, price: 100.2, time: 1300, ...change };
    expect(() =>
      partialClosePaperPosition(state, args.id, args.lots, args.price, args.time)
    ).toThrow();
    expect(state.trades).toEqual([]);
    expect(state.positions[0].lots).toBe(0.03);
  });
});

describe('protective paper amendments', () => {
  it('changes only stops and targets, keeps the ledger immutable and remains parseable', () => {
    const state = openPaperPosition(createPaperAccount(), request);
    const changed = amendPaperPosition(state, 'paper-1', { stopLoss: 99.95, takeProfit: 100.4 });
    expect(changed.positions[0]).toMatchObject({
      id: 'paper-1',
      lots: 0.01,
      entryPrice: 100,
      side: 'buy',
      stopLoss: 99.95,
      takeProfit: 100.4,
      margin: 1,
    });
    expect(changed.positions[0].risk).toBeCloseTo(0.05, 10);
    expect(state.positions[0].stopLoss).toBe(99.9);
    expect(changed.balance).toBe(state.balance);
    expect(changed.nextId).toBe(state.nextId);
    expect(parsePaperAccount(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
  });
  it('rejects a per-trade risk increase above the original account limit', () => {
    const state = openPaperPosition(createPaperAccount(), request);
    expect(() => amendPaperPosition(state, 'paper-1', { stopLoss: 99, takeProfit: 101 })).toThrow(
      /per-trade/
    );
  });
  it('rejects aggregate risk increases even when an amended ticket fits the per-trade cap', () => {
    let state = createPaperAccount();
    for (let i = 0; i < 5; ++i) state = openPaperPosition(state, { ...request, stopLoss: 99.8 });
    expect(() =>
      amendPaperPosition(state, 'paper-1', { stopLoss: 99.75, takeProfit: 101 })
    ).toThrow(/aggregate/);
    expect(
      amendPaperPosition(state, 'paper-1', { stopLoss: 99.9, takeProfit: 101 }).positions[0].risk
    ).toBeCloseTo(0.1, 10);
  });
  it('includes marks in aggregate exposure and rejects breakeven or profit-locking stops', () => {
    const state = openPaperPosition(createPaperAccount(), request);
    expect(() =>
      amendPaperPosition(state, 'paper-1', { stopLoss: 99.95, takeProfit: 101 }, { XAUUSD: 200 })
    ).toThrow(/aggregate/);
    for (const stopLoss of [100, 100.1])
      expect(() => amendPaperPosition(state, 'paper-1', { stopLoss, takeProfit: 101 })).toThrow(
        /SL < entry < TP/
      );
    expect(() => amendPaperPosition(state, 'missing', { stopLoss: 99.9, takeProfit: 101 })).toThrow(
      /not found/
    );
  });
});
