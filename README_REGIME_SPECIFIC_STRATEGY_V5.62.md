# V5.62 Regime-Specific Strategy

Menilai performa signal CLOSED berdasarkan market regime: TREND_UP, TREND_DOWN, RANGE, dan HIGH_VOLATILITY.

## Guard
- Minimal 20 closed outcomes untuk panel aktif.
- Regime aktif perlu sample minimum sebelum status SUPPORTED/WEAK.
- Recent-vs-historical check digunakan agar regime yang dulu bagus tetapi baru-baru ini melemah tidak dianggap kuat.
- Tidak mengubah BUY/SELL, leverage, SL/TP, atau AUTO secara otomatis.

Historical R adalah evaluasi masa lalu, bukan jaminan hasil masa depan.
