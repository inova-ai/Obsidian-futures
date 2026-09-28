# Obsidian Futures v5.34 — Unified Signal + Precision + Live Confirmation + Calibrated Signal Drop

## Signal Drop changes
- Signal Drop is now **candle-close locked**: it no longer rewrites the same signal repeatedly while a candle is forming.
- The prediction is calculated from the **closed candle structure** and stored as the forecast for the next candle.
- Each stored prediction is evaluated when its target candle closes as `HIT`, `MISS`, or `NETRAL`.
- The Signal Drop header shows observed accuracy from completed BUY/SELL predictions.
- WebSocket and polling paths both record a signal when a new candle is detected.
- Live entry protection remains separate from Signal Drop, so a noisy live tick cannot rewrite historical predictions.

## Important
"Accuracy" is an observed historical hit rate for the selected symbol/timeframe and is not a guarantee of future profit. A WAIT prediction is not counted as a directional hit/miss.

## Existing fixes retained
- Unified current-signal engine.
- Three-sample live direction confirmation.
- Binance price/quantity precision handling.
