# Paid TradingView capability gap audit

Checked 2026-10-18. **Release paused. Requested parity is not delivered.**

The requirement is a free, open-source app with the capabilities of paid TradingView, including genuine editable analysis tools. Offering TradingView Basic, matching its appearance, or assigning indicator names to shapes does not satisfy that requirement.

This is a first architecture/feature-family audit, not certification of every TradingView control, study, community script or paid tier. It compares the current local working tree, including unreleased changes. Existing public preview packages contain less. No new release/tag has been published for these changes.

## Integrated development workspace update

The default app now mounts Vela 0.8.4 with Vela-PineTS 0.2.16 / PineTS 0.11.1. The actual registered drawing catalogue, drawing property editors, candle settings, chart-layout controls and indicator picker are available in the main app. The previous implementation remains separate at `?workspace=classic`. The three bundled Pine studies render EMA/RSI/MACD; arbitrary source execution remains disabled. Fixed-range volume profile was drawn and its row/value-area inputs changed in the integrated browser build. Numerical parity of every catalogue tool has not been certified. Full paid-feature parity and native/mobile platform verification remain open; no new release has been published.

The combined distribution now carries AGPL-3.0-only, with the original MIT notice and Vela's Apache-2.0 licence/NOTICE retained. The earlier isolated research licensing note below describes the pre-integration evaluation stage.

## Previous workspace coverage

“Partial” means some independently implemented behavior exists; it never means exact equivalence.

| Required capability                             | Current implementation and gap                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Complete drawing workflow                       | Partial: 13 drawing tools plus select/pan; property editors, anchors, undo and persistence. Full catalogue, snapping, batch editing, templates and pane drawings remain incomplete.                                                                                |
| Green/red position planner                      | Partial: draggable stop/target boxes and ratio. TradingView-equivalent sizing, statistics, controls and drawing alerts are not complete. A position drawing does not submit an order.                                                                              |
| Accumulation/manipulation/distribution analysis | **Not delivered.** Existing buttons only create manual rectangle annotations. There is no AMD detection algorithm or verified equivalent script. The requested behavior must be specified and independently validated; changing a box color does not implement it. |
| Fibonacci family                                | Partial: configurable retracement. Other constructions and exact interaction parity are absent.                                                                                                                                                                    |
| Channels and advanced geometry                  | Partial: one parallel channel and basic shapes. Regression, pitchfork families, Gann, harmonic/Elliott patterns and advanced curves are absent.                                                                                                                    |
| Fixed-range volume analysis                     | Partial: selected-range OHLCV estimate, POC/VAH/VAL. Not actual trade-at-price/orderflow. Value area is fixed at 70% in the UI; full profile controls and data parity are absent.                                                                                  |
| Anchored/session/visible profiles and VWAP      | Missing.                                                                                                                                                                                                                                                           |
| Footprint, delta, TPO and depth                 | Missing; no tick/trade-at-price/order-book input. Cannot reconstruct these faithfully from candle OHLCV.                                                                                                                                                           |
| Study library                                   | Partial: eight built-in study groups with genuine parameter/style editors. The full study catalogue is absent.                                                                                                                                                     |
| Pine and community scripts                      | Missing: no parser, compiler/runtime, compatibility layer or script marketplace. JSON presets are configuration only.                                                                                                                                              |
| Historical simulation                           | Partial: candle replay and a virtual ledger. No strategy execution engine, tick fills or deep backtest reporting.                                                                                                                                                  |
| Chart types and intervals                       | Partial: candles/bars/line/area; five simulation intervals. Other chart constructions and arbitrary second/tick intervals are absent.                                                                                                                              |
| Multiple charts and synchronized layouts        | Missing.                                                                                                                                                                                                                                                           |
| Market-data coverage                            | Partial: synthetic samples, CSV and local read-only demo gold/M15. No broad historical/live market-data service or entitlement system.                                                                                                                             |
| Alerts                                          | Partial: in-app replay closing-price crossings. No persistent server evaluation, mobile delivery, webhook service or multi-condition engine.                                                                                                                       |
| Brokerage and order management                  | Missing: no order routing, reconciliation or broker execution. MT5 viewing is read-only.                                                                                                                                                                           |
| Watchlists and screeners                        | Partial: three sample markets. No full watchlist service or market-wide screening.                                                                                                                                                                                 |
| News, calendars and fundamentals                | Missing.                                                                                                                                                                                                                                                           |
| Cloud workspace/device synchronization          | Missing; local storage and manual export only.                                                                                                                                                                                                                     |
| Desktop/mobile quality                          | Partial: responsive UI and native packaging. Complete platform behavior, physical-device checks, signing and iPhone distribution are unfinished.                                                                                                                   |

Local UI tests verify specific interactions, not TradingView equivalence. They do not establish identical numerical results, complete controls, feed quality or profitable trading.

## What the technical research changes

The current rendering base, Lightweight Charts, does not supply the paid TradingView platform. Our overlays, indicators, ledger and editors are separate implementations. Building a drawing toolbar on it did not provide the missing engines.

TradingView's Advanced Charts is a different proprietary integration product, with eligibility and licensing requirements. Its free licence is not offered for personal/hobby projects, and its source is not provided. It is not something we can simply put in this MIT repository. See the [official library comparison and eligibility FAQ](https://www.tradingview.com/free-charting-libraries/).

Even the licensed libraries omit Pine, hosted alerts, Strategy Tester and Bar Replay, among other services. Switching chart libraries alone therefore does not deliver the requested product. See the [current official unsupported-feature list](https://www.tradingview.com/charting-library-docs/latest/resources/Frequently-Asked-Questions/).

Some exchange data has a separate charge even with a paid TradingView plan. A free app does not itself eliminate third-party feed fees. See the [official market-data explanation](https://www.tradingview.com/support/solutions/43000471705-how-to-purchase-additional-market-data/).

## Evidence and acceptance gate

The research baseline is the [official paid-plan comparison](https://www.tradingview.com/pricing/), [drawing catalogue](https://www.tradingview.com/support/solutions/43000703396-drawing-tools-available-on-tradingview/), [drawing reference](https://www.tradingview.com/support/folders/43000547459-how-to-use-various-drawing-tools/) and [Pine v6 documentation](https://www.tradingview.com/pine-script-docs/welcome/). Documentation review is not hands-on verification of every feature.

Before a feature can count toward parity, record its exact reference behavior, calculation/data requirements, input and style controls, editing workflow, persistence, error states, performance and matching test fixtures. A placeholder or renamed shape does not pass. Individual community/protected scripts need separate identification and permission review; the generic word “Distribution” does not identify a specific implementation.

There is no substantiated basis to call the current app “TradingView Premium,” “all paid features,” or a complete replacement. An independent implementation can be developed progressively, but complete equivalence and zero ongoing cost are not established deliverables.

## Visual references and alternative-engine research

User explicitly requested inspecting real Premium demonstrations and screenshots, rather than inferring the workflow from documentation alone. References located:

- [TradingView's official footprint walkthrough](https://www.youtube.com/watch?v=0WggFVVsmkM) and [profile/ladder update demonstration](https://www.youtube.com/watch?v=ikTtlakxx9w). Located through search; video playback did not load in this session, so these must not be described as watched.
- [Official profile settings screenshot](https://tvblog-static.tradingview.com/uploads/2022/04/Volume-Profiles-new-and-improved-3.png), visually inspected in-browser. Shows independently editable value-area colors, POC/VAH/VAL style switches, developing levels and label options. It is an older reference, not verification of the 2026 UI.
- [Current profile tool reference](https://www.tradingview.com/support/solutions/43000707985-fixed-range-volume-profile-drawing-tool/).
- [LuxAlgo's AMD reference](https://www.luxalgo.com/library/indicator/ultimate-amd-indicator/) describes a stateful detector with lookback, range threshold, breakout mode and invalidation controls. That behavior is different from the manual annotations currently implemented. No claim that this is the user's exact preferred script.

A more substantial open-source foundation is being evaluated separately: [Vela](https://github.com/LuxAlgo/Vela) and [PineTS](https://github.com/LuxAlgo/PineTS). Registry metadata confirms Vela 0.8.4 / Apache-2.0 and PineTS 0.11.1 / AGPL-3.0-only. These are candidate capabilities, not yet integrated or validated in Signalhive. Preserve attribution and check the exact shipped version rather than assuming the latest website description matches it. Pine runtime integration needs sandboxing, compatibility fixtures and licence handling; the current MIT app does not already contain Pine support. Commercial/Pro modules must not be silently included or presented as free core functionality.

### Candidate runtime evidence

The isolated [Vela evaluation](../research/vela-evaluation/README.md) now runs on synthetic data. Browser checks confirmed a genuine position-settings dialog and recalculation: account50/risk1% displays loss0.50; quantities are drawing units, not broker lots. The built-in study picker opened. A selected-range profile rendered, its settings exposed up/down and value-area colors plus POC/VAH/VAL/developing levels, and changing24→48 rows /70→68% value area changed the histogram. No claim of numerical parity yet. The screenshot-export attempt timed out waiting for a download. The main Signalhive app has not been migrated to this engine, and no new release has been published.

The separate [Pine runtime probe](../research/pine-evaluation/README.md) executed native Pine v6 using PineTS0.11.1 over600 synthetic candles, producing eight named study series. Independent SMA/RSI fixture checks passed. Pine rendering, safe user-code execution, arbitrary-script compatibility and the main app integration are not complete. The probe has separate AGPL-3.0-only licensing; the main MIT app has not silently acquired a Pine runtime.

A [combined worker-backed Vela/Pine evaluation](../research/vela-pine-evaluation/README.md) now renders the three EMA lines, RSI and MACD from actual Pine source. Editing the fast EMA input9→45 changed its visible latest value4166.0→4170.1; restoring9 restored4166.0. The harness accepts only its three included sources, uses synthetic bars, has no broker execution and is separately AGPL-3.0-only. This establishes a stronger candidate architecture; it is not a completed main-app migration or full Premium parity.
