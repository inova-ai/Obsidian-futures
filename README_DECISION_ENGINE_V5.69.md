# V5.69 Decision Engine

Menggabungkan base Decision Quality, historical edge, regime performance, capital protection, portfolio exposure, dan validation menjadi satu status `TRADE / WAIT / BLOCK`.

- AUTO hanya dilanjutkan jika status `READY`.
- Manual BUY/SELL tetap tidak dikunci oleh Decision Engine.
- Validation HOLD baru menjadi hard wait jika sample >= 40; sample kecil tidak dianggap sebagai bukti strategi buruk.
- Tidak ada jaminan profit atau prediksi harga.
