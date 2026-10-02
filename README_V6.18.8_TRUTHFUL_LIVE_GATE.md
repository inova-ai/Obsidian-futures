# V6.18.8 — Truthful Live Gate / UI Sync

Fixes the contradictory legacy research/control UI that showed `LIVE EXECUTION: MANUAL ONLY` and `REAL ORDER AUTO: DISABLED` even when the actual V6.18 auto-execution engine was present.

- Research gate no longer masquerades as the AUTO execution veto.
- Runtime LIVE state is read from `/api/health` + `/api/runtime`.
- UI distinguishes AUTO OFF, server LIVE disabled, and AUTO LIVE ready.
- No automatic enabling of real trading is performed.
- Real orders remain gated by server `TRADING_MODE=live`, `ENABLE_LIVE_TRADING=true`, valid credentials, authentication, kill switch, risk and position verification.
