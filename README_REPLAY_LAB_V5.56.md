# V5.56 Replay Lab

Replay Lab menyimpan snapshot candle sebelum signal agar evaluasi dapat dilakukan tanpa hindsight. Pada T0 future candle disembunyikan; user dapat reveal satu candle demi satu candle.

## Catatan
- Signal/BUY/SELL tidak diubah.
- Leverage, SL/TP, dan AUTO TRADE tidak diubah otomatis.
- Signal lama tanpa snapshot menggunakan fallback dan diberi label.
- Replay grade adalah alat audit, bukan jaminan profit.
