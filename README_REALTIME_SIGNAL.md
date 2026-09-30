# v5.38.7 Realtime Signal Split

- CONFIRMED SIGNAL: dihitung dari candle yang sudah close dan menjadi acuan Signal Drop.
- REALTIME MOMENTUM: membaca candle yang sedang berjalan, harga, body/wick, EMA realtime, ATR movement, dan volume.
- WAIT pada Confirmed Signal tidak berarti harga sedang turun; itu berarti konfirmasi candle-close belum selesai.
- Posisi yang sudah terbuka tetap mengikuti posisi/PnL Binance realtime, bukan status signal entry.
- Manual BUY/SELL tetap mengikuti tombol pengguna; signal hanya informasi.
- AUTO tetap memakai confirmed signal dan guard realtime sebelum entry.
