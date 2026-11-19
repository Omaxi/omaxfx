# OmaxFX

OmaxFX is a browser-based market replay and manual trading simulator built with React, Vite, Lightweight Charts, Zustand, and Papa Parse.

## Requirements

- Node.js 20.19+ (or a compatible newer LTS release)
- npm

## Local development

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

## Production build

```bash
npm run lint
npm test
npm run build
npm run preview
```

Vite's preview server normally runs at http://localhost:4173.

## Importing market data

Use **Import CSV** in the application header to load a custom dataset. Supported instruments are XAUUSD and EURUSD.

Supported columns:
- Date and Time, or a combined Timestamp / DateTime column
- Open, High, Low, Close
- Optional Volume

Headers are case-insensitive. The importer validates OHLC values, skips invalid rows, removes duplicate timestamps, sorts candles chronologically, and asks for the source timezone. Data is normalized to OmaxFX's canonical UTC-5 timeline.

## Price precision

- EURUSD: five decimal places (for example, 1.11987), minimum price increment 0.00001.
- XAUUSD: two decimal places (for example, 4325.80), minimum price increment 0.01.

## Offline use

The production PWA caches application assets and CSV datasets after they have been fetched at least once. For dependable offline use, open the app while online and load the datasets you intend to use before disconnecting. Browser storage limits and eviction policies still apply; offline availability should be checked in the target browser.

## Tests and CI

`npm test` runs Node's built-in test runner. GitHub Actions runs lint, tests, and a production build for pull requests and pushes to main. Deployment to GitHub Pages is limited to pushes to main and manual workflow runs.

## Notes

- Session timestamps are displayed against the app's configured timezone.
- Backtest results are simulations and depend on the resolution and quality of the imported OHLC data.
- When a candle touches both a trade's stop and target within the same OHLC bar, the engine uses a conservative stop-first assumption because intrabar price sequence is unavailable.
