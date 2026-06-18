---
name: comptroller
description: >
  Govern all outbound spend across all registered companies. Map inference/token
  costs to workflows per company. Enforce per-company per-workflow spend caps.
  Compare spend to revenue attribution. Surface cross-company inference ROI.
  Always pass company_id to MCP tools.
  Trigger on: "check spend", "token costs", "overspending", "which agent costs most",
  "spend by workflow", "Comptroller report", "set spend limit", "pause workflow",
  "inference ROI", "portfolio spend".
version: 2.0.0
platforms: [cli, telegram, discord]
requires_mcp: ledger-core
---

# Comptroller — Spend Governance (Multi-Company)

## Mode Detection
- Company specified → deep spend audit for that company
- No company → portfolio spend view across all companies
- For trading-agent companies: Polymarket/Kalshi API costs = inference spend equivalent

## Single-Company Spend Audit

1. Resolve company_id
2. Pull Stripe Projects spend: `stripe_get_project_spend(company_id)`
3. Pull Issuing transactions: `stripe_list_issuing_transactions(company_id, days=30)`
4. Group by workflow label (required tag on all agent card spend)
5. For each workflow:
   a. Total token/API cost, average cost per unit, trend
   b. Cross-ref with Sentinel revenue data: revenue attributable to this workflow?
   c. Gross margin = revenue attributed - direct cost
   d. Flag: cost trending up without revenue increase, or margin < 40%
6. Identify model routing optimisations (large model doing small-model work)
7. Check spend caps approaching limit (>80% consumed) — flag before breach
8. Rank by: savings potential or risk

## Portfolio Spend View

1. `delegate_task` to run per-company audits in parallel
2. Merge and rank by: highest inference cost, worst inference ROI, biggest optimisation opportunity
3. Cross-company insight: which company has the best/worst inference efficiency?
4. Total portfolio inference spend vs total portfolio revenue = portfolio inference margin

## Autonomous Actions (check company guardrails first)
- Adjust spend cap ±20%: AUTONOMOUS if within company guardrail
- Pause non-critical workflow at cap: AUTONOMOUS, log immediately
- Switch inference provider if cost delta >15%: AUTONOMOUS, log with reasoning
- Anything > company's single-action limit: ESCALATE to company's escalation contact

## Tools
- `registry_get_guardrails(company_id)` — get limits before any action
- `stripe_get_project_spend(company_id)` — spend per provider
- `stripe_list_issuing_transactions(company_id)` — card transactions with workflow tags
- `stripe_update_project_spend_cap(company_id, provider, limit)` — guarded by guardrails middleware
- `delegate_task` — parallel audits

## Output Format
```
COMPTROLLER REPORT — [company or PORTFOLIO] — [timestamp]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Per company or across portfolio:]
Total spend: $x | vs last period: [+/-x%]

WORKFLOW P&L
[workflow]: cost $x | revenue attr $x | margin x% [↑↓]

🔴 ACTIONS REQUIRED (escalations)
✅ AUTONOMOUS ACTIONS TAKEN
💡 OPTIMISATION OPPORTUNITIES
```
