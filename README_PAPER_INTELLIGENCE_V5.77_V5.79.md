# Obsidian Futures V5.77–V5.79

## V5.77 Trade Replay
Replays a closed paper trade from the stored signal snapshot through next-open entry and final exit. It is an audit/review tool and does not rewrite results.

## V5.78 Paper vs Research
Compares paper-trading closed results with the existing signal research journal. A minimum 20+20 samples is displayed as the review threshold; it is not a guarantee of future performance.

## V5.79 Adaptive Risk
Optional paper-only risk governor. Base risk can only be reduced:
- Normal: 1.00x
- Caution: 0.50x when drawdown >= 3% or current losing streak >= 2
- Defensive: 0.25x when drawdown >= 5% or current losing streak >= 3

It never increases risk after winning trades, does not change the virtual leverage cap, and does not send real orders.
