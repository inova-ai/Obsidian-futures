# V5.74 — Full Decision Audit

V5.74 records auditable snapshots whenever the unified decision state changes. Each record includes signal direction/score, final decision, base gate, edge, regime, capital protection, portfolio state, research validation, data quality, strategy version, price, and reasons.

Audit is stored locally in `localStorage` under `obsidian_decision_audit_v574`, capped at 100 records, and can be exported as JSON. It is diagnostic only and does not guarantee profitability or change the core BUY/SELL signal.
