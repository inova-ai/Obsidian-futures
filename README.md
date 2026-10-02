# Obsidian Futures v5.37.0 — Realtime Market Sync

Patch focused on making **Signal Drop** an auditable next-candle predictor instead of a live, constantly changing forecast.

## Realtime market-sync patch (5.37.0)
- Migrated Binance USDⓈ-M market WebSocket URLs to the current `/market` and `/public` routing. Binance retired the legacy WebSocket routing in 2026.
- Candles now use direct Binance WebSocket market data as the primary source instead of a 1-second REST request that could overwrite newer ticks.
- `aggTrade` updates the live candle immediately; kline updates remain the canonical OHLC/volume stream.
- REST is now only a fallback when the market WebSocket is disconnected. When WebSocket reconnects, REST polling stops.
- `bookTicker` and `depth@100ms` use the public WebSocket. Depth updates are sequence-checked against the REST snapshot instead of being blindly overwritten every 3 seconds.
- Open interest remains a periodic REST value because it is not a tick stream in this UI.
- Account/position reconciliation remains a 1-second REST safety refresh; market price, mark price, funding, candle and order-book data no longer depend on that polling loop.
- Added a local `npm start` entrypoint and a comprehensive syntax check.

## Signal Drop v3 changes
- Prediction is **frozen when the reference candle closes**.
- The prediction is assigned to exactly **one next candle** using `targetTs`.
- When that next candle closes, the app evaluates it as `HIT`, `MISS`, or `NETRAL`.
- Historical predictions are never rewritten by later ticks.
- Live candle movement can still update the separate **ARAH ENTRY LIVE** panel, but it does not rewrite Signal Drop history.
- Signal Drop shows a compact **NEXT CANDLE** card plus an auditable result history.
- HIT rate is calculated only from closed BUY/SELL predictions; WAIT and doji-like neutral candles are not counted as hits or misses.
- Local storage key is migrated to `obsidian_signal_drop_v3`, so old mutable Signal Drop rows are not mixed with the new audit history.

## Important
This is a measurement and prediction architecture, not a guarantee of future price direction. A high historical HIT rate does not guarantee future performance.

## Deploy
Replace the previous package with this ZIP. Keep the existing Binance credentials and trading-mode environment variables.


## Signal Drop / Entry Fix
- Manual BUY/SELL is no longer blocked by AI WAIT or opposite live signal.
- Only the explicit STOP ENTRY control can block a manual order (plus existing open-position/validation checks).
- Signal Drop now visibly shows CLOSE time -> NEXT candle time, score, strength, and evaluation result.
- Historical predictions remain frozen and are evaluated only after the target candle closes.
- This does not guarantee prediction accuracy or profit.

## Auto-trade direction fix

- Normalizes model signals (`BUY`/`SELL`) into exchange position directions (`LONG`/`SHORT`) before preview and order submission. This fixes the previous direction inversion where an automatic BUY signal could be sent as a SHORT order.
- Position comparisons now use the same BUY/SELL signal convention, so an existing same-direction position is recognized.
- Automatic entry errors and failed close confirmations are propagated to the auto-trade status instead of being reported as a successful/unclear action.
- Auto trade is still browser-driven and uses this device's localStorage setting. Keep the dashboard open and authenticated; it is not a persistent server-side trading worker on Vercel. Closing/suspending the tab stops automatic monitoring. For unattended trading, a separately deployed persistent worker/scheduler with server-side safeguards is required.
- Trading signals are probabilistic and cannot guarantee profit. Test in Binance Demo Futures before enabling live trading.


## Auto-trade safety patch (5.35.0)
- Confirmed opposite signal closes the existing position but does not reverse in the same candle. A one-timeframe cooldown is applied before any new entry.
- Auto profit protection now closes only after the configured profit giveback condition; a momentary opposite signal cannot force a close/re-entry loop.
- Entry and profit-protection automation share a mutual busy guard. The last processed signal and cooldown survive page reloads in localStorage.
- Deploy this build to Vercel and keep only one dashboard tab open while testing in Demo Futures.


## Simple Auto Trade update
- Auto entry threshold: score 60, gap 5, no mandatory 2-candle confirmation.
- Auto loss cut: Rp700 by default, configurable in UI.
- Profit protection remains peak/giveback based.
- Re-entry cooldown after auto close: 15 seconds.
- These controls are risk management only and do not guarantee profit.


## v5.38.1 — AUTO entry recovery
- AUTO sekarang bisa mengambil pending signal yang sudah terbentuk saat halaman baru dibuka/reload, selama signal masih berlaku untuk candle berjalan.
- Kunci `lastAutoSignalKey` baru disimpan setelah posisi benar-benar terdeteksi di Binance. Jika order gagal/transient, AUTO mencoba lagi dengan jeda 5 detik.
- Tidak mengubah aturan sinyal, cut loss Rp700, profit protection, atau realtime market data.

## v5.38.2 — Entry/Position Reconciliation Fix
- AUTO/manual entry is only considered successful when Binance `positionRisk` reports a non-zero position.
- An order response with `executedQty` but no active position is no longer treated as a synthetic position.
- Entry failures remain visible in the UI for 12 seconds instead of being immediately overwritten by the 1-second account refresh.
- AUTO status explicitly reports `BINANCE POSITION TERDETEKSI` on a confirmed entry and keeps failed entries retryable when the signal remains valid.


## v5.38.3 — Risk/Reward AUTO balance
- AUTO confirmation gap disamakan dengan FINAL SIGNAL: minimum gap 4 (bukan 5), sehingga signal SELL/BUY tidak diam hanya karena perbedaan threshold.
- Profit lock default diubah dari 10% menjadi 25% retrace dari profit puncak. Contoh: peak +Rp30.000 memberi ruang turun sampai sekitar +Rp22.500 sebelum proteksi menutup.
- Setelah profit-lock menutup posisi, cooldown kembali singkat 15 detik, bukan menunggu satu candle penuh.
- Batas rugi otomatis tetap default Rp700 dan dapat diubah dari panel.
- `noTp` tetap aktif secara default sehingga profit tidak dipotong oleh TP tetap; profit dikelola oleh profit-lock.
- PnL posisi dan status posisi tetap bersumber dari posisi Binance yang terdeteksi.


## v5.38.4 — Unified Realtime & Execution Sync
- Binance Futures menjadi satu-satunya sumber market candle untuk chart/signal; fallback Bybit dihapus agar signal tidak berbeda dari exchange tempat order dieksekusi.
- Ditambahkan Binance Futures User Data WebSocket untuk `ACCOUNT_UPDATE` dan `ORDER_TRADE_UPDATE`; posisi/order menjadi sumber realtime utama, REST hanya fallback sinkronisasi. Binance merekomendasikan User Data Stream untuk posisi/order karena update diurutkan dan REST dapat tertunda saat volatilitas.
- User stream otomatis reconnect dan keepalive; UI menampilkan status `ACCOUNT WS · REALTIME`.
- Entry manual dengan `ENTRY GUARD` sekarang benar-benar mengikuti signal realtime; entry berlawanan ditahan.
- AUTO melakukan validasi signal ulang tepat sebelum order sehingga tidak membuka berdasarkan signal yang sudah basi.
- Setelah posisi ditutup karena loss/profit-lock, kunci signal lama dibersihkan sehingga re-entry searah bisa dilakukan setelah cooldown dan konfirmasi baru.
- Service worker/app cache dinaikkan ke v5.38.4 agar browser tidak menjalankan JavaScript lama.
- Tidak ada sistem yang dapat menjamin profit; perubahan ini menyatukan data dan eksekusi, bukan menjamin arah pasar.


## v5.40.2 Execution Sync
- Binance USDⓈ-M account WebSocket uses the routed private endpoint in live mode; demo keeps the demo Futures stream. Binance retired legacy production WS routing in April 2026.
- Close reconciliation uses the actual close order trades (`userTrades`) for executed price, realized PnL and USDT commission, then confirms position = 0 via positionRisk.
- UI distinguishes unrealized PnL, realized PnL, close fee, and net realized result.
- REST is reconciliation/fallback; it is not treated as the primary realtime account feed.


## v5.40.3 Error Response Fix
- Error response dari BUY/SELL sekarang dinormalisasi agar object tidak tampil sebagai `[object Object]`.
- Detail error Binance ditampilkan apa adanya bila tersedia.
- API entry memastikan field `error` selalu berupa string.
- Tidak mengubah logika indikator Supertrend/B/S atau sizing/order execution.

## v5.40.4 — Entry Timing Guard
- Supertrend B/S tetap digunakan.
- AUTO tidak entry hanya karena skor signal tinggi.
- Sebelum order AUTO, sistem mengecek momentum realtime, arah candle realtime, posisi harga dalam range, dan jarak harga dari garis Supertrend.
- Jika harga sudah terlalu dekat puncak/dasar atau sedang berlawanan arah, AUTO berubah menjadi WAIT dan tidak mengejar harga.
- Manual BUY/SELL tetap bisa digunakan pengguna secara eksplisit.
\n\n## v5.40.5 — Trend vs Entry State\n- Supertrend B/S is the confirmed trend authority.\n- Temporary opposite candle/realtime momentum no longer changes an established BUY/SELL trend.\n- UI separates TREND (BUY/SELL) from ENTRY (BUY/WAIT).\n- AUTO waits only when the confirmed trend remains valid but price is at an extreme and realtime momentum is pulling back.\n- Manual BUY/SELL remains unchanged.\n

## v5.40.6 — AI Candle Live
- Menambahkan pembacaan candle berjalan realtime berbasis body, upper wick, lower wick, posisi close, dan micro-direction.
- Supertrend B/S tetap menjadi TREND authority.
- Candle live hanya menentukan timing ENTRY: searah = boleh entry, berlawanan/netral = WAIT tanpa membalik TREND.
- UI menampilkan body/wick/close position secara realtime.
- Manual BUY/SELL tetap bebas.


## v5.40.9 — Premium Desktop/App Visual Skin
- Tampilan utama diubah menjadi dashboard aplikasi trading premium bergaya dark navy/black.
- Desktop mendapat sidebar aplikasi kiri, header market, chart utama, panel analisis kanan, dan kontrol trading yang lebih tegas.
- Warna tombol BUY/LONG menggunakan emerald, SELL/SHORT menggunakan coral-red, kontrol aktif menggunakan gold/orange, mengikuti mockup visual yang diminta.
- Mode HP tetap responsive: sidebar disembunyikan dan layout kembali menjadi satu kolom.
- Tidak mengubah ID elemen trading atau logika entry/close; perubahan ini fokus pada visual/layout.


## v5.40.9 Premium Dashboard Cleanup
- Premium desktop/app dashboard layout retained and refined.
- Removed the chart education/lesson popover so the candlestick chart remains unobstructed.
- Removed the Candle Learning navigation item.
- Supertrend B/S, realtime candle, position, PnL, entry and execution controls remain unchanged.


## v5.41.8 — Adaptive Candle Learning
- Rolling walk-forward learning from closed candles only.
- Learns wick/body, close-position, score bucket, direction and S/R-context patterns.
- Historical hit rate nudges signal confidence; it never guarantees the next candle direction.
- Adaptive OOS validation is available from the Uji Strategi tab.
- Learning cache is rebuilt when the symbol/timeframe/last closed candle changes and can be reset manually.

## V6.19 SIGNAL-FIRST AUTO FIX
AUTO rotation is discovery-only. After switching to a candidate market, the engine reads the freshly loaded live BUY/SELL signal and attempts entry immediately. Scanner score/quality, MTF, timing, correlation and R:R are not entry vetoes in this mode; non-negotiable safety remains: AUTO enabled, no open position, capital protection/kill switch, usable SL/TP plan, server risk checks, Binance order response and position verification.
