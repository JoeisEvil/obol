# Obol Project

Multi-tenant financial OS for AI-native companies. One Obol instance,
multiple companies, one portfolio view.

## Project Layout
- hermes/           Hermes config: SOUL.md, MEMORY.md, skills/
- mcp/ledger-core/  Multi-tenant MCP server (Stripe + Registry)
- dashboard/        Next.js dashboard — portfolio + company views
- scripts/          Setup, seed, demo utilities

## Run Mode
- Default `LEDGER_MODE=mock`: every Stripe tool serves seeded data from
  `~/.ledger/registry.db`. No external keys required. This is the demo path.
- `LEDGER_MODE=live`: Stripe SDK calls real test-mode API for charges /
  subscriptions / issuing. Treasury, stablecoin and project surfaces stay mocked
  (no public Stripe API). Requires `STRIPE_KEY_*` env vars.

## Active MCP Server
- ledger-core: run with `bun mcp/ledger-core/index.ts`
  Exposes: stdio (for Hermes) + HTTP on `MCP_HTTP_PORT` (3001) (for dashboard)

## Skills
- company-registry: add/list/switch/manage companies
- sentinel: revenue monitoring (multi-company aware)
- comptroller: spend governance (multi-company aware)
- treasurer: treasury management (multi-company aware)
- forecaster: scenario planning (multi-company aware)

## Key Commands
- `hermes chat`                      Start Obol CLI
- `bun run dev` (in dashboard/)      Start dashboard on :3000
- `bun mcp/ledger-core/index.ts`     Start MCP server (stdio + HTTP)
- `bun scripts/seed-demo-data.ts`    Seed both demo companies

## Workflow Rules
- ALWAYS pass company_id to Stripe MCP tools — never call without it
- ALWAYS check guardrails before any mutating action
- NEVER mix funds or data between companies
- When user says "add [company name]", trigger company-registry skill
- When user references a company by name, resolve to company_id first
- Default mode (no company specified) = portfolio mode
- Log every autonomous action to registry_log_action immediately
- Dashboard HTTP route: GET /api/company/:id calls MCP tools scoped to that ID

## Demo Flow
1. `bun mcp/ledger-core/index.ts` (Terminal 1)
2. `cd dashboard && bun run dev` (Terminal 2)
3. `hermes chat` (Terminal 3)
4. Open dashboard at localhost:3000 — portfolio view shows both companies
5. Demo sequence: portfolio runway → company switch → Comptroller action → treasury
   See scripts/record-demo.md for full shot list
