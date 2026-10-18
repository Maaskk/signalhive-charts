# Optional local MT5 demo data

`mt5_snapshot.py` exports a small read-only snapshot from an **already running** MT5 demo terminal. It does not ask for credentials, log in, place or modify orders, change chart settings, select symbols, or send data to a remote server. It exposes candles and broker tick volume, quotes, symbol specifications, and a numeric account summary. Login numbers, account names, broker server names, passwords and order details are never included. Real accounts are refused.

Use Windows Python with the official `MetaTrader5` package installed. On Linux/Wine, Python and the SDK must run inside the **same Wine prefix and process namespace** as the existing terminal. The exact executable path is checked through Win32 process APIs before SDK attachment and checked again against the SDK terminal path. The SDK has no documented attach-only option and can launch a terminal if that process exits between the existence check and attachment; keep the selected terminal running. The exporter never intentionally starts a terminal or auto-discovers a different installation.

Example paths below are placeholders; choose your actual terminal and an output directory **outside this repository**:

```powershell
python mt5_snapshot.py --terminal "C:\Trading\terminal64.exe" --output "C:\PrivateData\market-snapshot.json" --symbol XAUUSD --timeframe M15 --bars 600 --interval 2
```

Add `--once` to write one snapshot and exit. A desktop launcher can supply `--stop-file "C:\PrivateData\snapshot.stop"`; creating that private sentinel file cleanly closes only the exporter SDK connection and exits within roughly half a second. Remove an old sentinel before a new run. Supported timeframes are `M5`, `M15`, `H1`, `H4`, and `D1`. Choose an exact broker symbol already available in the terminal. At most 600 candles are exported. The default polling interval is two seconds; unavailable or invalid data produces a generic disconnected record without retaining an old account summary. Changing accounts during a run is refused; restart the exporter after intentionally selecting another demo.

Files are atomically replaced; the exporter requests restrictive permissions where supported. Windows `chmod` does not enforce Linux POSIX permissions through Wine, and Windows ACLs are managed separately. On Linux/Wine, create the snapshot directory on the Linux host with owner-only mode `0700` before exporting into it. Keep that protected directory even if Wine creates an individual file as `0644`; the local app can additionally restrict the file before reading it. On Windows, restrict the directory ACL to your user. The JSON includes balance/equity and market data: **do not commit or upload snapshots**. The desktop app can serve the configured private file through its local loopback-only endpoint. Do not expose that endpoint to your network.

`capturedAt` is exporter refresh time; `quote.time` is the actual broker quote time. Weekend/stale quotes are not changed or invented. Candles use broker tick volume, not centralized exchange volume or bid/ask order flow. Snapshot and quote freshness must be displayed separately. The last candle can still be forming.

Offline safety tests: `python -m unittest discover -s bridge -p 'test_*.py'`. The frontend parser is `src/lib/mt5Snapshot.ts`; it validates the version, demo flag, 2–600 ordered finite candles, quote, specifications and account summary, copying only documented fields. This adapter is data-only; the app's paper positions are not broker orders.

SDK references: [initialize](https://www.mql5.com/en/docs/python_metatrader5/mt5initialize_py), [copy rates](https://www.mql5.com/en/docs/python_metatrader5/mt5copyratesfrompos_py).
