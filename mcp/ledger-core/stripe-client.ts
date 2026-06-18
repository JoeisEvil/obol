import Stripe from "stripe";
import { db, getCompany, type Company } from "./registry.js";

export interface Charge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  customer: string | null;
  plan: string | null;
  created: string;
  metadata: Record<string, string>;
}

export interface Subscription {
  id: string;
  customer: string | null;
  plan: string | null;
  amount: number;
  status: string;
  created: string;
  current_period_end: string | null;
  metadata: Record<string, string>;
}

export interface IssuingTxn {
  id: string;
  amount: number; // credits positive (wins), debits negative (spend)
  type: "credit" | "debit";
  workflow: string | null;
  unit: string | null;
  merchant: string | null;
  created: string;
  metadata: Record<string, string>;
}

export interface Balance {
  kind: string; // fiat | usdc | usdb | eur ...
  currency: string;
  amount: number;
  apy: number;
}

export interface ProjectSpend {
  project: string;
  provider: string;
  spend: number;
  cap: number | null;
}

export interface DataProvider {
  listCharges(p: { limit?: number; days?: number; status?: string }): Charge[];
  listSubscriptions(p: { status?: string; limit?: number }): Subscription[];
  listIssuingTransactions(p: { limit?: number; days?: number }): IssuingTxn[];
  getTreasuryBalance(): Balance[];
  getStablecoinBalances(): Balance[];
  getMultiCurrencyBalances(): Balance[];
  getProjectSpend(p: { project_id?: string }): ProjectSpend[];
  updateProjectSpendCap(p: { provider: string; limit: number }): { provider: string; cap: number };
  sendStablecoinPayment(p: {
    amount: number;
    currency: string;
    recipient: string;
    memo?: string;
  }): { sent: boolean; reference: string };
  convertCurrency(p: { amount: number; from: string; to: string }): {
    converted: number;
    rate: number;
    to: string;
  };
}

function parseMeta(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sinceISO(days?: number): string | null {
  if (!days) return null;
  return new Date(Date.now() - days * 86400_000).toISOString();
}

class MockProvider implements DataProvider {
  constructor(private companyId: string) {}

  listCharges(p: { limit?: number; days?: number; status?: string }): Charge[] {
    const d = db();
    const since = sinceISO(p.days);
    const bind: Record<string, unknown> = { $company_id: this.companyId, $limit: p.limit ?? 500 };
    let sql = "SELECT * FROM mock_charges WHERE company_id = $company_id";
    if (since) {
      sql += " AND created >= $since";
      bind.$since = since;
    }
    if (p.status) {
      sql += " AND status = $status";
      bind.$status = p.status;
    }
    sql += " ORDER BY created DESC LIMIT $limit";
    const rows = d.prepare(sql).all(bind) as any[];
    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      customer: r.customer,
      plan: r.plan,
      created: r.created,
      metadata: parseMeta(r.metadata),
    }));
  }

  listSubscriptions(p: { status?: string; limit?: number }): Subscription[] {
    const d = db();
    const bind: Record<string, unknown> = { $company_id: this.companyId, $limit: p.limit ?? 500 };
    let sql = "SELECT * FROM mock_subscriptions WHERE company_id = $company_id";
    if (p.status) {
      sql += " AND status = $status";
      bind.$status = p.status;
    }
    sql += " ORDER BY created DESC LIMIT $limit";
    const rows = d.prepare(sql).all(bind) as any[];
    return rows.map((r) => ({
      id: r.id,
      customer: r.customer,
      plan: r.plan,
      amount: r.amount,
      status: r.status,
      created: r.created,
      current_period_end: r.current_period_end,
      metadata: parseMeta(r.metadata),
    }));
  }

  listIssuingTransactions(p: { limit?: number; days?: number }): IssuingTxn[] {
    const d = db();
    const since = sinceISO(p.days);
    const bind: Record<string, unknown> = { $company_id: this.companyId, $limit: p.limit ?? 500 };
    let sql = "SELECT * FROM mock_issuing_txns WHERE company_id = $company_id";
    if (since) {
      sql += " AND created >= $since";
      bind.$since = since;
    }
    sql += " ORDER BY created DESC LIMIT $limit";
    const rows = d.prepare(sql).all(bind) as any[];
    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      type: r.type,
      workflow: r.workflow,
      unit: r.unit,
      merchant: r.merchant,
      created: r.created,
      metadata: parseMeta(r.metadata),
    }));
  }

  private balances(kinds: string[]): Balance[] {
    const d = db();
    const placeholders = kinds.map(() => "?").join(",");
    const rows = d
      .prepare(
        `SELECT kind, currency, amount, apy FROM mock_balances
         WHERE company_id = ? AND kind IN (${placeholders})`,
      )
      .all(this.companyId, ...kinds) as Balance[];
    return rows;
  }

  getTreasuryBalance(): Balance[] {
    return this.balances(["fiat", "usdc", "usdb", "eur"]);
  }

  getStablecoinBalances(): Balance[] {
    return this.balances(["usdc", "usdb"]);
  }

  getMultiCurrencyBalances(): Balance[] {
    return this.balances(["fiat", "eur", "gbp"]);
  }

  getProjectSpend(p: { project_id?: string }): ProjectSpend[] {
    const d = db();
    const bind: Record<string, unknown> = { $company_id: this.companyId };
    let sql = "SELECT project, provider, spend, cap FROM mock_project_spend WHERE company_id = $company_id";
    if (p.project_id) {
      sql += " AND project = $project";
      bind.$project = p.project_id;
    }
    return d.prepare(sql).all(bind) as ProjectSpend[];
  }

  updateProjectSpendCap(p: { provider: string; limit: number }): { provider: string; cap: number } {
    const d = db();
    d.prepare(
      "UPDATE mock_project_spend SET cap = ? WHERE company_id = ? AND provider = ?",
    ).run(p.limit, this.companyId, p.provider);
    return { provider: p.provider, cap: p.limit };
  }

  sendStablecoinPayment(p: {
    amount: number;
    currency: string;
    recipient: string;
    memo?: string;
  }): { sent: boolean; reference: string } {
    const d = db();
    const cur = p.currency.toLowerCase();
    d.prepare(
      "UPDATE mock_balances SET amount = amount - ? WHERE company_id = ? AND kind = ?",
    ).run(p.amount, this.companyId, cur);
    return { sent: true, reference: `mock_pay_${this.companyId}_${cur}_${p.amount}` };
  }

  convertCurrency(p: { amount: number; from: string; to: string }): {
    converted: number;
    rate: number;
    to: string;
  } {
    const d = db();
    const from = p.from.toLowerCase();
    const to = p.to.toLowerCase();
    const rate = mockRate(from, to);
    const converted = +(p.amount * rate).toFixed(2);
    const tx = d.transaction(() => {
      d.prepare(
        "UPDATE mock_balances SET amount = amount - ? WHERE company_id = ? AND kind = ?",
      ).run(p.amount, this.companyId, from);
      const exists = d
        .prepare("SELECT 1 FROM mock_balances WHERE company_id = ? AND kind = ?")
        .get(this.companyId, to);
      if (exists) {
        d.prepare(
          "UPDATE mock_balances SET amount = amount + ? WHERE company_id = ? AND kind = ?",
        ).run(converted, this.companyId, to);
      } else {
        d.prepare(
          "INSERT INTO mock_balances (company_id, kind, currency, amount, apy) VALUES (?,?,?,?,0)",
        ).run(this.companyId, to, to, converted);
      }
    });
    tx();
    return { converted, rate, to };
  }
}

function mockRate(from: string, to: string): number {
  const usd: Record<string, number> = { usd: 1, fiat: 1, usdc: 1, usdb: 1, eur: 1.08, gbp: 1.27 };
  const f = usd[from] ?? 1;
  const t = usd[to] ?? 1;
  return +(f / t).toFixed(4);
}

const LIVE_UNSUPPORTED =
  "Live mode does not support this surface (no public Stripe test API). Stays on mock data.";

class StripeProvider implements DataProvider {
  private stripe: Stripe;
  constructor(private company: Company, key: string) {
    this.stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion });
  }

  // Note: Stripe SDK is async; these throw a guided error so the live path is explicit.
  // Wire these up to real `await this.stripe.charges.list(...)` etc. when going live.
  listCharges(): Charge[] {
    throw new Error(
      "Live charges require an async path — implement against this.stripe.charges.list(). " +
        "Run in LEDGER_MODE=mock for the demo.",
    );
  }
  listSubscriptions(): Subscription[] {
    throw new Error("Live subscriptions: implement this.stripe.subscriptions.list(). Use mock mode.");
  }
  listIssuingTransactions(): IssuingTxn[] {
    throw new Error("Live issuing: implement this.stripe.issuing.transactions.list(). Use mock mode.");
  }
  getTreasuryBalance(): Balance[] {
    throw new Error(LIVE_UNSUPPORTED);
  }
  getStablecoinBalances(): Balance[] {
    throw new Error(LIVE_UNSUPPORTED);
  }
  getMultiCurrencyBalances(): Balance[] {
    throw new Error(LIVE_UNSUPPORTED);
  }
  getProjectSpend(): ProjectSpend[] {
    throw new Error(LIVE_UNSUPPORTED);
  }
  updateProjectSpendCap(): { provider: string; cap: number } {
    throw new Error(LIVE_UNSUPPORTED);
  }
  sendStablecoinPayment(): { sent: boolean; reference: string } {
    throw new Error(LIVE_UNSUPPORTED);
  }
  convertCurrency(): { converted: number; rate: number; to: string } {
    throw new Error(LIVE_UNSUPPORTED);
  }
}

export function getProvider(companyIdOrSlug: string): DataProvider {
  const company = getCompany(companyIdOrSlug);
  if (!company) throw new Error(`Unknown company: ${companyIdOrSlug}`);

  const mode = (process.env.LEDGER_MODE ?? "mock").toLowerCase();
  if (mode === "live" && company.connection_type === "direct_key") {
    const key = company.stripe_key_ref ? process.env[company.stripe_key_ref] : undefined;
    if (!key) {
      throw new Error(
        `LEDGER_MODE=live but ${company.stripe_key_ref ?? "STRIPE_KEY"} is not set for ${company.id}.`,
      );
    }
    return new StripeProvider(company, key);
  }
  return new MockProvider(company.id);
}
