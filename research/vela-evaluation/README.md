# Isolated Vela evaluation

This is research, not the released app or a completed TradingView replacement. It uses Vela 0.8.4 from the official npm package and 600 generated synthetic candles. It does not connect a broker, request credentials or place orders. Persistence is disabled. Keep the displayed Vela attribution.

From this directory, `npm ci --ignore-scripts`, then `npm exec --package=vite@8.3.4 -- vite . --host 127.0.0.1 --port 5197 --strictPort`. This is the same pinned Vite version used in the main app.

Verified interactively: chart rendering; measurement-tool menu; long/short drawing; its property dialog; changing account balance from 10,000 to 50 at 1% recalculates displayed loss from $100 to $0.50; built-in study picker; two-click fixed-range profile drawing; profile settings with rows, value-area percentage, width/anchor, separate volume/value-area colors and POC/VAH/VAL/developing-level controls; changing rows24→48 and value-area70→68 changed the rendered histogram. Position size is quantity in the drawing model, **not an enforced broker lot size**. Broker contract/margin/minimum-lot integration remains absent.

Not yet verified: all tool geometry, profile calculations, indicator numerical equivalence, persistence, multi-chart synchronization, performance on this PC or native/mobile behavior. No Pine runtime is integrated here. No Pro module is installed. The package's Apache-2.0 licence and attribution do not imply that separate commercial modules are free.

Sources: [Vela repository](https://github.com/LuxAlgo/Vela), [licensing](https://velacharts.dev/), [Signalhive feature audit](../../docs/PAID-FEATURE-AUDIT.md).

The candidate screenshot-export button was attempted in the in-app browser, but no download event arrived; no console error was recorded. Export must not be marked working until this is diagnosed.
