# Obsidian Futures V6.18.11 — Signal → Execution Sync Fix

Perbaikan fokus pada kasus BUY/SELL sudah terlihat tetapi AUTO tidak pernah sampai order.

## Perubahan
- Scanner candidate menjadi sumber eksekusi untuk AUTO setelah MTF + timing + correlation + risk lolos.
- Snapshot MTF fresh dari kandidat menggantikan cache MTF chart lama yang bisa berasal dari symbol sebelumnya.
- S/R tetap dipakai untuk menyusun SL/TP, tetapi konteks S/R lama tidak lagi menjadi veto diam-diam terhadap kandidat scanner yang sudah tervalidasi.
- Order scanner melewati duplicate client timing guard yang membaca candle/signal chart lama; server-side execution/risk checks tetap berlaku.
- Order tetap dianggap sukses hanya jika posisi Binance benar-benar terdeteksi.
- Strategy version: 6.18.11.

## Catatan keselamatan
AUTO tidak dipaksa untuk entry. Jika server LIVE belum aktif, kill switch aktif, capital/risk check gagal, order ditolak, atau posisi tidak terverifikasi, sistem tetap menahan entry dan menampilkan statusnya.
