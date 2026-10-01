# V5.54 — Risk / Reward Optimizer

Adds a historical risk-scenario panel using CLOSED signal realized-R outcomes.

## Features
- Risk-per-trade scenarios: 0.25%, 0.50%, 0.75%, 1.00%, 1.25%, 1.50%
- Simple historical compounding simulation
- Maximum drawdown and maximum losing-streak comparison
- Chronological 70/30 train vs out-of-sample check
- Conservative and best simulated candidate shown as manual recommendations
- Minimum 20 CLOSED outcomes before scenario recommendations appear

## Safety
This is not a candle-level backtest and does not guarantee future returns. It does not automatically change leverage, risk %, SL/TP, or orders. Any risk change remains manual.
