# Data, indicators and paper execution

## No live feed

The three starting instruments are synthetic examples with a fixed historical time window. Their names and scales are convenient for UI testing; prices and volumes are not historical market records or executable quotes. Every timeframe aggregates the same seeded five-minute path.

CSV files are validated locally. A user can choose any source; the app does not establish its accuracy, exchange permissions or completeness. Gaps are retained. The chart compresses gaps in its trading calendar, and drawings interpolate against actual candle times rather than assuming every interval exists.

## Indicator conventions

- EMA uses an SMA seed and omits warm-up bars. SMA uses close prices.
- RSI uses Wilder smoothing; flat history produces 50, all gains 100, all losses 0.
- MACD uses the 12/26 EMA difference, a 9-period EMA signal and the difference histogram.
- Bollinger uses the population standard deviation over 20 closes, multiplier 2.
- ATR uses Wilder smoothing of true ranges, period 14.
- Pivots require three closed bars on each side, with confirmation only at the following candle boundary. Last three support and resistance levels are shown. They are reference levels, not forecasts.

Other software may seed or round indicators differently, especially with shorter history.

## Volume profile

With OHLCV alone, the distribution of actual trades at each price is unknown. The estimated profile divides the selected low/high price range into bins, then allocates each candle's volume uniformly across its low/high range in proportion to bin overlap. A flat-price candle allocates its volume to one bin. Total volume is conserved, including the rounding residue.

POC is the center of the largest bin (lower bin wins a tie). The contiguous value area starts at POC and expands toward the larger neighboring bin until at least 70% of volume is covered; a tie expands down first. VAL/VAH are outer bin boundaries. Empty or zero-volume selections have no POC/value area.

The selected time range is inclusive. Only candles already revealed at the replay cursor are passed to the calculation. Phase boxes are manual drawings; they do not prove accumulation, manipulation or distribution.

## Paper account

Initial balance is USD 50, with a simplified 1:100 margin model, 0.5% maximum stop risk per new position and 2% aggregate risk. The initial minimum-volume gold order may exceed these limits and be rejected. The app does not automatically raise risk to make an order fit.

Model contract sizes: XAUUSD 100 units/lot, EURUSD 100,000 units/lot, BTCUSD 1 unit/lot. All P&L is in USD. These are example specifications, not a claim about a broker. No spread, commission, financing, funding or slippage model is included. No real money can be deposited or traded.

Entries fill at the currently revealed candle's close. SL/TP checks begin on strictly later candles. If both levels touch inside one candle, the stop fills first. An adverse opening gap fills at the worse opening price; profit targets fill at the target. Manual closes use the revealed candle close. No intrabar path is invented.

Changing symbol, timeframe, imported source or rewinding replay is blocked while a position is open. This prevents accidentally repricing an existing position with another market or replaying an earlier entry state. Open and closed positions persist with their source and replay cursor on the same device. Client-side storage is structurally checked, not cryptographically tamper-proof.

Local replay alerts trigger on closing-price crossings while this window is open. They are not persistent push, phone or broker alerts.
