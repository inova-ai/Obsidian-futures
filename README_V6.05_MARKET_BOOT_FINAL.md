# Obsidian Futures V6.05 — Market Boot Final Fix

Perubahan utama:
- Mematikan service worker lama dan membersihkan cache legacy saat boot.
- App memakai nama file unik `app-v6.05.js`.
- Cache-Control `no-store` untuk `index.html` dan app JS.
- Market history: server -> Binance Futures -> Bybit Futures -> Binance Spot fallback.
- Error JavaScript/unhandled promise ditampilkan di status chart agar tidak lagi diam di “Menghubungkan data market…”.
- `/api/health` version diperbarui ke 6.05.0-market-boot-fix.

Catatan: Binance Spot fallback hanya untuk visualisasi chart ketika data futures tidak dapat diambil; bukan sumber order/eksekusi.
