# Pine runtime evaluation

Isolated known-source compatibility probe, not a public script runner or full TradingView/Pine certification. `npm install --ignore-scripts`, then `npm test`. Uses only generated synthetic OHLCV and does not fetch market data or send orders.

PineTS0.11.1 parsed and executed native Pine v6 for SMA9, EMA9/21/200, RSI14 and MACD12/26/9. All eight named output series had600 points and finite final values. Independent checks on this monotonic test sequence establish SMA9=159.6 and RSI14=100. This does not independently verify every EMA/MACD initialization rule or TradingView data equivalence. Six extra output channels represent drawing objects, not additional numeric plots. See result.json.

This evaluation harness is AGPL-3.0-only, matching the PineTS dependency. The main Signalhive app remains MIT and does not include this runtime. Integrating it in a distributed app needs appropriate licence/source notices. Untrusted scripts require execution isolation and resource/network limits before an editor is exposed to users. The current probe runs only the included self-authored source.

[Runtime source](https://github.com/LuxAlgo/PineTS).
