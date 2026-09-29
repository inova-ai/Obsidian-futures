# Obsidian Futures v5.37.0 — Cumulative PnL + Signal Engine

## PnL
- Profit realized terakhir tetap ditampilkan terpisah.
- Ditambahkan Profit Realized Kumulatif dari Binance income history (REALIZED_PNL, USDT).
- Cache server 15 detik mencegah pagination income dipanggil pada setiap refresh 1 detik.
- UI tidak lagi mengganti angka kumulatif dengan profit trade terakhir.

## Signal engine
- Closed-candle-first: keputusan entry memakai candle yang sudah close.
- Multi-factor confluence: candle structure, EMA 9/21/50, RSI, MACD, ADX, VWAP, volume, S/R, breakout dan MTF.
- BUY/SELL memerlukan minimal 4 konfirmasi, skor 68+, gap 12+, dan tidak ada konflik MTF kuat.
- Konflik/market choppy menghasilkan WAIT.
- AUTO TRADE dinaikkan ke score 72 dan gap 12 serta tetap membutuhkan 2 candle searah.
- Tidak ada klaim bahwa sistem dapat menjamin profit atau menghilangkan loss.

## Verification
- node --check api/index.js
- node --check app.js
- node --check index.js
- python3 -m py_compile patch.py
- ZIP integrity check
