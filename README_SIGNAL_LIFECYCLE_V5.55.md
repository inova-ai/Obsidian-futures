# V5.55 Signal Lifecycle 2.0

Adds auditable signal state transitions: FORMING, READY/WAIT ENTRY, ACTIVE, TP1 REACHED, TP2 REACHED, INVALIDATED, TP / HIT, and SL / MISS.

The layer records transitions only; it does not modify the main BUY/SELL engine, leverage, SL/TP, or order execution automatically.
