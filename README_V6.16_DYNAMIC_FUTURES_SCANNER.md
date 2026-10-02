# Obsidian Futures V6.16 — Dynamic Futures Scanner

- Mengambil daftar perpetual USDT Futures secara dinamis dari Binance Futures.
- Memprioritaskan market likuid + market yang sedang bergerak.
- Memindai hingga 20 market terpilih per siklus.
- BTC/ETH/SOL tetap dipertahankan bila tersedia.
- Pergerakan 24 jam ekstrem diberi penalti agar sistem tidak mengejar pump secara buta.
- Market terpilih tetap melewati MTF, Smart Timing, Correlation Guard, dan safety gate.
- Chart dapat berpindah otomatis saat AUTO rotation aktif.
- Paper Auto tetap menjadi mode pengujian; LIVE tidak diaktifkan oleh update ini.
