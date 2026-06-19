// Idempotent demo seed. In mock mode this populates the SQLite mock tables that
// MockProvider reads — no Stripe calls. Run: `bun scripts/seed-demo-data.ts`
import {
  db,
  addCompany,
  setCompanyBudget,
  setAgentBudget,
  setWorkflowBudget,
  setProcessLimit,
} from "../mcp/ledger-core/registry.ts";

const d = db();

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString();
}

function clearCompany(companyId: string) {
  for (const t of [
    "mock_charges",
    "mock_subscriptions",
    "mock_issuing_txns",
    "mock_balances",
    "mock_project_spend",
    "mock_monthly",
    "consumption",
    "company_budget",
    "agent_budget",
    "workflow_budget",
    "process_limit",
  ]) {
    d.prepare(`DELETE FROM ${t} WHERE company_id = ?`).run(companyId);
  }
}

let consN = 0;
const stmtCons = d.prepare(
  `INSERT INTO consumption (id, company_id, agent, workflow, kind, amount_usd, model, ts, run_id)
   VALUES ($id,$company_id,$agent,$workflow,$kind,$amount,$model,$ts,$run_id)`,
);
function insCons(p: {
  company_id: string;
  agent?: string | null;
  workflow?: string | null;
  kind: "spend" | "compute";
  amount: number;
  model?: string | null;
  daysAgo?: number;
  run_id?: string | null;
}) {
  consN++;
  stmtCons.run({
    $id: `cons_${String(consN).padStart(6, "0")}`,
    $company_id: p.company_id,
    $agent: p.agent ?? null,
    $workflow: p.workflow ?? null,
    $kind: p.kind,
    $amount: p.amount,
    $model: p.model ?? null,
    $ts: daysAgo(p.daysAgo ?? 0),
    $run_id: p.run_id ?? null,
  });
}

const stmtMonthly = d.prepare(
  `INSERT INTO mock_monthly (company_id, month, mrr, pnl, treasury, token_cost, margin)
   VALUES ($company_id,$month,$mrr,$pnl,$treasury,$token_cost,$margin)`,
);
function insMonthly(company_id: string, rows: { mrr: number; pnl: number; treasury: number; token_cost: number; margin: number }[]) {
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  rows.forEach((r, i) =>
    stmtMonthly.run({
      $company_id: company_id,
      $month: months[i],
      $mrr: r.mrr,
      $pnl: r.pnl,
      $treasury: r.treasury,
      $token_cost: r.token_cost,
      $margin: r.margin,
    }),
  );
}

// bun:sqlite binds named params via $-prefixed keys; this prefixes a bare object.
function $(o: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const k in o) r["$" + k] = o[k];
  return r;
}

const stmtCharge = d.prepare(
  `INSERT INTO mock_charges (id, company_id, amount, currency, status, customer, plan, created, metadata)
   VALUES ($id,$company_id,$amount,$currency,$status,$customer,$plan,$created,$metadata)`,
);
const stmtSub = d.prepare(
  `INSERT INTO mock_subscriptions (id, company_id, customer, plan, amount, status, created, current_period_end, metadata)
   VALUES ($id,$company_id,$customer,$plan,$amount,$status,$created,$current_period_end,$metadata)`,
);
const stmtIssuing = d.prepare(
  `INSERT INTO mock_issuing_txns (id, company_id, amount, type, workflow, unit, merchant, created, metadata)
   VALUES ($id,$company_id,$amount,$type,$workflow,$unit,$merchant,$created,$metadata)`,
);
const insCharge = { run: (o: Record<string, unknown>) => stmtCharge.run($(o)) };
const insSub = { run: (o: Record<string, unknown>) => stmtSub.run($(o)) };
const insIssuing = { run: (o: Record<string, unknown>) => stmtIssuing.run($(o)) };
const insBalance = d.prepare(
  `INSERT INTO mock_balances (company_id, kind, currency, amount, apy) VALUES (?,?,?,?,?)`,
);
const insProject = d.prepare(
  `INSERT INTO mock_project_spend (company_id, project, provider, spend, cap) VALUES (?,?,?,?,?)`,
);

// ---------------- Company 1: Obol SaaS ----------------
function seedLedgerSaas() {
  const id = "comp_01";
  clearCompany(id);

  const plans = [
    { plan: "Starter", price: 49, active: 1, pastDue: 0 },
    { plan: "Growth", price: 199, active: 26, pastDue: 8 },
    { plan: "Scale", price: 599, active: 12, pastDue: 0 },
  ];

  let custN = 0;
  let mrr = 0;
  for (const tier of plans) {
    for (let i = 0; i < tier.active; i++) {
      custN++;
      const cust = `cus_saas_${String(custN).padStart(3, "0")}`;
      mrr += tier.price;
      insSub.run({
        id: `sub_${id}_${custN}`,
        company_id: id,
        customer: cust,
        plan: tier.plan,
        amount: tier.price,
        status: "active",
        created: daysAgo(120 + i),
        current_period_end: daysAgo(-20),
        metadata: JSON.stringify({ channel: i % 3 === 0 ? "organic" : "paid", geo: i % 2 ? "US" : "EU" }),
      });
      for (let m = 0; m < 3; m++) {
        insCharge.run({
          id: `ch_${id}_${custN}_${m}`,
          company_id: id,
          amount: tier.price,
          currency: "usd",
          status: "succeeded",
          customer: cust,
          plan: tier.plan,
          created: daysAgo(m * 30 + 2),
          metadata: JSON.stringify({ plan: tier.plan }),
        });
      }
    }
    for (let i = 0; i < tier.pastDue; i++) {
      custN++;
      const cust = `cus_saas_${String(custN).padStart(3, "0")}`;
      insSub.run({
        id: `sub_${id}_${custN}`,
        company_id: id,
        customer: cust,
        plan: tier.plan,
        amount: tier.price,
        status: "past_due",
        created: daysAgo(150 + i),
        current_period_end: daysAgo(3),
        metadata: JSON.stringify({ channel: "paid", geo: "US", churn_risk: "high" }),
      });
      // older success, latest failed → pre-churn signal
      insCharge.run({
        id: `ch_${id}_${custN}_ok`,
        company_id: id,
        amount: tier.price,
        currency: "usd",
        status: "succeeded",
        customer: cust,
        plan: tier.plan,
        created: daysAgo(34),
        metadata: JSON.stringify({ plan: tier.plan }),
      });
      insCharge.run({
        id: `ch_${id}_${custN}_fail`,
        company_id: id,
        amount: tier.price,
        currency: "usd",
        status: "failed",
        customer: cust,
        plan: tier.plan,
        created: daysAgo(4),
        metadata: JSON.stringify({ plan: tier.plan, failure_code: "card_declined" }),
      });
    }
  }

  // 2 projects with spend caps
  insProject.run(id, "inference-prod", "anthropic", 800, 1500);
  insProject.run(id, "inference-prod", "nvidia", 340, 600);
  insProject.run(id, "infrastructure", "vercel", 120, 300);
  insProject.run(id, "infrastructure", "supabase", 45, 200);

  // 5 Issuing transactions (card spend) tagged workflow/unit
  const issuing = [
    { wf: "support-agent", amt: -120 },
    { wf: "support-agent", amt: -95 },
    { wf: "support-agent", amt: -60 },
    { wf: "data-pipeline", amt: -210 },
    { wf: "data-pipeline", amt: -180 },
  ];
  issuing.forEach((t, i) =>
    insIssuing.run({
      id: `it_${id}_${i}`,
      company_id: id,
      amount: t.amt,
      type: "debit",
      workflow: t.wf,
      unit: "ledger-saas",
      merchant: t.wf === "support-agent" ? "OpenRouter" : "AWS",
      created: daysAgo(i * 4 + 1),
      metadata: JSON.stringify({ workflow: t.wf, unit: "ledger-saas" }),
    }),
  );

  // Treasury
  insBalance.run(id, "fiat", "usd", 45000, 0);
  insBalance.run(id, "usdc", "usdc", 8000, 4.1);
  insBalance.run(id, "usdb", "usdb", 0, 3.8);

  addCompany({
    id,
    name: "Obol SaaS",
    slug: "ledger-saas",
    type: "saas",
    connection_type: "direct_key",
    stripe_key: process.env.STRIPE_KEY_LEDGER_SAAS ?? "sk_test_mock_ledger_saas",
    permission_level: "full",
    autonomous_limit_single: 500,
    autonomous_limit_daily: 2000,
    escalation_contact: process.env.TELEGRAM_ESCALATION_CHAT_ID ?? "@operator",
    notes: "Flagship SaaS. 47 customers, 8 pre-churn.",
  });

  return { id, name: "Obol SaaS", mrr, customers: custN, pastDue: 8 };
}

// ---------------- Company 2: Unit Alpha ----------------
function seedUnitAlpha() {
  const id = "comp_02";
  clearCompany(id);

  // 23 wins (credits) + 18 analysis costs (debits), net ≈ +8400
  const winBase = [620, 540, 710, 480, 390, 820, 560, 470, 650, 530, 600, 440, 690, 510, 580, 460, 720, 500, 630, 410, 670, 550, 490]; // 23 values
  const costBase = [220, 180, 240, 160, 200, 210, 190, 230, 170, 205, 195, 215, 185, 175, 225, 165, 235, 200]; // 18 values

  let winSum = winBase.reduce((s, x) => s + x, 0);
  let costSum = costBase.reduce((s, x) => s + x, 0);
  // adjust last win so net is exactly 8400
  const target = 8400;
  const adjust = target - (winSum - costSum);
  winBase[winBase.length - 1] += adjust;
  winSum += adjust;

  winBase.forEach((amt, i) =>
    insIssuing.run({
      id: `it_${id}_win_${i}`,
      company_id: id,
      amount: amt,
      type: "credit",
      workflow: "market-win",
      unit: "unit-alpha",
      merchant: i % 2 ? "Polymarket" : "Kalshi",
      created: daysAgo(i + 1),
      metadata: JSON.stringify({ workflow: "market-win", unit: "unit-alpha" }),
    }),
  );
  costBase.forEach((amt, i) =>
    insIssuing.run({
      id: `it_${id}_cost_${i}`,
      company_id: id,
      amount: -amt,
      type: "debit",
      workflow: "market-analysis",
      unit: "unit-alpha",
      merchant: "DataProvider",
      created: daysAgo(i + 1),
      metadata: JSON.stringify({ workflow: "market-analysis", unit: "unit-alpha" }),
    }),
  );

  insProject.run(id, "market-data-apis", "polymarket", 1200, 2000);

  insBalance.run(id, "fiat", "usd", 22000, 0);
  insBalance.run(id, "usdc", "usdc", 0, 4.1);
  insBalance.run(id, "usdb", "usdb", 0, 3.8);

  addCompany({
    id,
    name: "Unit Alpha",
    slug: "unit-alpha",
    type: "trading-agent",
    connection_type: "direct_key",
    stripe_key: process.env.STRIPE_KEY_UNIT_ALPHA ?? "sk_test_mock_unit_alpha",
    permission_level: "full",
    autonomous_limit_single: 500,
    autonomous_limit_daily: 2000,
    escalation_contact: process.env.TELEGRAM_ESCALATION_CHAT_ID ?? "@operator",
    notes: "Prediction market trading bot. Issuing captures P&L.",
  });

  return { id, name: "Unit Alpha", pnl: winSum - costSum, wins: winBase.length, costs: costBase.length };
}

// ---------------- Budget trees + consumption ----------------
function seedBudgetSaas() {
  const id = "comp_01";
  setCompanyBudget(id, {
    permission_level: "full",
    spend_daily_cap: 2000,
    spend_single_cap: 500,
    compute_monthly_cap: 1800,
    compute_daily_cap: 400,
    hard_stop: 1,
  });
  setAgentBudget(id, "sentinel", { spend_authority: "none", compute_monthly_cap: 400, model_ceiling: "nemotron-3-mini" });
  setAgentBudget(id, "comptroller", { spend_authority: "execute", spend_daily_cap: 300, allowed_actions: ["model_switch"], compute_monthly_cap: 300 });
  setAgentBudget(id, "treasurer", { spend_authority: "execute", spend_single_cap: 500, spend_daily_cap: 2000, allowed_actions: ["pay_vendor", "rebalance"] });
  setAgentBudget(id, "forecaster", { spend_authority: "none", compute_monthly_cap: 700, model_ceiling: "nemotron-3-ultra" });
  setWorkflowBudget(id, "support-agent", { owner_agent: "sentinel", compute_monthly_cap: 600, margin_floor: 0.55, on_breach: "throttle" });
  setWorkflowBudget(id, "data-pipeline", { owner_agent: "forecaster", compute_monthly_cap: 500, margin_floor: 0.4, on_breach: "downgrade_model" });
  setWorkflowBudget(id, "onboarding", { owner_agent: "comptroller", compute_monthly_cap: 250, on_breach: "pause" });
  setProcessLimit(id, "data-pipeline", { per_run_compute_cap: 0.4, max_calls_per_run: 30 });

  // Agent-attributed compute (workflow=null) + workflow-attributed compute (agent=null) are
  // disjoint, so company month total = sum of both planes.
  insCons({ company_id: id, agent: "forecaster", kind: "compute", amount: 400, model: "nemotron-3-ultra" });
  insCons({ company_id: id, agent: "sentinel", kind: "compute", amount: 180, model: "nemotron-3-mini" });
  insCons({ company_id: id, agent: "comptroller", kind: "compute", amount: 60 });
  insCons({ company_id: id, workflow: "support-agent", kind: "compute", amount: 300, daysAgo: 4 });
  insCons({ company_id: id, workflow: "data-pipeline", kind: "compute", amount: 460, daysAgo: 3 }); // 92% of $500 → breach
  insCons({ company_id: id, workflow: "onboarding", kind: "compute", amount: 110, daysAgo: 5 });
  insCons({ company_id: id, workflow: "data-pipeline", kind: "compute", amount: 0.36, run_id: "run_dp_001" });
}

function seedBudgetAlpha() {
  const id = "comp_02";
  setCompanyBudget(id, {
    permission_level: "full",
    spend_daily_cap: 3000,
    spend_single_cap: 800,
    compute_monthly_cap: 2400,
    compute_daily_cap: 500,
    hard_stop: 1,
  });
  setAgentBudget(id, "sentinel", { spend_authority: "none", compute_monthly_cap: 500, model_ceiling: "nemotron-3-mini" });
  setAgentBudget(id, "comptroller", { spend_authority: "execute", spend_daily_cap: 300, allowed_actions: ["model_switch"], compute_monthly_cap: 300 });
  setAgentBudget(id, "treasurer", { spend_authority: "execute", spend_single_cap: 800, spend_daily_cap: 3000, allowed_actions: ["pay_vendor", "rebalance"] });
  setAgentBudget(id, "forecaster", { spend_authority: "none", compute_monthly_cap: 900, model_ceiling: "nemotron-3-ultra" });
  setWorkflowBudget(id, "market-analysis", { owner_agent: "forecaster", compute_monthly_cap: 1200, margin_floor: 0.4, on_breach: "throttle" });
  setWorkflowBudget(id, "market-win", { owner_agent: "sentinel", compute_monthly_cap: null, spend_monthly_cap: 0, on_breach: "escalate" });
  setWorkflowBudget(id, "market-data-apis", { owner_agent: "forecaster", spend_monthly_cap: 2000, on_breach: "escalate" });
  setProcessLimit(id, "market-analysis", { per_run_compute_cap: 0.6, requires_approval_over: 400 });

  // compute (month) → company 1,870 / 2,400 ≈ 78%
  insCons({ company_id: id, agent: "forecaster", kind: "compute", amount: 548, model: "nemotron-3-ultra" });
  insCons({ company_id: id, agent: "sentinel", kind: "compute", amount: 220, model: "nemotron-3-mini" });
  insCons({ company_id: id, agent: "comptroller", kind: "compute", amount: 99 });
  insCons({ company_id: id, workflow: "market-analysis", kind: "compute", amount: 936, daysAgo: 2 }); // 78% of $1,200
  insCons({ company_id: id, kind: "compute", amount: 67, daysAgo: 6 }); // unattributed remainder → company total
  insCons({ company_id: id, workflow: "market-analysis", kind: "compute", amount: 0.31, run_id: "run_ma_001" });
  // spend: treasurer today (company daily spend $1,200) + market-data-apis backdated (workflow month $1,200)
  insCons({ company_id: id, agent: "treasurer", kind: "spend", amount: 1200 });
  insCons({ company_id: id, workflow: "market-data-apis", kind: "spend", amount: 1200, daysAgo: 7 });
}

function seedMonthly() {
  // Obol SaaS — recurring revenue + treasury build, token cost receding, margin rising.
  insMonthly("comp_01", [
    { mrr: 8200, pnl: 0, treasury: 47000, token_cost: 1700, margin: 0.64 },
    { mrr: 9100, pnl: 0, treasury: 49000, token_cost: 1650, margin: 0.66 },
    { mrr: 9800, pnl: 0, treasury: 50500, token_cost: 1520, margin: 0.68 },
    { mrr: 10600, pnl: 0, treasury: 52000, token_cost: 1460, margin: 0.7 },
    { mrr: 11400, pnl: 0, treasury: 54000, token_cost: 1320, margin: 0.72 },
    { mrr: 12400, pnl: 0, treasury: 56000, token_cost: 1200, margin: 0.73 },
  ]);
  // Unit Alpha — trading P&L compounding, treasury build.
  insMonthly("comp_02", [
    { mrr: 0, pnl: 4200, treasury: 23000, token_cost: 980, margin: 0.66 },
    { mrr: 0, pnl: 5100, treasury: 25000, token_cost: 1000, margin: 0.68 },
    { mrr: 0, pnl: 5800, treasury: 27000, token_cost: 1010, margin: 0.7 },
    { mrr: 0, pnl: 6600, treasury: 29000, token_cost: 990, margin: 0.71 },
    { mrr: 0, pnl: 7400, treasury: 31000, token_cost: 950, margin: 0.73 },
    { mrr: 0, pnl: 8400, treasury: 33000, token_cost: 936, margin: 0.74 },
  ]);
}

const seed = d.transaction(() => {
  const a = seedLedgerSaas();
  const b = seedUnitAlpha();
  seedBudgetSaas();
  seedBudgetAlpha();
  seedMonthly();
  return [a, b] as const;
});

const [saas, alpha] = seed();

console.log("\nObol demo data seeded (mock mode)\n");
console.log("┌─────────┬──────────────┬────────────────┬──────────────────────────┐");
console.log("│ id      │ name         │ type           │ headline                 │");
console.log("├─────────┼──────────────┼────────────────┼──────────────────────────┤");
console.log(
  `│ ${saas.id} │ Obol SaaS  │ saas           │ MRR $${saas.mrr.toLocaleString()} (${saas.customers} cust, ${saas.pastDue} past_due) │`,
);
console.log(
  `│ ${alpha.id} │ Unit Alpha   │ trading-agent  │ P&L +$${alpha.pnl.toLocaleString()} (${alpha.wins}W/${alpha.costs}C)        │`,
);
console.log("└─────────┴──────────────┴────────────────┴──────────────────────────┘");
console.log("\nRegistry + mock tables written to ~/.ledger/registry.db");
console.log("Next: `bun mcp/ledger-core/index.ts` then open the dashboard.\n");
