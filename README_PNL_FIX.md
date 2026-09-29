# Obsidian Futures v5.35.2 — PnL / Binance Truth Sync

Fixes the realtime PnL display bug found in the supplied recording.

## Root cause
The UI conversion helper `fmtIDR()` already converts a USDT amount to IDR. Several realtime/close-result paths converted USDT to IDR with `fromUSDT()` and then passed the result into `fmtIDR()` again. This multiplied the value by `USDT_IDR_RATE` twice. Example: ~0.54 USDT UPNL became ~Rp147,015,000 instead of ~Rp8,910 at a 16,500 rate.

## Fix
- Realtime position UPNL now converts USDT -> IDR exactly once.
- Realized PnL after close now converts exactly once.
- Exit price, balance-after-close, wallet delta, and entry confirmation use the same single conversion path.
- Live status explicitly identifies Binance `positionRisk` as the source of actual position/PnL.
- Added a USDT display beside the live PnL so the source amount is auditable.
- Existing unified FINAL SIGNAL, realtime sync, and AUTO TRADE behavior are preserved.

## Verification
- `node --check app.js` passed.
- `node --check api/index.js` passed.
- ZIP integrity test passed.
