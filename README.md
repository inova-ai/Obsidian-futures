# Obsidian Futures v5.34.1 — Signal Drop v3

Patch focused on making **Signal Drop** an auditable next-candle predictor instead of a live, constantly changing forecast.

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
