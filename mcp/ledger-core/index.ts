import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import * as registry from "./registry.js";
import { getProvider } from "./stripe-client.js";
import { checkGuardrails } from "./guardrails.js";

const DRY_RUN = process.argv.includes("--dry-run");
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

  // --- Stripe mutating tools (guarded) ---
  stripe_update_project_spend_cap: (a) =>
    guardedAction(a.company_id, "spend", undefined, "comptroller",
      `Set ${a.provider} spend cap to $${a.limit}`,
      () => getProvider(a.company_id).updateProjectSpendCap(a)),

  stripe_send_stablecoin_payment: (a) =>
    guardedAction(a.company_id, "spend", a.amount, "treasurer",
      `Send ${a.amount} ${a.currency} to ${a.recipient}`,
      () => getProvider(a.company_id).sendStablecoinPayment(a)),

  stripe_convert_currency: (a) =>
    guardedAction(a.company_id, "rebalance", a.amount, "treasurer",
      `Convert ${a.amount} ${a.from} → ${a.to}`,
      () => getProvider(a.company_id).convertCurrency(a)),

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

function guardedAction(
  company_id: string,
  action_type: string,
  amount: number | undefined,
  agent: string,
  description: string,
  exec: () => unknown,
) {
  const check = checkGuardrails(company_id, action_type, amount);
  if (!check.allowed) {
    registry.logAction({
      company_id,
      agent,
      action_type,
      description,
      amount_usd: amount ?? null,
      outcome: check.requires_escalation ? "escalated" : "rejected",
      guardrail: check.reason ?? "blocked",
    });
    return { executed: false, ...check };
  }
  if (DRY_RUN) {
    registry.logAction({
      company_id,
      agent,
      action_type,
      description,
      amount_usd: amount ?? null,
      outcome: "executed",
      guardrail: "dry-run (no real mutation)",
    });
    return { executed: true, dry_run: true, description };
  }
  const result = exec();
  registry.logAction({
    company_id,
    agent,
    action_type,
    description,
    amount_usd: amount ?? null,
    outcome: "executed",
    guardrail: "within-limits",
  });
  return { executed: true, ...((result as object) ?? {}) };
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
    action_type: z.string(),
    description: z.string(),
    amount_usd: z.number().optional(),
    outcome: z.string(),
    guardrail: z.string().optional(),
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
startStdio().catch((e) => {
  console.error("[ledger-core] fatal:", e);
  process.exit(1);
});
