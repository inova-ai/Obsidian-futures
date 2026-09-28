## v5.25.0 patch audit
- Fixed LIMIT Entry conversion: UI accepts IDR while Binance/backend receives USDT.
- Added Cross/Isolated margin synchronization before leverage/order.
- Added emergency rollback when SL/TP protection cannot be installed after an entry order.
- Protected journal and audit read endpoints with authentication.
- Synchronized app/service-worker/package/API version to 5.25.0 to prevent stale cached frontend code.
- JavaScript syntax checks pass for `app.js` and `api/index.js`.

## v5.25 — Analysis/Execution Separation + Sizing + Position + Realized Balance Reconcile
- Close endpoint waits for Binance position to reach 0, then reads realized PNL and wallet balance.
- UI shows realized PNL, post-close balance, and wallet delta after close.
- Account refresh continues to use Binance as the source of truth.

# Obsidian Futures v5.8 — Binance Demo / Realtime

Vercel-ready Binance USDⓈ-M Futures dashboard with realtime market data, Binance Demo account balance/positions, and explicit BUY/SELL entry controls.

## What was fixed
- **Binance Demo is now the safe default.** `TRADING_MODE=demo` automatically uses `https://demo-fapi.binance.com` for Futures REST and `wss://demo-fstream.binance.com` for market WebSocket. Existing live `BINANCE_BASE_URL` values are ignored while in demo mode. Binance documents Demo Trading as a virtual-funds environment and confirms API access for Demo Trading.
- **Account balance/positions no longer require PostgreSQL** when `BINANCE_API_KEY` and `BINANCE_API_SECRET` are supplied in Vercel. This fixes the common blank `Balance USDT` / `Available USDT` state caused by the old DB middleware.
- **Realtime market WebSocket fixed.** The frontend now uses the combined `/stream?streams=...` endpoint instead of `/market/stream`.
- **Order-book depth updates are merged** with the snapshot instead of replacing the whole book with each delta.
- **Account refresh is 2 seconds** and depth/open-interest refresh is 3 seconds. A separate market-ticker fallback refreshes the current candle about every 1.5 seconds so the chart continues moving even if the browser WebSocket reconnects.
- **BUY / LONG and SELL / SHORT buttons are explicit.** In `demo` mode they send exchange orders to Binance Demo; in `paper` mode they create local paper positions; in `live` mode they can send real orders only when `ENABLE_LIVE_TRADING=true`.
- **Header shows account environment** (`BINANCE DEMO`, `BINANCE LIVE`, or `PAPER`).
- **Kill switch works without PostgreSQL** as an in-memory safety fallback; database persistence is still used when PostgreSQL is configured.

## Vercel environment variables — recommended Demo setup
Set these in **Vercel → Project → Settings → Environment Variables**, then redeploy:

```text
TRADING_MODE=demo
ENABLE_LIVE_TRADING=false
BINANCE_API_KEY=YOUR_BINANCE_DEMO_API_KEY
BINANCE_API_SECRET=YOUR_BINANCE_DEMO_API_SECRET
MASTER_KEY=YOUR_LONG_RANDOM_SECRET
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YOUR_LONG_ADMIN_PASSWORD
MAX_LEVERAGE=20
MAX_RISK_PCT=2
MAX_DAILY_LOSS_PCT=5
ALLOWED_SYMBOLS=BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,DOGEUSDT,ADAUSDT
SESSION_TTL_SEC=28800
```

`DATABASE_URL` is optional for the realtime account/chart surface. Add PostgreSQL if you want persistent paper trades, journal, audit history, database-stored credentials, 2FA setup, and persistent settings.

For **Demo Trading**, create the API key from Binance Demo Trading/API Management. Demo credentials are separate from live credentials. Never put a live API key into a Demo deployment.

## Trading modes
- `TRADING_MODE=demo` → Binance Futures Demo / virtual funds. This is the recommended testing mode.
- `TRADING_MODE=paper` → no exchange orders; local paper engine.
- `TRADING_MODE=live` + `ENABLE_LIVE_TRADING=true` → real Binance Futures orders. Use only after testing the Demo mode.

## Endpoints / verification
After deployment:
- `/api/health` — confirms `tradingMode`, Binance environment/base URL, credentials-configured flag, DB state, and kill switch.
- `/api/runtime` — confirms the public market WebSocket endpoint used by the frontend.
- `/api/binance/test` — after login, confirms account access, trading permission, balance and positions.
- `/api/account` — after login, returns the current Binance Futures balance/positions.

The account API is authenticated because it exposes private balance and position data.

## Important
For Binance Demo, the market/chart data may mirror live market conditions while account balances and orders are simulated. The Demo environment is separate from real funds. Keep withdrawals disabled on any live API key used with the app.

## Deploy
Import the ZIP/project into Vercel. No custom build command is required. Node.js 24.x is specified in `package.json`. The Vercel Function region remains `sin1`.


## v5.8 UI/realtime additions
- Account/Balance is moved into a clear center dashboard below the chart instead of the old sidebar location.
- Live position panel shows side, entry, mark, quantity, unrealized PnL, ROE, and the last realized PnL when a position is closed.
- Large center BUY/LONG and SELL/SHORT quick-entry buttons are provided in addition to the execution controls.
- Live candle direction, AI entry direction, candle-close countdown, and Jakarta clock are shown continuously.
- Chart zoom has dedicated + / − / reset controls and mouse-wheel zoom.
- `/api/market/ticker` provides a no-cache Binance REST fallback for the current candle/mark/index/funding data.


## v5.25 — Analysis/Execution Separation
- Indicator buttons (EMA, BB, MACD, VWAP, ADX, ATR) are analysis-only.
- Trendline and Fibonacci are chart-analysis tools only.
- Auto S/R and Swings are analysis-only.
- Indicator/tool clicks do not call the order function. Manual execution remains on LONG/SHORT buttons.
- UI explicitly labels the separation between analysis and execution.


## Signal Drop v5.29
- Realtime projection sequence up to 12 candles.
- Time format follows WIB and uses dot separator (HH.MM WIB).
- Projection score combines candle body/wicks, momentum, EMA bias, support/resistance proximity, and a decaying horizon weight.
- Projection is a directional bias, not a guarantee of future price.


## v5.29 fixes
- Startup is read-only: page load never submits an order.
- Live position panel explicitly shows positions detected from Binance; it does not create them.
- Signal projection thresholds were recalibrated so normal directional confluence does not collapse into WAIT on every candle.
- Forward decay now reduces added future conviction instead of multiplying away the underlying candle evidence.


## Signal Drop v5.31 — balanced per-candle projection
- Memisahkan **trend saat ini** dari **prediksi candle berikutnya**.
- Prediksi memakai candle closed terbaru.
- Decision engine memakai 3 level: Strong BUY / Strong SELL / conflict-WAIT.
- MTF dibatasi sebagai context; tidak lagi cukup untuk mempertahankan BUY/SELL beruntun.
- Support/resistance menjadi directional override: rejection/area dekat level dapat membalik proyeksi.
- Forecast 26 candle menggunakan projected virtual path per candle, bukan menyalin bias global.
- Signal Drop menyimpan tepat satu hasil per candle slot dan dapat menampilkan `B`, `S`, atau `W`.
