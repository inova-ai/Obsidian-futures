# Obsidian Futures V6.18.3 — Final Clean UI

This build is based on the uploaded V6.18.2 Clean Folders ZIP.

## What was fixed
- The Dashboard tab no longer displays every V6.08–V6.18 module as one continuous page.
- The feature map is collapsed into its own folder.
- Market Scanner, Adaptive Learning, Smart Entry, Position Manager, and Paper Auto Engine are separate accordion folders.
- System readiness checks are also collapsed.
- Only the System Summary and the first automation module are open initially.
- Folder groups close the previous open folder when another is opened.
- Existing chart, market data, paper engine, and trading logic are not rewritten.
- A unique app-v6.18.3.js filename is used to avoid stale browser JS cache.
- LIVE order automation remains disabled by this UI-only change.

## Expected mobile result
At the top: chart -> compact status -> folders.
The long module stack is no longer expanded simultaneously.
