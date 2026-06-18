---
name: sentinel
description: >
  Monitor all inbound Stripe revenue streams across all registered companies.
  Detect cohort-level anomalies, pricing outliers, pre-churn signals, and revenue
  recognition gaps. Operate in single-company mode (deep scan) or portfolio mode
  (cross-company ranked findings). Always pass company_id to MCP tools.
  Trigger on: "check revenue", "revenue anomaly", "how is [company/plan] performing",
  "churn signals", "MRR", "payment failures", "Sentinel report", "portfolio scan".
version: 2.0.0
platforms: [cli, telegram, discord]
requires_mcp: ledger-core
---

# Sentinel — Revenue Monitoring (Multi-Company)

## Mode Detection
- If company specified → single-company deep scan for that company_id
- If no company specified → portfolio scan across all active companies
- Always resolve company name to company_id via `registry_get_company` before scanning

## Single-Company Deep Scan

1. Resolve company_id
2. Pull last 30 days: `stripe_list_charges(company_id, limit=500, days=30)`
3. Pull subscriptions: `stripe_list_subscriptions(company_id)`
4. Group by: plan tier, acquisition channel (metadata), geography, signup cohort
5. For each cohort compute: MRR contribution + trend, failed payment rate vs baseline,
   days since last charge, LTV trajectory
6. Flag: failed payment rate > 1.5x baseline (pre-churn signal)
7. Flag: pricing tier conversion moved >10% in 14 days
8. Flag: subscriptions active but not generating charges (recognition gap)
9. For trading-agent type companies: compute net P&L from Issuing transactions
   tagged with `unit:[slug]` instead of subscription MRR
10. Rank findings by annualised financial impact
11. Output ranked findings with: signal type, segment, dollar impact, action, confidence

## Portfolio Scan

1. Call `registry_list_companies()` — get all active companies
2. Use `delegate_task` to run single-company scans in parallel across all companies
3. Collect results, merge, re-rank by financial impact across portfolio
4. Add cross-company observations:
   - Which company is contributing most MRR/P&L to portfolio?
   - Any company showing correlated anomalies (same signal across multiple)?
   - Portfolio-level MRR total and trend

## Anomaly Response Protocol
- Impact < $1,000/mo: log, include in daily summary
- Impact $1,000–$10,000/mo: surface immediately tagged MEDIUM
- Impact > $10,000/mo: surface immediately tagged HIGH, ping escalation contact
- Pre-churn signal on customer > $500 MRR: surface immediately regardless of total

## Tools
- `registry_list_companies` — get all companies for portfolio scan
- `registry_get_company` — resolve name to company_id
- `stripe_list_charges(company_id, ...)` — scoped to one company
- `stripe_list_subscriptions(company_id, ...)` — scoped to one company
- `stripe_list_issuing_transactions(company_id, ...)` — for trading-agent P&L
- `delegate_task` — parallel scans across companies

## Output Format
```
SENTINEL REPORT — [company name or PORTFOLIO] — [timestamp]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 HIGH [$x annualised] — [Company Name]
[Finding]. Recommended: [action]. Confidence: high.

🟡 MEDIUM [$x annualised] — [Company Name]
...

📊 SUMMARY
[Company]: MRR $x | trend [+/-x%] | flags: [n]
[Company]: P&L +$x/mo | trend [+/-x%] | flags: [n]
Portfolio MRR equivalent: $x
```
