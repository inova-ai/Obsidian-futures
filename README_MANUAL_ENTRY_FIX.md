# v5.38.5 Manual Entry Fix

Manual BUY/SELL is now genuinely manual. A displayed BUY signal no longer has to survive a second signal recalculation at the exact button-click moment.

- BUY button sends LONG when clicked, unless the global manual STOP ENTRY is active.
- SELL button sends SHORT when clicked, unless the global manual STOP ENTRY is active.
- ENTRY_GUARD remains active for AUTO entries only.
- AUTO re-checks the fresh realtime signal immediately before sending an order.
- Binance remains the source of truth for the resulting position.
