# LEDGER Demo Shot List — v2 (Multi-Company)
## Target: 120 seconds maximum.

> Before recording: `bun scripts/seed-demo-data.ts` to reset mock data to a clean state,
> then start the MCP server (`bun mcp/ledger-core/index.ts`) and the dashboard
> (`cd dashboard && bun run dev`).

### SHOT 1 (0:00–0:10) — Hook
Dashboard open. Portfolio view. Both companies visible in sidebar.
Treasury panel shows combined position. Agent status: all four active.
Narration: "This is LEDGER. One agent. Your entire portfolio."

### SHOT 2 (0:10–0:30) — Portfolio question
Split view: dashboard left, CLI right.
Type: "What's our overall runway?"
Show: Forecaster pulling from both companies simultaneously via delegate_task.
Answer: "Portfolio runway is 11 months. LEDGER SaaS hits profitability in 8.
        Unit Alpha is covering $3,200/month of your infrastructure right now."
Narration: "It sees every company at once."

### SHOT 3 (0:30–0:50) — Switch company + action
Dashboard: click "Unit Alpha" in sidebar → Company View loads.
Type: "How is Unit Alpha doing this month?"
Show: Sentinel reporting net P&L +$8,400. Comptroller flagging market-analysis
      workflow at 78% of monthly cap.
Show: LEDGER autonomously raising the cap 15% (within guardrail).
Log entry appears: "Autonomous: raised Unit Alpha market-data-apis cap +15%.
                   Guardrail: within daily limit. Timestamp: [now]"
Narration: "Switch to any company. It acts within that company's rules."

### SHOT 4 (0:50–1:10) — Add a company live
Click "+ ADD COMPANY" in sidebar.
Show modal: enter name "Acme AI", type "Client", choose "Stripe Connect".
Show OAuth link generated.
Narration: "Adding a new company takes 30 seconds."
(Fast-forward or cut to:) New company appears in sidebar as read-only.
Narration: "Read-only for a client. Full control for your own."

### SHOT 5 (1:10–1:30) — Treasury cross-company
Back to portfolio view. Treasury panel.
Show: $45K idle fiat in LEDGER SaaS.
LEDGER escalation: "Stage $45K → USDB at 3.8% APY. Approve? [YES/NO]"
Type YES. Dashboard updates. USDB balance increases.
Narration: "Treasury management that actually executes."

### SHOT 6 (1:30–1:45) — Stack callout
Overlay: Hermes Agent · Nemotron 3 Ultra · NemoClaw · Stripe Treasury + Issuing
         + Projects + Connect · Bridge USDB · DGX Spark
Narration: "Built on Hermes, powered by Nemotron, banking on Stripe."

### SHOT 7 (1:45–2:00) — End card
LEDGER wordmark. One line: "The financial OS for your entire AI portfolio."
