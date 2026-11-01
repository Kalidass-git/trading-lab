# Trading Lab

Practice trading with virtual money. Shares, baskets and options, many separate accounts, reports and charts. Nothing here touches a real broker or real money.

It is a standalone app. It shares no code, data, key or Drive file with any other app.

- **Web app / PWA**: plain JavaScript, no build step. Host the folder on any static host, or open it from a local server.
- **Android app**: a Capacitor project in `android/` that wraps the same files.
- **Backend**: one Google Apps Script (`backend/Code.gs`) in your own Google account. It keeps one JSON file in your own Drive and fetches share prices. One access key opens everything.

Start with `docs/SETUP.md`. How it works and what it cannot do: `docs/HANDOVER.md`.

## What is inside

| Area | What you can do |
|---|---|
| Accounts | Create, rename, archive, delete. Each has its own capital, cash, holdings, charges, history and performance. |
| Stocks | Buy and sell at the market price or your own price, by quantity or by rupee amount, with charges. Realised and unrealised P&L. Watchlists with target prices and notes. |
| Baskets | Weights add to 100%. Enter an amount; whole-share quantities, charges and leftover cash are worked out and shown before you place all orders. Basket performance and one-tap exit. |
| Options | Calls and puts, strike, expiry, lots. Enter the premium yourself, or use a Black-Scholes estimate. Settlement at expiry. |
| Share page | One page per share: chart, key figures, fundamentals, your position and the buy / sell panel. Back-dated orders use that day's saved close. |
| Insights | XIRR, comparison with the index, win rate and payoff, which approach works, and plain-language findings. |
| Dashboard | Capital, value, total and today's P&L, return, positions, performance chart, recent activity. |
| Reports | Filter and sort trades, per share, per strategy, per account. Export CSV or Excel. |
| Prices | A dedicated Refresh prices button (and pull-down on Android), last-refresh time, stale-price warning. |

## Run the tests

    node tests/run-all.mjs

## Folder map

    index.html, manifest.webmanifest, sw.js   the web app shell
    css/app.css                               styles (indigo and amber branding)
    js/main.js                                routes, top bar, account bar, refresh button
    js/store.js, remote.js, merge.js          saving, Drive sync, merging two devices
    js/lab/                                   the accounting, options, time, report and export logic (no screens)
    js/views/                                 the screens (stock.js = one share, insights.js = did it work)
    backend/Code.gs                           Apps Script backend
    android/                                  Capacitor Android project
    scripts/                                  copy web files for Android, run Gradle, redraw icons
    tests/                                    automated tests
    docs/                                     SETUP.md, HANDOVER.md
