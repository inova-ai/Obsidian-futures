# Obsidian Futures V5.49 — Confidence Calibration & Edge Stability

Adds historical confidence calibration, recent-vs-previous edge drift monitoring, and regime-level stability context.

Safety: this layer is analytical only. It does not automatically modify BUY/SELL, leverage, SL/TP, AUTO TRADE, or live parameters.

Calibration compares observed HIT rate with the average signal score bucket. Edge Stability compares the latest 20 closed outcomes with the previous 20 when enough data exists.
