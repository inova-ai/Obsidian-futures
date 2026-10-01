# V5.64 Cost & Funding Engine

Membandingkan gross PnL dengan fee dan funding aktual dari journal bila tersedia.

## Metrics
- Gross PnL
- Fee total
- Funding total
- Net PnL setelah biaya
- Net hit rate
- Rata-rata fee/funding per closed trade
- Model cost: fee, slippage, funding parameter

## Guardrails
- Minimum data ditampilkan transparan; tidak mengarang biaya aktual.
- Funding historis per candle tidak diklaim tersedia jika chart hanya menyediakan OHLC.
- Parameter model tidak dianggap sebagai biaya aktual exchange.
- Tidak mengubah BUY/SELL, leverage, SL/TP, atau AUTO TRADE.
