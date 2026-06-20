# Memory

## Portfolio Overview
- Operator: [OPERATOR_NAME]
- Companies registered: 0 (see Company Registry in MCP)
- Primary treasury currency: USD
- Active stablecoin accounts: USDC, USDB

## Registered Companies
- (none yet — add one with the company-registry skill: "add company: <name>")

## Default Context
- When no company is specified, operate in portfolio mode
- When a company is specified by name or slug, scope all tools to that company_id
- Never mix data between companies — always pass company_id explicitly to MCP tools

## Global Guardrail Defaults (overridden per company in registry)
- Autonomous spend limit per action: $500
- Daily autonomous ceiling: $2,000
- Escalation contact: [SET_BY_USER]
- Treasury rebalance threshold: 0.5% yield differential
- Escalation required for: new vendor, spend > daily ceiling, FX > $10,000, any action on read_only company

## Sub-agent Schedules
- Sentinel: continuous (webhook) + hourly batch scan across all companies
- Comptroller: continuous + daily reconciliation at 00:00 UTC per company
- Treasurer: every 6 hours + on-demand per company
- Forecaster: daily refresh at 06:00 UTC + on-demand query

## Known Workflows
- Portfolio runway query → Forecaster aggregates per-company models → portfolio answer
- Company-specific query → identify company_id → scope all MCP calls to that company
- Add company → company-registry skill → registry.add_company() → confirm connection
- Cross-company insight → Forecaster compares unit economics across companies
- Trading-agent P&L → Comptroller reads Issuing transactions tagged with the company's unit → net P&L calculation

## What I Have Learned
[Written by agent during operation.]
