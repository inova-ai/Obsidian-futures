# Obsidian Futures V6.18.7 — Auto Execution Sync

Perbaikan fokus pada sinkronisasi AUTO:

`Dynamic Futures Scanner -> ranking -> MTF -> timing -> correlation -> risk plan -> Binance order -> position verification -> chart follow`

Perubahan penting:
- AUTO ON otomatis mengaktifkan market scanning/rotation; tidak lagi bergantung pada toggle rotasi terpisah.
- Frozen Signal Drop / "NEXT CANDLE WAIT" tidak lagi menjadi veto diam-diam terhadap kandidat scanner yang sudah lolos validasi live.
- Scanner candidate menjadi execution signal setelah lolos MTF, timing, correlation, scanner-quality dan risk/R:R.
- Order engine menerima execution signal yang sudah tervalidasi dan tetap memverifikasi posisi aktual dari Binance.
- Setelah posisi terverifikasi, chart otomatis mengikuti symbol posisi.
- State engine: IDLE, VALIDATING, ORDER_PENDING, POSITION_ACTIVE, WAIT, ERROR.
- Frontend/API/service version dibump ke 6.18.7 untuk menghindari stale asset.
- Tidak ada synthetic position: respons order saja tidak dianggap sebagai posisi aktif.

LIVE tetap membutuhkan konfigurasi server yang benar: `TRADING_MODE=live` dan `ENABLE_LIVE_TRADING=true`, plus Binance API credentials yang valid. Safety/risk gates tetap berlaku.
