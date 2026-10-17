# Contributing

Use Node.js24+ and npm. Run `npm ci`, `npm test`, `npm run build`, then browser tests before submitting changes. Include behavior and validation in pull requests. Keep chart interactions responsive and honor reduced-motion preferences.

Put pure indicator/data/execution math in `src/lib` with independent numerical/edge-case tests. UI lives in `src/components` and `src/App.tsx`. Every visible control must perform a useful action and handle failures. Do not advertise a data source or platform package without verifying it.

Do not submit private recovery files, account credentials, Telegram sessions, broker configurations, third-party proprietary code, signing keys or copyrighted TradingView assets. New dependencies must be compatible with public redistribution. Preserve chart attribution and license notices.

Paper trading stays separate from any future broker bridge. Never add a hidden network or order-execution path. Discuss larger adapters/plugin APIs in an issue before implementation.
