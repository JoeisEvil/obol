# LEDGER

**The financial operating system for your entire AI portfolio.**

One LEDGER instance manages a *portfolio* of AI-native companies — your SaaS, your
trading agent, a client's agency — each with its own Stripe connection, guardrails,
and permission level. Four sub-agents (Sentinel, Comptroller, Treasurer, Forecaster)
operate per-company and portfolio-wide.

> Hermes Agent Hackathon submission · June 2026
> Stack: Hermes Agent (Nous Research) · Nemotron 3 Ultra (NVIDIA) · NemoClaw
> Stripe Treasury + Issuing + Projects + Connect · Bridge USDB · DGX Spark

---

## Mock-first by default

LEDGER runs **end-to-end with zero external keys.** In the default `LEDGER_MODE=mock`,
every Stripe MCP tool serves realistic seeded data from a local SQLite database
(`~/.ledger/registry.db`). Drop in real keys and flip `LEDGER_MODE=live` to exercise
the real Stripe SDK behind the exact same interface.

What needs keys (all optional, documented, not required for the demo):

| Capability | Needs | Without it |
| --- | --- | --- |
| Hermes live reasoning | `NVIDIA_API_KEY` | Skills install + agent loads; model calls need the key |
| Real Stripe reads/writes | `LEDGER_MODE=live` + `STRIPE_KEY_*` | Mock data covers the whole demo |
| Stripe Connect / Treasury / stablecoin | no public test API | Mocked by design (deterministic stubs) |

---

## Prerequisites
- Node 20+, [Bun](https://bun.sh) 1.3+
- (optional) `hermes` CLI for the agent side
- (optional) Stripe test keys + NVIDIA API key for live mode

## 1. Install dependencies
```bash
cd mcp/ledger-core && bun install && cd ../..
cd dashboard && bun install && cd ..
```

## 2. Configure environment
```bash
cp .env.example .env
# Leave LEDGER_MODE=mock for the no-keys demo.
# For live mode, fill STRIPE_KEY_LEDGER_SAAS, STRIPE_KEY_UNIT_ALPHA, NVIDIA_API_KEY,
# LEDGER_ENCRYPT_KEY (any 32-char string) and set LEDGER_MODE=live.
```

## 3. Seed demo data
```bash
bun scripts/seed-demo-data.ts
# Creates ~/.ledger/registry.db, seeds two companies' mock data, registers both.
```

## 4. Launch (2 terminals for the dashboard demo)
```bash
# T1: MCP server (stdio for Hermes + HTTP :3001 for dashboard)
bun mcp/ledger-core/index.ts

# T2: Dashboard
cd dashboard && bun run dev   # → http://localhost:3000
```

## 5. (Optional) Hermes agent
```bash
chmod +x scripts/install-skills.sh && ./scripts/install-skills.sh
# follow printed steps to register the MCP server in ~/.hermes/config.yaml
hermes chat   # "list companies" → 2 companies ; "run portfolio check"
```

## Verify
```bash
# MCP HTTP smoke test (server running in another terminal)
curl -s -XPOST localhost:3001/tool/registry_list_companies | jq
curl -s -XPOST localhost:3001/tool/portfolio_summary | jq
```
Dashboard: open http://localhost:3000 → portfolio view with both companies, runway
gauge, treasury, P&L bars. Click **Unit Alpha** → company deep view with token-cost
map + action log. **+ ADD COMPANY** opens the onboarding modal.

## Project layout
See [AGENTS.md](./AGENTS.md). Demo shot list in [scripts/record-demo.md](./scripts/record-demo.md).
