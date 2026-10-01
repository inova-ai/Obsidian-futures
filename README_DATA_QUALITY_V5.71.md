# V5.71 — Data Quality Engine

Validates candle, signal, and shadow data before they are relied on for learning/decision layers.

Checks include invalid OHLC/timestamps, duplicate/non-monotonic candles, large gaps, malformed signals, stale pending outcomes, duplicate shadow records, and unknown shadow outcomes. Critical data issues cause the Decision Engine to hold rather than silently learn from corrupted records.

This is a local application-level validation layer; it does not certify the upstream market feed.
