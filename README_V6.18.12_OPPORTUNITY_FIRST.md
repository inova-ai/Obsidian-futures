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


## V6.18.12-ACTIVE — AUTO OPPORTUNITY MODE

AUTO sekarang dibuat lebih aktif mengambil peluang tanpa menonaktifkan safety execution. Perubahan utama:
- AUTO score minimum: 58 → 52 untuk scanner execution.
- AUTO quality minimum: 58 → 52.
- Gap minimum: 4 → 2.
- MTF: minimal 1 dari 3 timeframe searah; 15m tidak lagi wajib menjadi veto.
- R:R execution minimum: 1.25R.
- Legacy closed-candle AUTO mengikuti threshold opportunity yang sama dan tidak lagi membutuhkan Decision Engine `READY` atau Quality 70 sebagai syarat tambahan.
- Timing ekstrem, capital protection, kill switch, posisi existing, risk plan, server-side sizing, Binance order response, dan verifikasi posisi tetap menjadi safety gate.

Mode ini mengejar lebih banyak setup yang layak, bukan menjamin setiap sinyal akan profit.

## V6.19 Adaptive Profit Engine

The AUTO engine remains opportunity-first and does not add a hard confidence gate for entry. V6.19 adds management after entry:

- adaptive risk sizing from signal score/quality and closed-trade expectancy buckets;
- no-trade veto is not created from historical edge alone — negative edge reduces size instead;
- TP1 partial close at 0.80R (30% by default);
- break-even protection after TP1 / 0.80R;
- trailing protection after 1.20R using ATR/structure distance;
- Binance partial-close and protection-adjustment endpoints with reduce-only orders;
- existing take-profit is preserved when protection is adjusted.

Safety gates such as kill switch, capital protection, one-position rule, exchange sizing validation and Binance position verification remain active.


## V6.19.1 — MTF sebagai konteks, bukan veto arah
- Kandidat live BUY/SELL dari scanner tidak lagi ditolak hanya karena tidak ada timeframe yang searah.
- MTF tetap ditampilkan sebagai konteks/caution untuk transparansi, tetapi tidak menjadi syarat unanimity.
- Entry tetap harus lolos risk plan, sizing, kill switch/capital protection, pemeriksaan server, dan konfirmasi posisi Binance.
- Tujuan perubahan: mengurangi WAIT yang disebabkan konflik antar-timeframe; bukan menjanjikan profit atau menghapus pengamanan order.
