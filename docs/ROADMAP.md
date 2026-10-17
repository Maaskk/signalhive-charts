# Roadmap

The current release is a working starting point, not feature parity with mature commercial platforms.

## Next priorities

1. Real-device checks for Windows, both Mac architectures and Android, with accessible touch/keyboard drawing controls.
2. Configurable indicator periods/colors and a typed declarative study pipeline.
3. Market data adapters with explicit source, delay, permissions, reconnect state and history integrity. No unlabeled fallback from a failed live feed to simulated prices.
4. Multi-chart layouts, linked crosshairs and symbol/timeframe tabs.
5. Drawing templates, alerts with explicit persistence/delivery semantics, anchored VWAP, extended Fibonacci and pitchforks.
6. Tick/trade-at-price import before any genuine footprint/delta/order-flow feature. Candle volume cannot recover missing tick-level data.
7. Optional isolated, authenticated MT5 adapter after separate review. Broker execution and account secrets must never run in the public static frontend.
8. Signed production native installers and stable Android signing identity, then store distribution if maintainers choose.

No feature should be presented as working until its implementation, persistence, error handling and relevant tests exist. No tool can guarantee profitable trades.
