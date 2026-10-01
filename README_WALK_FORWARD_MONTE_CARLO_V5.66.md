# V5.66 — Walk-Forward + Monte Carlo Combined

Combines chronological 5-window validation with Monte Carlo stress testing on recorded CLOSED realized-R outcomes.

- Minimum 40 closed outcomes.
- Five chronological windows.
- Each window reports average R, hit rate and drawdown.
- 400 Monte Carlo resamples per window.
- Guard requires at least 4/5 positive windows, positive average window R, and worst Monte Carlo 95th-percentile drawdown below 30%.
- No live parameter or order is changed automatically.
- This is a research/stress layer, not a guarantee or a candle-level backtest.
