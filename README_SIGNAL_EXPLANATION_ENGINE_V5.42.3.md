# Signal Intelligence Layer — v5.42.3

Added to the existing Signal Explanation Engine without creating a second signal engine:

- Confidence Breakdown: candle/readiness/learning/S/R/MTF/risk components.
- Signal Lifecycle: FORMING, ACTIVE, TP1 REACHED, INVALIDATED, CLOSED/HIT/MISS.
- Anti-Chase: checks current price against the calculated entry zone.
- Invalidation: shows the current risk-plan invalidation boundary and proximity.
- Historical Similar Setup: compares the current signal with stored closed signals for the same symbol/timeframe/side; reports HIT/MISS/neutral sample counts and marks partial matches when older rows lack feature snapshots.
- New signal records persist a feature snapshot for better future similarity matching.

The engine remains explanatory only and does not override BUY/SELL or place orders by itself.
