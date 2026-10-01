# Obsidian Futures V5.76 — Live Paper Trading / Safe Mode

V5.76 adds a browser-local paper trading engine that reuses the existing Decision Engine but never sends real orders.

## Safety
- SAFE PAPER mode is separate from Binance order execution.
- No order endpoint is called by the paper module.
- Virtual balance, trades, pending signal, and journal are stored locally in browser localStorage.
- Signal is captured at candle close.
- Virtual entry is simulated at the next candle open with configurable slippage.
- SL/TP/timeout are evaluated only from candles that occur after entry.
- If SL and TP are both touched in one candle, SL is taken first (conservative assumption).

## Metrics
- Equity / realized PnL
- Drawdown
- Hit rate
- Average R
- Expectancy
- Trade count
- Maximum losing streak
- Recent paper journal

## Recommended review threshold
Use at least 20 paper trades for an initial sample and preferably 40+ before treating the paper results as a meaningful validation set. Paper results do not guarantee live profitability.
