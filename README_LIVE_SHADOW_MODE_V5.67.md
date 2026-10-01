# V5.67 — Live Shadow Mode

Shadow Mode mencatat signal live tanpa mengirim order. Setiap signal non-WAIT disimpan sekali per target candle. Outcome proxy dihitung dari open ke close candle target.

## Safety
- Tidak memanggil endpoint order.
- Tidak mengubah posisi Binance.
- Tidak mengubah BUY/SELL engine.
- Tidak mengaktifkan AUTO TRADE.

## Interpretasi
Minimal 20 closed shadow outcomes sebelum membandingkan recent vs full-sample. Shadow outcome bukan fill aktual dan belum memasukkan fee/funding/slippage aktual. Gunakan sebagai validasi sebelum mempertimbangkan live trading.
