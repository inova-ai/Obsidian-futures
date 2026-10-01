# V5.58 Full Historical Backtest Engine

Adds a candle-by-candle historical simulation using only information available at each signal timestamp.

## Model
- Signal is generated from candles through index `i` only.
- Entry occurs at the open of candle `i+1` with configured slippage.
- Smart Risk Plan supplies SL/TP as it existed at signal time.
- TP/SL are evaluated chronologically over the configured maximum holding bars.
- If SL and TP are both touched in the same candle, the engine uses conservative SL-first treatment.
- Fees are deducted from the simulated return.
- Funding is not modeled per candle because the chart endpoint does not contain historical funding events.
- Results are split chronologically into 70% train and 30% out-of-sample.

This is a historical simulation, not a guarantee of future performance.
