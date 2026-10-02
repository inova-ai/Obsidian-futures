# Obsidian Futures V6.18 — Final Trial

Tujuan: versi uji coba terpadu untuk Dynamic Futures Scanner + Paper Auto Engine.

## Urutan
Scanner dinamis → likuiditas → funding/OI/spread → pump/chase guard → ranking → chart rotation → MTF 5m/15m/1h → smart timing → correlation guard → Decision/Safety Gate → Paper Entry → Position Manager → laporan.

## PAPER AUTO
Aktifkan `PAPER AUTO ENGINE` di Dashboard. Modul ini dapat melakukan rotasi dan paper entry tanpa mengaktifkan AUTO LIVE. `AUTO TRADE` tidak diperlukan untuk menjalankan Paper Auto Engine.

## LIVE
AUTO LIVE tetap harus diaktifkan secara manual dan seluruh safety gate tetap berlaku. V6.18 tidak mengaktifkan LIVE secara otomatis. Untuk pengujian awal gunakan PAPER.

## Verifikasi
1. Deploy ZIP baru.
2. Buka Dashboard.
3. Pastikan chart memuat.
4. Buka scanner dan tekan SCAN SEKARANG.
5. Aktifkan PAPER AUTO ENGINE.
6. Pastikan status scanner, market terpilih, dan paper journal berubah saat ada setup.
7. Export paper journal/report untuk evaluasi.

Tidak ada jaminan profit. PAPER diperlukan sebelum penggunaan LIVE.
