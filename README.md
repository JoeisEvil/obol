<div align="center">

<img src="./brand/obol-mark-full.svg" width="96" alt="Obol" />

# Obol

**The financial operating system for AI-native companies — run by an autonomous agent.**

*One agent. Your whole portfolio. It even catches a runaway inference bill before it lands.*

Hermes · Nemotron 3 Ultra · NemoClaw · Stripe Treasury + Issuing + Projects + Connect

<sub>Hermes Agent Accelerated Business Hackathon · presented by NVIDIA, Stripe & Nous Research</sub>

</div>

---

## What is Obol?

Finance tooling was built for a world where headcount is the biggest cost and revenue is a predictable subscription. AI-native companies break that: their largest variable cost is **inference that swings wildly by workflow**, their revenue is usage-based and often stablecoin-denominated, and their treasury spans fiat and crypto rails.

Obol is built for that shape. Connect a company's Stripe account and Obol runs four specialist sub-agents, continuously:

| Agent | Role |
|---|---|
| **Sentinel** | Watches all inbound revenue. Surfaces pre-churn signals, pricing outliers, recognition gaps — ranked by dollar impact. |
| **Comptroller** | Governs all outbound spend. Maps every token of inference cost to a workflow and its revenue, and enforces budgets *before* the bill lands. |
| **Treasurer** | Manages a multi-currency, multi-rail treasury (fiat · USDC · USDB). Optimises yield, pays on the cheapest rail. |
| **Forecaster** | Holds the live financial model. Answers *"are we going to run out of money?"* with a number, the reasoning, and one recommended action. |

Obol is **multi-tenant**: one instance manages a portfolio — your SaaS, your autonomous trading agent, a client's AI company — each a first-class account with its own Stripe connection, budget tree, and permission level.

---

## The idea that makes it trustworthy

An agent that *watches* money is a dashboard. An agent you'd *trust* with money needs real controls. Obol enforces a **four-level budget cascade**:

```
COMPANY  envelope            (outermost bound)
  └─ AGENT   allocation      (Sentinel / Comptroller / Treasurer / Forecaster)
       └─ WORKFLOW budget    (e.g. market-analysis, support-agent)
            └─ PROCESS limit  (per-run / per-action — the synchronous tripwire)
```

Every level is bounded by its parent, and enforcement is **synchronous** — the spend or inference call does not fire unless it passes the check. Two control planes are kept separate:

- **Spend authority** — *may this agent move money?* (`none` / `read_only` / `propose` / `execute` + dollar caps + vendor allowlist)
- **Compute budget** — *may this agent burn this inference?* (caps + model ceiling + per-run + session limits)

So an agent can be all-seeing yet unable to move a cent, while another moves money only within a tight ceiling on a capped model. This is the failure mode Obol prevents: *Uber burned its entire 2026 AI budget four months into the year.* Obol catches that **before** the overage, not after the invoice.

---

## Stack

| Layer | Technology |
|---|---|
| Agent runtime | Nous **Hermes** — 1 profile, 5 skills, persistent memory |
| Reasoning | NVIDIA **Nemotron 3 Ultra**, per-agent model ceilings |
| Secure execution | **NemoClaw** sandbox — credentials never leave the runtime |
| Treasury & cash | **Stripe Treasury** (agent-ready accounts + MCP) |
| Autonomous spend | **Stripe Issuing for Agents** (guardrailed) |
| Compute caps | **Stripe Projects** (per-provider) |
| Client onboarding | **Stripe Connect** (OAuth — no key sharing) |
| Stablecoin rails | USDC / **USDB** via Bridge |
| Always-on host | NVIDIA **DGX Spark** |

---

## Repository layout

```
obol/
├── hermes/                 Agent config — SOUL.md, MEMORY.md, skills/
│   └── skills/             sentinel · comptroller · treasurer · forecaster · company-registry
├── mcp/ledger-core/        Multi-tenant MCP server: Stripe + Company Registry + cascade enforcement
├── dashboard/              Next.js "living ledger" UI — portfolio, company, budget & growth views
├── scripts/                seed-demo-data · install-skills
└── brand/                  Obol mark (full / flat / mono / reversed), favicons
```

---

## Quick start

> **Prerequisites:** Node 20+, the `hermes` CLI, two Stripe test-mode keys (one per demo company), an NVIDIA API key (Nemotron 3 Ultra via Nous Portal or NIM).

```bash
# 1 · install
cd mcp/ledger-core && npm install && cd ../..
cd dashboard && npm install && cd ..

# 2 · configure
cp .env.example .env
#   fill: STRIPE_KEY_OBOL_SAAS, STRIPE_KEY_UNIT_ALPHA,
#         NVIDIA_API_KEY, OBOL_ENCRYPT_KEY (any 32-char string)

# 3 · install Hermes skills + config
chmod +x scripts/install-skills.sh && ./scripts/install-skills.sh
hermes config set model nvidia:nemotron-3-ultra
hermes config edit          # add the ledger-core MCP block (see install output)

# 4 · seed two demo companies into Stripe test mode + the registry
npx tsx scripts/seed-demo-data.ts
```

### Run it (3 terminals)

```bash
# T1 — MCP server (stdio for Hermes + HTTP :3001 for the dashboard)
tsx mcp/ledger-core/index.ts

# T2 — dashboard
cd dashboard && npm run dev          # → http://localhost:3000

# T3 — Obol
hermes chat
```

### Verify

```text
hermes chat ▸ list companies        → shows 2 companies
hermes chat ▸ run portfolio check   → all 4 sub-agents report in < 90s
dashboard   ▸ localhost:3000        → portfolio view, both companies populated
```

---

## Try these

```text
"What's our overall runway?"                  → Forecaster, portfolio-wide
"How is Unit Alpha doing this month?"          → switches context, deep scan
"Where are we leaking money?"                  → Sentinel + Comptroller
"Add company: Acme AI"                         → onboarding via Stripe Connect
"Which workflow has the worst inference ROI?"  → cross-company Comptroller view
```

---

## How it demos

The interface is a **living ledger** — a modern double-entry account book: ruled columns, lettered index tabs per company, debit/credit workflow rows, and a running-balance column that *pens itself in* as the agent acts.

The signature moment is **prevention made visible**: a workflow's compute meter climbs toward its cap and stops *before* it crosses, while the Comptroller proposes a model downgrade that holds quality and saves real money. The other beat: onboarding a brand-new AI company **live, in under a minute.**

---

## Status

Hackathon build. Runs end-to-end in **Stripe test mode** — real Stripe data, real autonomous actions (staged transfers, cap adjustments, model downgrades), all within configured guardrails. Architecture is production-shaped: synchronous enforcement, append-only audit log, per-company isolation of data and funds. Not yet hardened for live funds.

---

<div align="center">
<sub><b>Obol</b> — the financial OS for your AI-native portfolio · June 2026</sub>
</div>
