# V6.18.12 — Opportunity-First AUTO

Perubahan fokus versi ini: AUTO tidak lagi menunggu setup "sempurna" jika peluang sudah memenuhi minimum yang masuk akal.

## Alur
SCAN market Futures → ranking → MTF fresh → timing → risk/SL/TP → ENTRY READY → order → verifikasi posisi Binance → chart follow.

## Penyesuaian
- Minimum kualitas kandidat AUTO: 58/100.
- Minimum skor teknikal kandidat: 58/100.
- Minimum R:R TP1: 1.25R.
- Timing warning biasa tidak lagi menjadi veto otomatis; kondisi ekstrem/chasing tetap diblokir.
- MTF tetap wajib: 15m harus searah dan minimal satu timeframe lain searah.
- Kill switch, capital protection, server-side sizing/risk, exchange mode, dan verifikasi posisi tetap aktif.
- Tidak ada pemaksaan order jika server LIVE tidak aktif atau order tidak benar-benar menghasilkan posisi.

## Catatan
Threshold lebih aktif bukan jaminan profit. Tujuannya mengurangi false WAIT dan membuat scanner lebih responsif terhadap peluang yang cukup layak. Profit tetap tidak dapat dijamin.
