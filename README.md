# TradePast — Offline Trading Replay Simulator

TradePast is a local-first market replay and manual backtesting application. No account, sign-in, trading connection, or internet service is required while the app is running locally.

## Run locally

1. Install Node.js 20 or newer.
2. Install dependencies once: `npm ci`.
3. Start the local app: `npm run dev`.
4. Open the localhost URL printed by Vite.

For a production/offline-ready build:

1. Run `npm run build:offline`.
2. Run `npm run preview`.
3. Open the localhost URL and use the browser's **Install TradePast** action to install the PWA.
4. Load the market data you need at least once. Selected CSV files are cached on this computer and can be used offline on later launches.

The app shell and data catalog are precached by the service worker. CSV market files are cached locally as they are loaded. Keep the local preview server running when launching the installed local PWA.

## Add or update market data

Place files in **`public/data/`**. The catalog is regenerated automatically before `npm run dev` and `npm run build`.

- Use CSV files with a header row and Date/Time or Timestamp plus Open, High, Low, Close columns. Volume is optional.
- Name yearly files `SYMBOL_YYYY.csv`, for example `NAS100_2026.csv`. Files with the same symbol are grouped in the data selector.
- Select only the years you need to reduce memory use and load time.
- Naive date/time values in project and manually imported CSV files are treated as **UTC+3 wall-clock time** and converted to UTC internally. Explicit timezone offsets (such as `+03:00`) and Unix epoch timestamps are treated as absolute instants and are not shifted again.
- After adding or replacing a file, restart the dev server or rebuild the production app so the generated catalog includes it.
- Newly added data is not automatically available to an already installed offline copy until that copy is rebuilt/updated and the new file is loaded once.

## Price precision and risk controls

- EURUSD is displayed and edited to **five decimal places**, with a minimum tick of **0.00001** (for example, 1.11987).
- XAUUSD / Gold is displayed and edited to **two decimal places**, with a minimum tick of **0.01** (for example, 4325.80).
- Prop-firm daily-loss and maximum-drawdown checks use conservative intrabar account equity, including floating P&L on open positions. Peak equity also tracks favorable intrabar extremes.
- Position volume is rounded down to the supported 0.0001 lot step so rounding does not increase the requested risk.

## Offline behavior

- Replay, charting, drawing, manual orders, reporting, and saved sessions run locally.
- The first dependency installation and first download of an updated app/data file require access to the local package cache or internet.
- Once the app and selected market files are installed/cached, ordinary replay and backtesting do not make network requests.
- The app stores saved sessions in this browser profile. Clearing site data or uninstalling/clearing the browser profile can remove them.

## Saved sessions

Sessions are autosaved locally and can be resumed or deleted from the Saved Sessions list. A session uses the symbol and date range recorded when it was saved; the corresponding CSV files must still exist in `public/data/` or be available in the local market-data cache.

## Prop-firm rules

Prop-firm enforcement can be switched on or off per new session. When disabled, daily-loss, maximum-drawdown, and max-risk-per-trade enforcement is bypassed. Replay has no wall-clock countdown.

## Development checks

- `npm run test` — automated utility tests
- `npm run build` — production build and service-worker generation
- `npm run lint` — lint audit (the repository may still contain legacy lint findings)
