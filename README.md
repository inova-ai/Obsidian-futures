# Obsidian Futures V5.6 — Vercel Premium

Vercel-native deployment of the Obsidian Futures dashboard.

## Architecture
- Express app exported from `src/index.js`, the supported Vercel Express entry path.
- Premium responsive dashboard served from `public/index.html`.
- Binance Futures market WebSocket connects directly from the browser.
- PostgreSQL is external/persistent via `DATABASE_URL` (Neon/Supabase/Postgres provider).
- Live trading is disabled by default.

## Environment variables
See `.env.example`.

Required for persistent database features:
- `DATABASE_URL` (or `POSTGRES_URL`)

Required for authentication/token signing:
- `MASTER_KEY`

Vercel bootstrap login fallback:
- `ADMIN_USERNAME` (default: `admin`)
- `ADMIN_PASSWORD` (recommended; if omitted, `MASTER_KEY` is accepted as the bootstrap password)

Binance Futures connection (recommended for Vercel):
- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`

The server prefers these Vercel environment credentials and never sends them to the browser. The optional in-app credential form remains available only for database-backed deployments. Use a Binance HMAC/system-generated key for this implementation. For safety, do not enable withdrawals; grant only the Futures/read permissions required by the app.

Recommended:
- `ENABLE_LIVE_TRADING=false`
- `BINANCE_BASE_URL=https://fapi.binance.com`
- `MAX_LEVERAGE=20`
- `MAX_RISK_PCT=2`
- `MAX_DAILY_LOSS_PCT=5`
- `ALLOWED_SYMBOLS=BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,DOGEUSDT,ADAUSDT`
- `SESSION_TTL_SEC=28800`

## Deploy
Import the repository/project in Vercel. Do not set a custom build command or output directory.
Node.js 24.x is selected through `package.json`.

After deployment check:
- `/api/health` should return JSON.
- After login, `/api/binance/test` should report `connected: true` when Binance credentials are valid.
- `/` should show the dashboard.

If `/api/health` returns an error, inspect the Vercel Function logs before enabling any live trading.

### If the screenshot says `Database initialization failed`
The dashboard now keeps the market/chart/auth surface available even when PostgreSQL is not connected. Add `DATABASE_URL` (or `POSTGRES_URL`) in Vercel Project Settings → Environment Variables, then redeploy. Vercel environment-variable changes apply to new deployments.

If you do not have a database yet, set `MASTER_KEY` and optionally `ADMIN_USERNAME`/`ADMIN_PASSWORD`; the Login screen can authenticate in environment-admin mode. Persistent journal, paper positions, credentials, kill-switch state, and settings still require PostgreSQL.


## Vercel region
This version pins the Node.js Function to `sin1` (Singapore) so server-side
requests to external market-data services originate from the configured
Singapore Function region. Redeploy after changing `vercel.json`.
