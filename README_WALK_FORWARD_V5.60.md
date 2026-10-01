# V5.60 Walk-Forward Validation 2.0

V5.60 validates strategy parameter candidates across multiple chronological out-of-sample windows. It is a research layer only and does not auto-apply parameters or guarantee profitability.

## Guard
- minimum 320 candles and 100 usable signal setups
- 5 chronological windows
- train/test separation per fold
- candidate must have sufficient OOS sample
- stability requires positive average OOS R, positive train average, at least 60% positive OOS folds, and worst OOS drawdown below 35%
- no automatic live parameter changes
