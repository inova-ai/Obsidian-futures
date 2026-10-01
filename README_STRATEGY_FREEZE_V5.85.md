# Obsidian Futures V5.85 — Strategy Freeze

V5.85 adds an explicit strategy-freeze layer for cleaner experiments.

## What it does
- Creates a snapshot of the current strategy configuration and fingerprint.
- Locks the core experiment parameters while frozen:
  - timeframe
  - risk reference
  - leverage
  - sizing mode
  - take-profit mode
  - ATR stop multiplier
  - RR
  - entry guard
- Unfreezing is manual.
- Existing V5.72 strategy versioning remains active, so changes can still be tracked as new snapshots/versions.
- If the application code version changes after a freeze, the UI marks the old freeze as requiring a re-freeze before treating it as the current experimental baseline.

## Safety
Freeze does not open, close, or modify real orders. It only controls strategy configuration fields and records a local snapshot in browser localStorage.

## Validation
- app.js syntax checked
- api/index.js syntax checked
- index.js syntax checked
- ZIP integrity checked
