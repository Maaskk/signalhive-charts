# Integrated chart workspace

The development build opens the Vela-based workspace by default. The previous React/Lightweight Charts workspace and its paper ledger are retained at `?workspace=classic`; its local-storage keys are not migrated or deleted. Public v0.1.0 packages still contain the previous implementation.

## Daily use

- **Data source:** choose clearly labelled seeded simulation, import OHLCV CSV, or explicitly connect the read-only local MT5 demo adapter from the installed Linux launcher. CSV survives reopening through IndexedDB. A failed remembered source opens the source picker; it never silently becomes simulated prices.
- **Drawing library / left toolbar:** select an actual engine tool and place its anchors. Double-click the drawing's visible line, boundary or histogram to edit its properties. Double-clicking empty chart space can maximize a pane; the chart-settings button is at the lower right.
- **Long/Short Position:** draw entry and exit regions, then edit stop, target, account size, risk and colors. The result is an analysis drawing, not an order. The provider's point value is one chart unit: do not interpret quantity as broker lots.
- **Fixed Range Volume Profile:** place the first/last time anchors. Double-click the histogram or boundary; edit rows, value area, width, anchor, volume colors and POC/VAH/VAL. The profile derives an estimate from candle OHLCV, not an exchange tick-at-price feed.
- **Indicators:** open the chart toolbar's picker. Three bundled Pine studies start enabled: the EMA trio, RSI and MACD. Double-click their legends for periods/colors/styles. The registry also exposes the engine's built-in studies. Custom Pine source is intentionally not enabled until execution isolation and limits are verified.
- **Charts:** the toolbar has style, interval and layout pickers. Each cell has its own settings. One chart starts by default; more cells mean more rendering/study work. Restore one chart for the lowest resource use.
- **Replay:** enter a UTC start within the loaded chart history, then Start, Step or Play. MT5 viewing uses current broker snapshots instead. Replay pauses when the app is hidden.
- **Backups:** Save backup includes layout and the imported CSV dataset when used. Restore backup accepts version 2 backups and verifies dataset structure. MT5 backups contain only market/interval identifiers and layout, never broker account totals, credentials or quotes.
- **Previous workspace:** opens the earlier paper-trading tools and their existing saved data. Its drawings are not automatically converted into Vela objects.

## Responsiveness

There is no polling for simulated or CSV prices. MT5 polling is sequential, every four seconds, and skips hidden documents. Workers are terminated when their workspace is destroyed. Large-chart animations and glow are disabled; the canvas renderer and one chart are the defaults. These choices reduce overhead, not guarantee performance on every device.

Local development on the user's PC uses a low-priority single worker/core, with a runtime CPU budget on the Codex process scope. Do not reopen several research previews or an MT5 test terminal unnecessarily. Native packaging belongs in CI, not a parallel local build farm.

## Remaining scope

This is not a certification of paid TradingView parity. Automated AMD detection, exchange order flow/footprints/TPO/depth, arbitrary Pine programs, strategy testing, hosted alerts and paid exchange feeds are not delivered. Several drawing families now come from Vela; their exact formulas and interaction details still need family-by-family comparison. Manually placing an FVG or Order Block annotation is not an automatic detector.

The combined runtime is AGPL-3.0-only. Vela attribution remains visible; original MIT and dependency Apache notices are preserved. The current installed Linux build is a dedicated Chromium app window, not a new native AppImage. Android/iOS packaging and native worker/CSP behavior require platform verification before another release. In particular the existing strict Tauri CSP has not yet been relaxed to permit PineTS's dynamic compilation: bundled Pine studies in a native webview are not verified by browser success.
