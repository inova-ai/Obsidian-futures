# Obsidian Futures V5.86 — Full Trading Simulator

Safe virtual simulator with multi-position support, virtual leverage cap, risk-based sizing, fee, slippage, funding, max holding bars, daily/weekly loss limits, maximum drawdown gate, cooldown, export/reset, and live market-driven candle simulation.

## Safety
- No live order endpoint is called by the simulator.
- Uses browser-local virtual balance/journal.
- Entry is evaluated at the next candle open after a closed-candle decision.
- If SL and TP are both touched in one candle, SL is treated first.
- Results are simulations, not guarantees of future profitability.
