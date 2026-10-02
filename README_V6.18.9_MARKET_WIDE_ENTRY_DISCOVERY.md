# Obsidian Futures V6.18.9 — Market-Wide Entry Discovery

Focus: mengatasi kondisi AUTO ON tetapi berjam-jam tidak menemukan kandidat yang bisa dieksekusi.

Perubahan:
- Universe scanner diperluas menjadi hingga 72 USDT perpetual aktif.
- Sumber kandidat digabung dari market paling likuid, movers terbesar, gainers, dan losers agar tidak hanya terpaku pada 36 market.
- Metrics endpoint diperluas agar mendukung hingga 80 symbol.
- Kline scanner dijalankan bertahap (batch 12) untuk mengurangi burst request.
- Kandidat UI menampilkan hingga 8 kandidat, sementara ranking menyimpan hingga 10 teratas untuk diagnosis.
- Minimum scanner quality AUTO diturunkan dari 74 menjadi 68 sebagai discovery threshold, bukan jaminan profit.
- MTF, timing, correlation, risk/RR, capital protection, kill switch, dan verifikasi posisi Binance tetap menjadi execution gates.
- Signal Drop tidak menjadi veto tersembunyi terhadap kandidat scanner.

Catatan: sistem tidak bisa mengetahui sebelumnya bahwa suatu posisi pasti profit. Tujuan perubahan ini adalah memastikan universe dan discovery layer tidak terlalu sempit sehingga peluang yang memenuhi risk/safety criteria dapat ditemukan dan dinilai.
