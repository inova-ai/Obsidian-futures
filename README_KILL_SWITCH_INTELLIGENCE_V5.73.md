# V5.73 Kill-Switch Intelligence

Menambahkan circuit-breaker intelligence di sisi dashboard.

## Deteksi
- Kill switch aktif.
- Market WebSocket stale > 12 detik.
- Account stream stale > 20 detik saat authenticated.
- Data Quality CRITICAL.
- Capital Protection sedang blocked.
- Live-vs-Research DEGRADED sebagai warning.

## State
- SAFE: tidak ada kondisi kritis.
- WARNING: ada kondisi yang perlu dipantau.
- PAUSE: kondisi kritis; AUTO entry dihentikan.

V5.73 tidak memprediksi harga dan tidak menjamin profit. Ia hanya menambah pengaman operasional. Posisi yang sudah terbuka tidak dipaksa ditutup oleh intelligence layer ini.
