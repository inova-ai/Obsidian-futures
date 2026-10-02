# Obsidian Futures V6.18.6 — Total Auto Entry / Live Sync Fix

## Perubahan utama
- Profitability Gate tidak lagi memblokir trade pertama saat histori belum cukup.
- Histori tetap menjadi adaptive guard; edge historis yang benar-benar negatif masih dapat memblokir arah.
- Unified Decision tidak menganggap CAUTION akibat data histori kosong sebagai blocker.
- Dynamic Futures Scanner diperluas hingga 36 market USDT perpetual yang aktif dan likuid.
- AUTO rotation quality floor diturunkan ke 74 agar kandidat tidak terlalu mudah tersaring, sementara risk/safety/MTF/order verification tetap berlaku.
- Asset frontend diberi versi unik 6.18.6 untuk menghindari cache lama.

## Alur
SCAN → RANK → MTF/TIMING/RISK → AUTO ENTRY → ORDER → VERIFY POSITION → FOLLOW CHART → MONITOR → CLOSE → SCAN AGAIN.

Catatan: mode LIVE tetap memerlukan konfigurasi Binance API dan environment `TRADING_MODE=live` + `ENABLE_LIVE_TRADING=true`. Tidak ada kode yang memalsukan posisi; entry hanya dianggap berhasil setelah posisi Binance terdeteksi.
