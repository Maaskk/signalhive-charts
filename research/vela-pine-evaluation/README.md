# Combined chart and Pine evaluation

AGPL-3.0-only evaluation harness. This is separate from the MIT production app. Uses Vela0.8.4, Vela-PineTS0.2.16 and PineTS0.11.1, pinned in package-lock.json. Preserve Vela's visible attribution and dependency licences. No Pro module is installed.

Run `npm ci --ignore-scripts` in this folder, then `npm exec --package=vite@8.3.4 -- vite . --host 127.0.0.1 --port 5198 --strictPort`.

Verified in the browser with600 synthetic M15 candles: three Pine studies render, including EMA9 blue /21 yellow /200 red, RSI14 and MACD12/26/9. Double-click the EMA legend to open its input dialog. Changing fast period9→12 remained saved in that dialog;9→45 changed the displayed latest EMA from4166.0 to4170.1. Restoring9 returned4166.0. The known-source worker-backed runtime recorded no console errors in this check.

Persistence is disabled and there is no broker connection or order execution. Known-script period inputs can change; per-plot color editing in the Pine dialog has not been validated. The engine only accepts the three included self-authored script sources. It rejects arbitrary source; this is not yet a user script editor. Workers alone are not a complete untrusted-code security boundary. Numerical compatibility, source/persistence integration, price precision, broker unit conversion, mobile/native performance and the rest of the feature audit remain unfinished. The static EMA script title does not change when its periods are edited; production naming must avoid implying stale period values.

This is a tested candidate foundation, not all of TradingView Premium and not an installed replacement for MT5. See the [feature gap audit](../../docs/PAID-FEATURE-AUDIT.md).
