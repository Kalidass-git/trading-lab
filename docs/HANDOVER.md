# Trading Lab: handover

For whoever continues this app (including you, later). Read this before changing accounting.

## What changed in 1.1
- **Back-dated orders.** An order is checked against the cash the account had *on that date*. The starting capital is dated the day the account was made, so a buy before that day used to fail with a bare "not enough cash". Now the message says when the money arrived, the trade panel offers "Start this account on <date>" (`moveStart` in `model.js`), and *Account start date* can be edited in the account form. On the same day deposits are played before orders (`cmp` in `model.js`). A past-dated order at "market price" uses that day's saved close (`history.js`), never today's price.
- **No automatic price calls.** Prices, price history and company figures are fetched only by a button: *Refresh prices* (top bar / pull-down), *Get price* (trade panel), *Get prices* (watchlist), *Load chart & fundamentals* (share page), *Load history* (Insights). Adding a watchlist share or saving a basket no longer fetches anything. `market.refresh(lab, extra, { only: true })` fetches just the shares asked for.
- **Share page** `#/stock/SYMBOL` (`views/stock.js`): price, chart (line/candles, 50/200-day averages, your buys and sells, your average cost), key figures, fundamentals, your position, your trades and the trade panel. The trade panel (`tradePanel` in `lab-trade.js`) is the same component inline on that page and in the pop-up (`ticket()`) used everywhere else.
- **Numbers** (`lab/perf.js`, pure and tested): XIRR (not annualised under 30 days), closed trades with days held, win rate, payoff, profit factor, expectancy, a rebuilt equity curve from saved price history, a same-money-in-the-index comparison, and the plain-language findings on the Insights page.
- **Price history** (`lab/history.js`): up to 40 shares kept on this device (`lab.hist.*` in local storage), oldest dropped first.
- **Backend**: new `detail` action (daily candles + quote + company figures; Yahoo "crumb" cookie kept in the script cache). `quotes` now also returns day range, volume and name. **The Apps Script must be updated and re-deployed (Deploy > Manage deployments > Edit > New version)** or charts and fundamentals will say the action is unknown.
- **Look**: one P&L style everywhere (`plRs`, `plPct`, `plBoth`, `chg` in `lab-shared.js`: green ▲ / red ▼ with a sign). Add new profit/loss figures with these, not with hand-written classes.

## Design rules carried from the family app
Same layout language: phone tab bar, side menu on wide screens, cards, compact phone rows with a switchable last column, one green-style primary button per screen (here the indigo one), light and dark themes, text size control, an eye to hide figures. Only the branding differs (indigo and amber, flask logo).

## Architecture
- No build step. ES modules, hash routes (`#/dashboard`, `#/stocks/watchlists`, ...).
- `js/store.js` keeps one document (the "lab") in browser storage and pushes it to Drive after each change. `commit(fn)` applies a change and rolls it back if `fn` throws. Two devices are combined by `js/merge.js` (items matched by `id`); real clashes ask you to choose.
- Access is one key. There is no owner / family split: whoever has the key can do everything.
- `backend/Code.gs`: actions `auth`, `read`, `write` (checks `baseVersion`, locks, daily backups), `quotes`.

## The lab document
`{ v, accounts, txns, watchlists, baskets, marks, snaps, settings }`.
Everything that moves money is a **transaction** in one ledger: `deposit, withdraw, buy, sell, obuy, osell, oexp`. Cash, holdings, P&L and charges are always recomputed by replaying the ledger (`js/lab/model.js: replay`). Nothing is stored twice, so numbers cannot drift apart.

## Accounting rules (tested)
- Money is rounded to paise. Shares are whole numbers; option quantity is a multiple of the lot size.
- Average-cost method. Buy charges are added to cost; sell charges are taken off proceeds.
- No short selling and no negative cash: `addTxn` replays the whole ledger first and refuses an order that would break it (with a plain message). Back-dated orders are checked the same way.
- Options: buy to open, sell to close, settle at expiry (`oexp`). Nothing can trade after expiry (15:30 IST on the expiry date); settlement is refused before it. Expired positions show a warning until settled.
- Option premium: your manual mark if there is one, else a Black-Scholes estimate (volatility and rate in the Options page), else intrinsic value after expiry. The source is always shown.
- A holding with no price yet is carried at cost and flagged, so a missing price never looks like a loss.
- Basket quantities: whole shares, charges included, never above the amount; leftover shown. Orders are placed together or not at all.
- Stale prices: during 09:15-15:30 IST on weekdays a price older than 20 minutes is stale; outside the session, one taken before the last close is stale.

## Tests
`node tests/run-all.mjs` runs: model and ledger (including back-dated orders), performance maths (XIRR checked against an independent calculation), price-history cache, the backend script run in Node with canned Yahoo replies (`tests/backend.test.mjs`; it cannot prove Yahoo still answers in that shape), options maths, books and reports, the Excel writer (checked with a real spreadsheet library), and an import check (every import resolves, the offline file list is complete, no leftover text from the family app).

`tests/e2e/browser.mjs` is a browser check with a fake backend (needs Playwright; not part of `run-all`). It opens the app on desktop and phone width, walks through refresh, a share page, a back-dated buy and Insights, and writes screenshots.

## Known limits
- Company figures and the `detail` action depend on an unofficial Yahoo Finance route (cookie + crumb). It can change or be blocked without notice; the chart still loads when only the figures fail. Values for Indian shares are in rupees but some fields (market cap, revenue) can be missing.
- The equity curve uses the last traded price for a share whose history was not loaded, and carries options at cost; the page says so when that applies.
- The index comparison assumes each deposit buys the index at that day's close with no charges.
- Exchange holidays are not known: a holiday looks like a normal weekday to the stale-price check.
- No live option chains. Premiums are typed by you or estimated; the estimate uses one volatility for all options, so it is a guide, not a quote.
- Prices depend on Yahoo Finance through the backend; symbols can be missing or delayed. Use "My price" when a share cannot be priced.
- Index options use the index level (NIFTY, BANKNIFTY, SENSEX map to ^NSEI, ^NSEBANK, ^BSESN). Lot sizes are what you enter; they are not looked up.
- Dividends, splits, bonus issues and corporate actions are not modelled.
- Taxes are not modelled. Charges are a simple percentage plus a flat amount per account.
- The Android project was assembled but could not be built in the authoring environment (no Android SDK there): run `npm run android:debug` on your machine first.
- The browser checks ran in headless Chromium at phone width; try it on a real phone before sharing.

## Changing the icon
Edit `scripts/make-icons.py` and run it (needs Python with Playwright). It redraws `icons/` and every Android icon and splash image.
