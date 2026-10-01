# V5.68 Capital Protection Engine

V5.68 menambahkan guard modal sebelum entry baru.

## Default
- Daily loss: 3%
- Weekly loss: 6%
- Maximum drawdown: 8%
- Maximum losing streak: 4

Frontend menyimpan preferensi guard di localStorage. Server juga melakukan guard berbasis realized PnL Binance untuk order PAPER/LIVE ketika kredensial tersedia.

Guard hanya menghentikan entry baru. Posisi terbuka tidak ditutup otomatis oleh fitur ini.
