# Obsidian Futures v5.36.0 — Realtime Market Sync

Patch focused on making **Signal Drop** an auditable next-candle predictor instead of a live, constantly changing forecast.

## Realtime market-sync patch (5.36.0)
- Migrated Binance USDⓈ-M market WebSocket URLs to the current `/market` and `/public` routing. Binance retired the legacy WebSocket routing in 2026.
- Candles now use direct Binance WebSocket market data as the primary source instead of a 1-second REST request that could overwrite newer ticks.
- `aggTrade` updates the live candle immediately; kline updates remain the canonical OHLC/volume stream.
- REST is now only a fallback when the market WebSocket is disconnected. When WebSocket reconnects, REST polling stops.
- `bookTicker` and `depth@100ms` use the public WebSocket. Depth updates are sequence-checked against the REST snapshot instead of being blindly overwritten every 3 seconds.
- Open interest remains a periodic REST value because it is not a tick stream in this UI.
- Account/position reconciliation remains a 1-second REST safety refresh; market price, mark price, funding, candle and order-book data no longer depend on that polling loop.
- Added a local `npm start` entrypoint and a comprehensive syntax check.

## Signal Drop v3 changes
- Prediction is **frozen when the reference candle closes**.
- The prediction is assigned to exactly **one next candle** using `targetTs`.
- When that next candle closes, the app evaluates it as `HIT`, `MISS`, or `NETRAL`.
- Historical predictions are never rewritten by later ticks.
- Live candle movement can still update the separate **ARAH ENTRY LIVE** panel, but it does not rewrite Signal Drop history.
- Signal Drop shows a compact **NEXT CANDLE** card plus an auditable result history.
- HIT rate is calculated only from closed BUY/SELL predictions; WAIT and doji-like neutral candles are not counted as hits or misses.
- Local storage key is migrated to `obsidian_signal_drop_v3`, so old mutable Signal Drop rows are not mixed with the new audit history.

## Important
This is a measurement and prediction architecture, not a guarantee of future price direction. A high historical HIT rate does not guarantee future performance.

## Deploy
Replace the previous package with this ZIP. Keep the existing Binance credentials and trading-mode environment variables.


## Signal Drop / Entry Fix
- Manual BUY/SELL is no longer blocked by AI WAIT or opposite live signal.
- Only the explicit STOP ENTRY control can block a manual order (plus existing open-position/validation checks).
- Signal Drop now visibly shows CLOSE time -> NEXT candle time, score, strength, and evaluation result.
- Historical predictions remain frozen and are evaluated only after the target candle closes.
- This does not guarantee prediction accuracy or profit.

## Auto-trade direction fix

- Normalizes model signals (`BUY`/`SELL`) into exchange position directions (`LONG`/`SHORT`) before preview and order submission. This fixes the previous direction inversion where an automatic BUY signal could be sent as a SHORT order.
- Position comparisons now use the same BUY/SELL signal convention, so an existing same-direction position is recognized.
- Automatic entry errors and failed close confirmations are propagated to the auto-trade status instead of being reported as a successful/unclear action.
- Auto trade is still browser-driven and uses this device's localStorage setting. Keep the dashboard open and authenticated; it is not a persistent server-side trading worker on Vercel. Closing/suspending the tab stops automatic monitoring. For unattended trading, a separately deployed persistent worker/scheduler with server-side safeguards is required.
- Trading signals are probabilistic and cannot guarantee profit. Test in Binance Demo Futures before enabling live trading.


## Auto-trade safety patch (5.35.0)
- Confirmed opposite signal closes the existing position but does not reverse in the same candle. A one-timeframe cooldown is applied before any new entry.
- Auto profit protection now closes only after the configured profit giveback condition; a momentary opposite signal cannot force a close/re-entry loop.
- Entry and profit-protection automation share a mutual busy guard. The last processed signal and cooldown survive page reloads in localStorage.
- Deploy this build to Vercel and keep only one dashboard tab open while testing in Demo Futures.
