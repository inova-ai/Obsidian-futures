# V5.65 — Portfolio Risk Engine

Adds a portfolio-level exposure monitor using the live account snapshot.

## Monitors
- Open positions by symbol and side
- Gross exposure
- Long/short exposure
- Exposure concentration
- Gross exposure relative to balance
- Net directional bias
- Per-position unrealized PnL
- Risk state: CONTROLLED / WATCH / HIGH EXPOSURE

## Safety
This is an advisory monitoring layer. It does not automatically open, close, resize, or modify positions. Correlation is not inferred without sufficient historical data.
