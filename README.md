# Obsidian Futures V5.6 — Vercel Ready

## Deploy
1. Upload this folder to a GitHub repository, or use Vercel's **Drop to Deploy** with the contents of this folder.
2. Deploy with Node.js **24.x**.
3. Add the environment variables from `.env.example` in Vercel Project Settings.
4. Use a managed PostgreSQL database (Neon/Supabase/etc.) and set `DATABASE_URL`.
5. Keep `ENABLE_LIVE_TRADING=false` for the first deployment.
6. After deployment open `/api/health` and confirm the API/database status.

## Important
- This project does not require Docker, Caddy, PM2, systemd, or a VPS process.
- `api/index.js` is the Vercel serverless backend.
- `index.html` is the static frontend.
- Market WebSocket data is consumed by the browser.
- PostgreSQL is external/persistent; Vercel is the compute/hosting layer.
- Node.js 24 is used because Vercel is deprecating Node.js 20 for new deployments on October 1, 2026.


## Runtime note
Vercel selects Node.js from the `engines.node` field in `package.json` (24.x). The `functions` block intentionally does not set a `runtime` property, because Vercel-managed Node.js Functions do not require a runtime override.
