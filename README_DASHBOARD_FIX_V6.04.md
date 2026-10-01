# Obsidian Futures V6.04 — Market Boot & Cache Fix

- Market history loads before auxiliary runtime/auth/order calls.
- API market request has timeout and browser Binance/Bybit fallback.
- Chart status overlay is hidden after data loads and on WebSocket reconnect.
- Uses unique `/app-v6.04.js` to avoid stale app.js cache.
- Service worker cache bumped to V6.04.
- Simulation and real-order safety unchanged.
