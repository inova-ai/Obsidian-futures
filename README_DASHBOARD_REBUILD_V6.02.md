# Obsidian Futures V6.02 — Dashboard Rebuild

## Perbaikan utama
- Default Dashboard sekarang fokus pada chart + Feature Control Dashboard.
- Panel legacy panjang dan analysis rail disembunyikan pada Dashboard agar tidak menenggelamkan fitur.
- Mobile non-dashboard menyembunyikan analysis rail agar modul yang dipilih menjadi fokus.
- Cache-busting app.js dinaikkan ke v6.02.
- Service worker cache dinaikkan ke v6.02.
- /api/klines memakai Bybit linear sebagai fallback jika Binance market REST gagal.
- /api/market/ticker memakai fallback Bybit agar polling tetap punya harga.
- Tab Posisi sekarang memiliki tampilan posisi yang jelas.
- Real order automation tetap OFF; tidak ada perubahan ke aturan order live.
