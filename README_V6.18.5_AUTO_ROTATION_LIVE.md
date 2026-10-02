# Obsidian Futures V6.18.5 — Auto Market Rotation + Position Chart Follow

## Tujuan
Sistem dapat memindai Futures USDT secara dinamis, memilih kandidat yang lolos gate, membuka order otomatis ketika AUTO LIVE benar-benar diaktifkan, lalu mengalihkan chart ke symbol posisi yang benar.

## Alur
Scanner -> ranking market -> MTF -> timing -> correlation -> safety/decision -> order -> verifikasi posisi Binance -> chart mengikuti posisi.

## Perubahan penting
- Scanner tidak lagi dibatasi daftar 7 symbol lama untuk data market.
- Endpoint order memvalidasi symbol sebagai Futures USDT perpetual yang aktif.
- Memperbaiki bug backend pada konversi LONG/SHORT -> BUY/SELL.
- Supervisor AUTO memeriksa akun berkala.
- Jika posisi Binance terbuka pada symbol lain, chart otomatis mengikuti posisi tersebut.
- Setelah posisi terbuka, sistem tidak merotasi ke coin lain sampai posisi flat.
- Scanner kembali mencari kandidat setelah posisi tertutup dan AUTO masih ON.
- Nama JS unik V6.18.5 untuk menghindari cache lama.

## Catatan keamanan
AUTO LIVE hanya dapat mengirim order jika backend dikonfigurasi dengan `TRADING_MODE=live` dan `ENABLE_LIVE_TRADING=true`, kredensial Binance valid, dan seluruh safety gate lolos. Default aplikasi tidak mengubah mode live secara otomatis.

Paper/demo tetap tersedia untuk pengujian tanpa uang nyata.
