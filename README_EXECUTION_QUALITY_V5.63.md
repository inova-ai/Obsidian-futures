# V5.63 Execution Quality

Menilai apakah actual entry mengikuti trade plan berdasarkan execution record yang tersedia dari posisi live.

## Metrics
- Actual vs planned entry
- Slippage (bps)
- Execution latency
- Chase count (>20 bps)
- Recent execution quality

## Guardrails
- Minimal 5 execution records sebelum score dinilai.
- Tidak mengarang fill yang tidak tersedia.
- Tidak mengubah BUY/SELL, leverage, SL/TP, atau AUTO TRADE.
