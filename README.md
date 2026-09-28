# Obsidian Futures v5.34 — Balance Sync

Patch focused on Binance Futures realized PnL and balance synchronization.

## What changed
- Binance Futures wallet balance is treated as the authoritative displayed balance.
- Account endpoint now reads `/fapi/v3/balance` and `/fapi/v3/account` together.
- Recent `REALIZED_PNL` income entries are returned for reconciliation/audit.
- Available balance and total wallet balance are exposed from the exchange snapshot.
- Frontend account synchronization runs every 1 second instead of every 2 seconds.
- Existing position/PnL display remains based on live Binance position data.
- No automatic Futures-to-Spot transfer is performed.

## Important
Realized PnL increases Futures wallet balance only after the position is actually closed. While a position is still open, profit is unrealized (`uPnL`) and is not the same as withdrawable/available balance.

## Deploy
Replace the previous package with this ZIP. Keep the existing Binance credentials and trading-mode environment variables.
