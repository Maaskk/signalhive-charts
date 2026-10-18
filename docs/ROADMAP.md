# Roadmap

The current release is a working starting point, not feature parity with mature commercial platforms.

## Next priorities

1. Real-device checks for Windows, both Mac architectures and Android, with accessible touch/keyboard drawing controls.
2. Verify native worker/CSP behavior and isolate arbitrary user scripts before enabling them. The new workspace runs three bundled Pine studies through PineTS; this is not complete Pine compatibility.
3. Market data adapters with explicit source, delay, permissions, reconnect state and history integrity. No unlabeled fallback from a failed live feed to simulated prices.
4. Extend verification of the new multi-chart layouts, linked crosshairs and independent cell settings; add symbol/timeframe tabs.
5. Compare the newly integrated drawing catalogue family by family, including templates, anchored VWAP, extended Fibonacci and pitchforks. Verify alert persistence/delivery semantics.
6. Tick/trade-at-price import before any genuine footprint/delta/order-flow feature. Candle volume cannot recover missing tick-level data.
7. Extend the implemented local read-only MT5 adapter beyond XAUUSD 15m. Broker execution and account secrets must never run in the public static frontend.
8. Signed production native installers and stable Android signing identity, then store distribution if maintainers choose.

No feature should be presented as working until its implementation, persistence, error handling and relevant tests exist. No tool can guarantee profitable trades.
