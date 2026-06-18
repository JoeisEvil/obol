// Idempotent demo seed. In mock mode this populates the SQLite mock tables that
// MockProvider reads — no Stripe calls. Run: `bun scripts/seed-demo-data.ts`
import { db, addCompany } from "../mcp/ledger-core/registry.ts";

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
  ]) {
    d.prepare(`DELETE FROM ${t} WHERE company_id = ?`).run(companyId);
  }
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

// ---------------- Company 1: LEDGER SaaS ----------------
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
    name: "LEDGER SaaS",
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

  return { id, name: "LEDGER SaaS", mrr, customers: custN, pastDue: 8 };
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

const seed = d.transaction(() => {
  const a = seedLedgerSaas();
  const b = seedUnitAlpha();
  return [a, b] as const;
});

const [saas, alpha] = seed();

console.log("\nLEDGER demo data seeded (mock mode)\n");
console.log("┌─────────┬──────────────┬────────────────┬──────────────────────────┐");
console.log("│ id      │ name         │ type           │ headline                 │");
console.log("├─────────┼──────────────┼────────────────┼──────────────────────────┤");
console.log(
  `│ ${saas.id} │ LEDGER SaaS  │ saas           │ MRR $${saas.mrr.toLocaleString()} (${saas.customers} cust, ${saas.pastDue} past_due) │`,
);
console.log(
  `│ ${alpha.id} │ Unit Alpha   │ trading-agent  │ P&L +$${alpha.pnl.toLocaleString()} (${alpha.wins}W/${alpha.costs}C)        │`,
);
console.log("└─────────┴──────────────┴────────────────┴──────────────────────────┘");
console.log("\nRegistry + mock tables written to ~/.ledger/registry.db");
console.log("Next: `bun mcp/ledger-core/index.ts` then open the dashboard.\n");
