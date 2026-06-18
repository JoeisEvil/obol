---
name: company-registry
description: >
  Add, list, switch, update, or remove companies in LEDGER's portfolio. Handle
  Stripe Connect OAuth for client companies. Set per-company guardrails and
  permission levels. This skill is the front door for onboarding any new AI
  company, autonomous agent business, or client into LEDGER's management.
  Trigger on: "add company", "register", "connect Stripe", "list companies",
  "switch to [company]", "remove company", "set permission", "update guardrails",
  "what companies do I have", "onboard".
version: 1.0.0
platforms: [cli, telegram, discord]
requires_mcp: ledger-core
---

# Company Registry — Onboarding and Management

## Adding a Company (Direct Key)

Use when: you own the company and have direct Stripe API access.

1. Ask for: company name, type (saas/trading-agent/agency), Stripe secret key
2. Validate: call `registry_test_connection(stripe_key)` — must return valid account
3. Ask for permission level: full / read_write / read_only
4. Ask for autonomous spend limits (or use defaults: $500/action, $2,000/day)
5. Ask for escalation contact (Telegram handle or email)
6. Call `registry_add_company(name, type, connection_type="direct_key", ...)`
7. Immediately run a Sentinel scan on the new company to establish baseline
8. Confirm: "Company [name] added. Baseline scan complete. [summary of what Sentinel found]"

## Adding a Company (Stripe Connect)

Use when: adding a client company that doesn't want to share their Stripe key.
This gives LEDGER read access (or read+write if they authorise) via OAuth.

1. Call `registry_generate_connect_link(company_name, scopes)` 
   - scopes: ["read_only"] for advisory clients, ["read_write"] for managed clients
2. Send the OAuth link to the company owner
3. When they authorise, Stripe redirects with a code — call `registry_complete_connect(code)`
4. Store the access token and connected account ID in the registry
5. Default permission: read_only (require explicit upgrade to read_write)
6. Confirm connection and run baseline Sentinel scan

## Listing Companies

Call `registry_list_companies()` and format as:

```
LEDGER PORTFOLIO — [n] companies

comp_01 | LEDGER SaaS        | saas           | full      | MRR $12,400
comp_02 | Unit Alpha          | trading-agent  | full      | P&L +$8,400/mo
[comp_03 | Acme AI            | client         | read_only | MRR $34,200]
```

## Switching Company Context

When the user references a company by name or slug:
1. Call `registry_get_company(name_or_slug)` to get company_id
2. Set active company context for the session
3. All subsequent MCP tool calls pass this company_id until explicitly changed
4. Confirm: "Switched to [Company Name]. [one-line status summary]"

## Updating Guardrails

Call `registry_update_guardrails(company_id, field, value)`.
Confirm change and log to action_log.

## Removing a Company

1. Confirm with user: "This will remove [Company Name] from LEDGER. Stripe connection will be revoked. Confirm?"
2. If confirmed: call `registry_remove_company(company_id)`
3. Archive action_log entries (do not delete — audit trail)

## Tools to Use
- `registry_add_company` — add new company to registry
- `registry_test_connection` — validate Stripe key before storing
- `registry_generate_connect_link` — OAuth link for Stripe Connect
- `registry_complete_connect` — finalise OAuth flow
- `registry_list_companies` — list all registered companies
- `registry_get_company` — resolve name/slug to company_id
- `registry_update_guardrails` — update per-company limits
- `registry_remove_company` — remove and revoke connection
