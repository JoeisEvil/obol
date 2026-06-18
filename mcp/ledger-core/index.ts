import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import * as registry from "./registry.js";
import { getProvider } from "./stripe-client.js";
import { evaluate, recordConsumption } from "./budget.js";

const DRY_RUN = process.argv.includes("--dry-run");
const HTTP_ONLY = process.argv.includes("--http-only") || process.env.LEDGER_HTTP_ONLY === "1";
const HTTP_PORT = Number(process.env.MCP_HTTP_PORT ?? 3001);

// ---------- Connect token encryption ----------
function encKey(): Buffer {
  const raw = process.env.LEDGER_ENCRYPT_KEY ?? "ledger_default_dev_key_change_me_!";
  return createHash("sha256").update(raw).digest();
}
function encrypt(plain: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${enc.toString("hex")}`;
}
function decrypt(blob: string): string {
  const [ivHex, dataHex] = blob.split(":");
  const decipher = createDecipheriv("aes-256-cbc", encKey(), Buffer.from(ivHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString(
    "utf8",
  );
}

// ---------- Metrics helpers (mock-mode aggregation) ----------
function computeMetrics(company: registry.Company) {
  const provider = getProvider(company.id);
  const subs = provider.listSubscriptions({ status: "active" });
  const allSubs = provider.listSubscriptions({});
  const issuing = provider.listIssuingTransactions({ days: 30 });
  const projects = provider.getProjectSpend({});
  const treasury = provider.getTreasuryBalance();

  const mrr = subs.reduce((s, x) => s + x.amount, 0);
  const pastDue = allSubs.filter((s) => s.status === "past_due").length;
  const netPnl = issuing.reduce((s, x) => s + x.amount, 0);
  const monthlySpend = projects.reduce((s, x) => s + x.spend, 0);
  const liquid = treasury.reduce((s, b) => s + b.amount, 0);

  const monthlyRevenue = company.type === "trading-agent" ? netPnl : mrr;
  const netBurn = monthlySpend - monthlyRevenue; // positive = burning
  const profitable = netBurn <= 0;
  const runwayBase = profitable ? null : +(liquid / netBurn).toFixed(1);

  return {
    company_id: company.id,
    name: company.name,
    type: company.type,
    mrr: +mrr.toFixed(2),
    net_pnl: +netPnl.toFixed(2),
    headline:
      company.type === "trading-agent"
        ? { label: "P&L", value: +netPnl.toFixed(2), unit: "/mo" }
        : { label: "MRR", value: +mrr.toFixed(2), unit: "" },
    past_due: pastDue,
    monthly_spend: +monthlySpend.toFixed(2),
    monthly_revenue: +monthlyRevenue.toFixed(2),
    net_burn: +netBurn.toFixed(2),
    profitable,
    liquid: +liquid.toFixed(2),
    treasury,
    projects,
    runway_months: runwayBase,
  };
}

function runwayScenarios(burn: number, liquid: number) {
  const base = burn <= 0 ? null : +(liquid / burn).toFixed(1);
  const bear = burn <= 0 ? +(liquid / (Math.abs(liquid) * 0.05 + 100)).toFixed(1) : +(liquid / (burn * 1.6)).toFixed(1);
  const bull = burn <= 0 ? null : +(liquid / (burn * 0.7)).toFixed(1);
  return { base, bear, bull };
}

// ---------- Tool handlers ----------
type Handler = (args: any) => unknown;

const handlers: Record<string, Handler> = {
  // --- Registry tools ---
  registry_add_company: (a) => registry.addCompany(a),

  registry_test_connection: (a) => {
    const key: string = a.stripe_key ?? "";
    const valid = typeof key === "string" && /^sk_(test|live)_/.test(key);
    return {
      valid: valid || (process.env.LEDGER_MODE ?? "mock") === "mock",
      account_id: valid ? `acct_${key.slice(-8)}` : "acct_mock",
      account_name: valid ? "Stripe Account" : "Mock Account (mock mode)",
    };
  },

  registry_generate_connect_link: (a) => {
    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID ?? "ca_mock_client";
    const scopes: string[] = a.scopes ?? ["read_only"];
    const state = randomBytes(8).toString("hex");
    const oauth_url =
      `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}` +
      `&scope=${scopes.includes("read_write") ? "read_write" : "read_only"}` +
      `&state=${state}&redirect_uri=${encodeURIComponent(
        (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") + "/api/companies",
      )}`;
    return { oauth_url, state, company_name: a.company_name };
  },

  registry_complete_connect: (a) => {
    const access_token = encrypt(`mock_connect_token_${a.code ?? randomBytes(6).toString("hex")}`);
    const account_id = `acct_connect_${randomBytes(6).toString("hex")}`;
    if (a.company_id) {
      registry.addCompany({
        id: a.company_id,
        name: a.company_name ?? a.company_id,
        type: a.type ?? "client",
        connection_type: "stripe_connect",
        connect_token: access_token,
        connect_account: account_id,
        permission_level: "read_only",
        status: "read_only",
      });
    }
    return { access_token, account_id };
  },

  registry_list_companies: (a) => registry.listCompanies(a?.status),
  registry_get_company: (a) => registry.getCompany(a.identifier),
  registry_get_guardrails: (a) => registry.getGuardrails(a.company_id),
  registry_update_guardrails: (a) => registry.updateGuardrails(a.company_id, a.field, a.value),
  registry_remove_company: (a) => registry.removeCompany(a.company_id),
  registry_log_action: (a) => registry.logAction(a),
  registry_get_action_log: (a) => registry.getActionLog(a?.company_id, a?.limit ?? 50),

  // --- Stripe read tools (scoped to company_id) ---
  stripe_list_charges: (a) => getProvider(a.company_id).listCharges(a),
  stripe_list_subscriptions: (a) => getProvider(a.company_id).listSubscriptions(a),
  stripe_list_issuing_transactions: (a) => getProvider(a.company_id).listIssuingTransactions(a),
  stripe_get_treasury_balance: (a) => getProvider(a.company_id).getTreasuryBalance(),
  stripe_get_stablecoin_balances: (a) => getProvider(a.company_id).getStablecoinBalances(),
  stripe_get_multicurrency_balances: (a) => getProvider(a.company_id).getMultiCurrencyBalances(),
  stripe_get_project_spend: (a) => getProvider(a.company_id).getProjectSpend(a),

  // --- Stripe mutating tools (guarded by the synchronous cascade) ---
  stripe_update_project_spend_cap: (a) =>
    guardedAction({
      company_id: a.company_id, agent: "comptroller", workflow: a.workflow ?? a.provider,
      kind: "spend", action_type: "model_switch", amount: 0,
      description: `Set ${a.provider} spend cap to $${a.limit}`,
      exec: () => getProvider(a.company_id).updateProjectSpendCap(a),
    }),

  stripe_send_stablecoin_payment: (a) =>
    guardedAction({
      company_id: a.company_id, agent: "treasurer", workflow: a.workflow ?? "treasury",
      kind: "spend", action_type: "pay_vendor", amount: a.amount,
      description: `Send ${a.amount} ${a.currency} to ${a.recipient}`,
      exec: () => getProvider(a.company_id).sendStablecoinPayment(a),
    }),

  stripe_convert_currency: (a) =>
    guardedAction({
      company_id: a.company_id, agent: "treasurer", workflow: a.workflow ?? "treasury",
      kind: "spend", action_type: "rebalance", amount: a.amount,
      description: `Convert ${a.amount} ${a.from} → ${a.to}`,
      exec: () => getProvider(a.company_id).convertCurrency(a),
    }),

  // --- Aggregation tools (for dashboard) ---
  portfolio_summary: () => {
    const { companies } = registry.listCompanies("active");
    const metrics = companies.map(computeMetrics);
    const totalLiquid = metrics.reduce((s, m) => s + m.liquid, 0);
    const totalBurn = metrics.reduce((s, m) => s + m.net_burn, 0);
    const totalMrr = metrics.reduce((s, m) => s + m.mrr, 0);
    const totalPnl = metrics.reduce((s, m) => s + m.net_pnl, 0);
    const scenarios = runwayScenarios(totalBurn, totalLiquid);
    const stablecoin = metrics.flatMap((m) =>
      m.treasury.filter((b) => b.kind === "usdc" || b.kind === "usdb"),
    );
    const stablecoinYield = stablecoin.reduce((s, b) => s + (b.amount * b.apy) / 100, 0);
    return {
      companies: metrics,
      total_companies: companies.length,
      portfolio_mrr: +totalMrr.toFixed(2),
      portfolio_pnl: +totalPnl.toFixed(2),
      portfolio_liquid: +totalLiquid.toFixed(2),
      portfolio_net_burn: +totalBurn.toFixed(2),
      runway: scenarios,
      stablecoin_yield_annual: +stablecoinYield.toFixed(2),
    };
  },

  company_overview: (a) => {
    const company = registry.getCompany(a.company_id ?? a.identifier);
    if (!company) throw new Error(`Unknown company: ${a.company_id ?? a.identifier}`);
    const m = computeMetrics(company);
    const provider = getProvider(company.id);
    const issuing = provider.listIssuingTransactions({ days: 30 });
    const tokenMap = aggregateTokenMap(m.projects, issuing);
    const scenarios = runwayScenarios(m.net_burn, m.liquid);
    const guardrails = registry.getGuardrails(company.id);
    const actionLog = registry.getActionLog(company.id, 15).entries;
    return {
      company,
      guardrails,
      metrics: m,
      runway: scenarios,
      token_cost_map: tokenMap,
      action_log: actionLog,
    };
  },

  agent_status: () => {
    const last = registry.getActionLog(undefined, 1).entries[0] ?? null;
    const agents = ["sentinel", "comptroller", "treasurer", "forecaster"].map((name) => ({
      name,
      status: "active",
      mode: DRY_RUN ? "dry-run" : process.env.LEDGER_MODE ?? "mock",
    }));
    return { agents, last_action: last };
  },

  // --- Budget hierarchy tools ---
  registry_set_company_budget: (a) => registry.setCompanyBudget(a.company_id, a),
  registry_set_agent_budget: (a) => registry.setAgentBudget(a.company_id, a.agent, a),
  registry_set_workflow_budget: (a) => registry.setWorkflowBudget(a.company_id, a.workflow, a),
  registry_set_process_limit: (a) => registry.setProcessLimit(a.company_id, a.workflow, a),
  registry_get_budget_tree: (a) => registry.getBudgetTree(a.company_id),
  registry_evaluate: (a) =>
    evaluate({
      company_id: a.company_id, agent: a.agent, workflow: a.workflow,
      kind: a.kind, amount: a.amount, model: a.model, action_type: a.action_type,
    }),
  registry_record_consumption: (a) =>
    recordConsumption({
      company_id: a.company_id, agent: a.agent, workflow: a.workflow,
      kind: a.kind, amount: a.amount, model: a.model, run_id: a.run_id,
    }),

  // --- Dashboard aggregations ---
  budget_view: (a) => {
    const scope: string = a?.scope ?? "portfolio";
    const breach = detectBreach();
    if (scope === "portfolio") {
      const { companies } = registry.listCompanies("active");
      const trees = companies.map((c) => registry.getBudgetTree(c.id)).filter(Boolean);
      const compute_used = trees.reduce((s, t) => s + (t!.totals.compute_used ?? 0), 0);
      const compute_cap = trees.reduce((s, t) => s + (t!.totals.compute_cap ?? 0), 0);
      const spend_used = trees.reduce((s, t) => s + (t!.totals.spend_used ?? 0), 0);
      const spend_cap = trees.reduce((s, t) => s + (t!.totals.spend_cap ?? 0), 0);
      return { scope: "portfolio", trees, totals: { compute_used, compute_cap, spend_used, spend_cap }, breach };
    }
    const tree = registry.getBudgetTree(scope);
    if (!tree) throw new Error(`Unknown company: ${scope}`);
    return { scope, trees: [tree], totals: tree.totals, breach: breach && breach.company_id === tree.company.id ? breach : breach };
  },

  growth_view: (a) => {
    const scope: string = a?.scope ?? "portfolio";
    if (scope === "portfolio") {
      const { companies } = registry.listCompanies("active");
      const byMonth: Record<string, { month: string; mrr: number; pnl: number; treasury: number; token_cost: number; margin_w: number; rev: number }> = {};
      for (const c of companies) {
        for (const m of growthForCompany(c.id)) {
          const row = (byMonth[m.month] ??= { month: m.month, mrr: 0, pnl: 0, treasury: 0, token_cost: 0, margin_w: 0, rev: 0 });
          row.mrr += m.mrr;
          row.pnl += m.pnl;
          row.treasury += m.treasury;
          row.token_cost += m.token_cost;
          const rev = m.mrr + m.pnl;
          row.margin_w += m.margin * rev;
          row.rev += rev;
        }
      }
      const months = Object.values(byMonth)
        .sort((x, y) => x.month.localeCompare(y.month))
        .map((r) => ({
          month: r.month,
          mrr: +r.mrr.toFixed(2),
          pnl: +r.pnl.toFixed(2),
          treasury: +r.treasury.toFixed(2),
          token_cost: +r.token_cost.toFixed(2),
          margin: r.rev ? +(r.margin_w / r.rev).toFixed(3) : 0,
        }));
      const perCompany = companies.map((c) => ({ company_id: c.id, name: c.name, type: c.type, months: growthForCompany(c.id) }));
      return { scope: "portfolio", months, per_company: perCompany };
    }
    const company = registry.getCompany(scope);
    if (!company) throw new Error(`Unknown company: ${scope}`);
    return { scope, months: growthForCompany(company.id), per_company: [{ company_id: company.id, name: company.name, type: company.type, months: growthForCompany(company.id) }] };
  },

  budget_approve_downgrade: (a) => {
    const wf = registry.getWorkflowBudget(a.company_id, a.workflow);
    const log = registry.logAction({
      company_id: a.company_id,
      agent: "comptroller",
      workflow: a.workflow,
      action_type: "model_switch",
      description: `Downgraded ${a.workflow} ${a.from_model ?? "ultra"} → ${a.to_model ?? "nemotron-3-mini"} (saves ~$${a.est_savings ?? 0}/mo)`,
      amount_usd: null,
      kind: "control",
      outcome: "executed",
      guardrail: "within-limits",
      level_hit: "workflow",
    });
    return { approved: true, log_id: log.log_id, workflow: a.workflow, on_breach: wf?.on_breach ?? "downgrade_model" };
  },
};

function aggregateTokenMap(
  projects: { project: string; provider: string; spend: number; cap: number | null }[],
  issuing: { workflow: string | null; amount: number; type: string }[],
) {
  const byWorkflow: Record<string, { workflow: string; cost: number }> = {};
  for (const t of issuing) {
    if (t.type !== "debit") continue;
    const w = t.workflow ?? "untagged";
    byWorkflow[w] ??= { workflow: w, cost: 0 };
    byWorkflow[w].cost += Math.abs(t.amount);
  }
  const workflows = Object.values(byWorkflow).map((w) => ({
    ...w,
    cost: +w.cost.toFixed(2),
  }));
  return {
    workflows: workflows.sort((a, b) => b.cost - a.cost),
    projects: projects.map((p) => ({
      ...p,
      utilization: p.cap ? +((p.spend / p.cap) * 100).toFixed(0) : null,
    })),
  };
}

const REMEDY_OUTCOME: Record<string, string> = {
  throttle: "throttled",
  escalate: "escalated",
  downgrade_model: "escalated",
  pause: "rejected",
};

function guardedAction(p: {
  company_id: string;
  agent: string;
  workflow: string;
  kind: "spend" | "compute";
  action_type: string;
  amount: number;
  description: string;
  model?: string;
  exec: () => unknown;
}) {
  const check = evaluate({
    company_id: p.company_id,
    agent: p.agent,
    workflow: p.workflow,
    kind: p.kind,
    amount: p.amount,
    model: p.model,
    action_type: p.action_type,
  });
  if (!check.allowed) {
    registry.logAction({
      company_id: p.company_id,
      agent: p.agent,
      workflow: p.workflow,
      action_type: p.action_type,
      description: p.description,
      amount_usd: p.amount || null,
      kind: p.kind,
      outcome: REMEDY_OUTCOME[check.remedy ?? "escalate"] ?? "rejected",
      guardrail: check.reason ?? "blocked",
      level_hit: check.level_hit ?? null,
    });
    return { executed: false, ...check };
  }
  if (DRY_RUN) {
    registry.logAction({
      company_id: p.company_id, agent: p.agent, workflow: p.workflow, action_type: p.action_type,
      description: p.description, amount_usd: p.amount || null, kind: p.kind,
      outcome: "executed", guardrail: "dry-run (no real mutation)", level_hit: null,
    });
    return { executed: true, dry_run: true, description: p.description };
  }
  const result = p.exec();
  if (p.amount > 0)
    recordConsumption({
      company_id: p.company_id, agent: p.agent, workflow: p.workflow, kind: p.kind,
      amount: p.amount, model: p.model,
    });
  registry.logAction({
    company_id: p.company_id, agent: p.agent, workflow: p.workflow, action_type: p.action_type,
    description: p.description, amount_usd: p.amount || null, kind: p.kind,
    outcome: "executed", guardrail: "within-limits", level_hit: null,
  });
  return { executed: true, ...((result as object) ?? {}) };
}

// ---------- Budget aggregations for the dashboard ----------
function detectBreach() {
  // Scan all active companies for the workflow most over an alert-worthy threshold,
  // and produce a Comptroller downgrade proposal (drives the Budget breach alert).
  const { companies } = registry.listCompanies("active");
  let worst: { company: registry.Company; wf: registry.WorkflowBudget; used: number; pct: number } | null = null;
  for (const c of companies) {
    for (const wf of registry.getWorkflowBudgets(c.id)) {
      if (wf.compute_monthly_cap == null || wf.compute_monthly_cap === 0) continue;
      const used = registry.windowConsumption(c.id, { workflow: wf.workflow, kind: "compute", window: "month" });
      const p = (used / wf.compute_monthly_cap) * 100;
      if (p >= 85 && (!worst || p > worst.pct)) worst = { company: c, wf, used, pct: Math.round(p) };
    }
  }
  if (!worst) return null;
  const est = Math.round(worst.used * 0.38);
  return {
    company_id: worst.company.id,
    company_name: worst.company.name,
    workflow: worst.wf.workflow,
    pct: worst.pct,
    cap: worst.wf.compute_monthly_cap,
    used: +worst.used.toFixed(2),
    from_model: "nemotron-3-ultra",
    to_model: "nemotron-3-mini",
    est_savings: est,
    on_breach: worst.wf.on_breach,
  };
}

function growthForCompany(company_id: string) {
  return registry.getMonthlySeries(company_id);
}

// ---------- MCP (stdio) registration ----------
const toolSchemas: Record<string, z.ZodRawShape> = {
  registry_add_company: {
    name: z.string(),
    slug: z.string().optional(),
    type: z.string(),
    connection_type: z.string(),
    stripe_key: z.string().optional(),
    permission_level: z.string().optional(),
    autonomous_limit_single: z.number().optional(),
    autonomous_limit_daily: z.number().optional(),
    escalation_contact: z.string().optional(),
    notes: z.string().optional(),
  },
  registry_test_connection: { stripe_key: z.string() },
  registry_generate_connect_link: { company_name: z.string(), scopes: z.array(z.string()).optional() },
  registry_complete_connect: { code: z.string(), company_id: z.string().optional() },
  registry_list_companies: { status: z.string().optional() },
  registry_get_company: { identifier: z.string() },
  registry_get_guardrails: { company_id: z.string() },
  registry_update_guardrails: { company_id: z.string(), field: z.string(), value: z.any() },
  registry_remove_company: { company_id: z.string() },
  registry_log_action: {
    company_id: z.string(),
    agent: z.string(),
    workflow: z.string().optional(),
    action_type: z.string(),
    description: z.string(),
    amount_usd: z.number().optional(),
    kind: z.string().optional(),
    outcome: z.string(),
    guardrail: z.string().optional(),
    level_hit: z.string().optional(),
  },
  registry_get_action_log: { company_id: z.string().optional(), limit: z.number().optional() },
  stripe_list_charges: {
    company_id: z.string(),
    limit: z.number().optional(),
    days: z.number().optional(),
    status: z.string().optional(),
  },
  stripe_list_subscriptions: {
    company_id: z.string(),
    status: z.string().optional(),
    limit: z.number().optional(),
  },
  stripe_list_issuing_transactions: {
    company_id: z.string(),
    limit: z.number().optional(),
    days: z.number().optional(),
  },
  stripe_get_treasury_balance: { company_id: z.string() },
  stripe_get_stablecoin_balances: { company_id: z.string() },
  stripe_get_multicurrency_balances: { company_id: z.string() },
  stripe_get_project_spend: { company_id: z.string(), project_id: z.string().optional() },
  stripe_update_project_spend_cap: {
    company_id: z.string(),
    provider: z.string(),
    limit: z.number(),
  },
  stripe_send_stablecoin_payment: {
    company_id: z.string(),
    amount: z.number(),
    currency: z.string(),
    recipient: z.string(),
    memo: z.string().optional(),
  },
  stripe_convert_currency: {
    company_id: z.string(),
    amount: z.number(),
    from: z.string(),
    to: z.string(),
  },
  portfolio_summary: {},
  company_overview: { company_id: z.string() },
  agent_status: {},
  registry_set_company_budget: {
    company_id: z.string(),
    permission_level: z.string().optional(),
    spend_monthly_cap: z.number().nullable().optional(),
    spend_daily_cap: z.number().nullable().optional(),
    spend_single_cap: z.number().nullable().optional(),
    compute_monthly_cap: z.number().nullable().optional(),
    compute_daily_cap: z.number().nullable().optional(),
    allowed_actions: z.array(z.string()).optional(),
    escalation_contact: z.string().optional(),
    hard_stop: z.number().optional(),
  },
  registry_set_agent_budget: {
    company_id: z.string(),
    agent: z.string(),
    enabled: z.number().optional(),
    spend_authority: z.string().optional(),
    spend_single_cap: z.number().optional(),
    spend_daily_cap: z.number().optional(),
    allowed_actions: z.array(z.string()).optional(),
    compute_monthly_cap: z.number().nullable().optional(),
    compute_daily_cap: z.number().nullable().optional(),
    model_ceiling: z.string().optional(),
  },
  registry_set_workflow_budget: {
    company_id: z.string(),
    workflow: z.string(),
    owner_agent: z.string().optional(),
    compute_monthly_cap: z.number().nullable().optional(),
    spend_monthly_cap: z.number().optional(),
    margin_floor: z.number().optional(),
    on_breach: z.string().optional(),
  },
  registry_set_process_limit: {
    company_id: z.string(),
    workflow: z.string(),
    per_run_compute_cap: z.number().optional(),
    per_action_spend_cap: z.number().optional(),
    max_calls_per_run: z.number().optional(),
    requires_approval_over: z.number().nullable().optional(),
  },
  registry_get_budget_tree: { company_id: z.string() },
  registry_evaluate: {
    company_id: z.string(),
    agent: z.string(),
    workflow: z.string(),
    kind: z.enum(["spend", "compute"]),
    amount: z.number(),
    model: z.string().optional(),
    action_type: z.string().optional(),
  },
  registry_record_consumption: {
    company_id: z.string(),
    agent: z.string().optional(),
    workflow: z.string().optional(),
    kind: z.enum(["spend", "compute"]),
    amount: z.number(),
    model: z.string().optional(),
    run_id: z.string().optional(),
  },
  budget_view: { scope: z.string().optional() },
  growth_view: { scope: z.string().optional() },
  budget_approve_downgrade: {
    company_id: z.string(),
    workflow: z.string(),
    from_model: z.string().optional(),
    to_model: z.string().optional(),
    est_savings: z.number().optional(),
  },
};

function ok(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}
function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true };
}

async function startStdio() {
  const server = new McpServer({ name: "ledger-core", version: "1.0.0" });
  for (const [name, fn] of Object.entries(handlers)) {
    const shape = toolSchemas[name] ?? {};
    server.tool(name, shape, async (args: unknown) => {
      try {
        return ok(fn(args ?? {}));
      } catch (e) {
        return fail(e);
      }
    });
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[ledger-core] stdio MCP up — mode=${process.env.LEDGER_MODE ?? "mock"}${DRY_RUN ? " (dry-run)" : ""}`,
  );
}

// ---------- HTTP wrapper (for dashboard) ----------
function startHttp() {
  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, mode: process.env.LEDGER_MODE ?? "mock", dry_run: DRY_RUN }));
      return;
    }
    const match = url.pathname.match(/^\/tool\/([a-z_]+)$/);
    if (req.method === "POST" && match) {
      const name = match[1];
      const fn = handlers[name];
      if (!fn) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Unknown tool: ${name}` }));
        return;
      }
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const args = body ? JSON.parse(body) : {};
          const result = fn(args);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: msg }));
        }
      });
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });
  server.listen(HTTP_PORT, () => {
    console.error(`[ledger-core] HTTP wrapper on :${HTTP_PORT} (POST /tool/:name)`);
  });
}

registry.db(); // ensure schema exists
startHttp();
if (HTTP_ONLY) {
  console.error("[ledger-core] HTTP-only mode (stdio disabled) — server stays up for dashboard");
} else
  startStdio().catch((e) => {
  console.error("[ledger-core] fatal:", e);
  process.exit(1);
});
