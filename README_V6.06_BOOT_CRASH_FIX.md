# Obsidian Futures V6.06 — Boot Crash Fix

Fixes the V6.05 startup crash `Cannot read properties of undefined (reading 'toFixed')` that could occur in the large forecast/research rendering chain before market candles had loaded. The early boot path now waits for candle data before running candle-dependent research panels.

Also fixes an undefined variable in the forecast renderer and hardens live candle numeric formatting.

Deploy this version as a new Vercel deployment. Real-order automation remains OFF.
