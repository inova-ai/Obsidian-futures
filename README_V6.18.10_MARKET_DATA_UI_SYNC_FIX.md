# Obsidian Futures V6.18.10 — Market Data UI Sync Fix

Fixes the startup/runtime error shown as:
`Data market gagal: Cannot set properties of null (setting 'textContent')`

Root cause: the clean dashboard removed several legacy indicator DOM nodes (`macd`, `vwap`, `adx`, `atr`, `rsi`, `bbw`) while the core candle calculation still wrote to them without null guards. The market data itself could be loaded successfully, but the calculation threw afterward and the catch block mislabeled it as a market-data failure.

Changes:
- Guard optional legacy indicator DOM updates in `calc()`.
- Keep calculations active even when those optional dashboard fields are absent.
- Bump frontend to V6.18.10 and update index.html script reference.
- Keep `app.js` synchronized for syntax/build checks.
- No change to live-order safety gates or automatic execution permissions.
