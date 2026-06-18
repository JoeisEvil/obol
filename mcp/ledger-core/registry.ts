import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export type CompanyType = "saas" | "trading-agent" | "agency" | "client";
export type ConnectionType = "direct_key" | "stripe_connect";
export type CompanyStatus = "active" | "paused" | "read_only";
export type PermissionLevel = "full" | "read_write" | "read_only";

export interface Company {
  id: string;
  slug: string;
  name: string;
  type: CompanyType;
  connection_type: ConnectionType;
  stripe_key_ref: string | null;
  connect_token: string | null;
  connect_account: string | null;
  currency: string;
  status: CompanyStatus;
  added_at: string;
  notes: string | null;
}

export interface Guardrails {
  company_id: string;
  autonomous_limit_single: number;
  autonomous_limit_daily: number;
  monthly_inference_budget: number | null;
  rebalance_threshold: number;
  permission_level: PermissionLevel;
  escalation_contact: string | null;
  allowed_actions: string;
}

export interface ActionLogEntry {
  id: string;
  company_id: string;
  timestamp: string;
  agent: string;
  action_type: string;
  description: string;
  amount_usd: number | null;
  outcome: string;
  guardrail: string | null;
}

const LEDGER_DIR = join(homedir(), ".ledger");
const DB_PATH = process.env.LEDGER_DB_PATH ?? join(LEDGER_DIR, "registry.db");

let _db: Database | null = null;

export function db(): Database {
  if (_db) return _db;
  mkdirSync(LEDGER_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.exec("PRAGMA journal_mode = WAL;");
  migrate(_db);
  return _db;
}

function migrate(d: Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id              TEXT PRIMARY KEY,
      slug            TEXT UNIQUE NOT NULL,
      name            TEXT NOT NULL,
      type            TEXT NOT NULL,
      connection_type TEXT NOT NULL,
      stripe_key_ref  TEXT,
      connect_token   TEXT,
      connect_account TEXT,
      currency        TEXT DEFAULT 'usd',
      status          TEXT DEFAULT 'active',
      added_at        TEXT NOT NULL,
      notes           TEXT
    );

    CREATE TABLE IF NOT EXISTS guardrails (
      company_id               TEXT PRIMARY KEY REFERENCES companies(id),
      autonomous_limit_single  INTEGER DEFAULT 500,
      autonomous_limit_daily   INTEGER DEFAULT 2000,
      monthly_inference_budget INTEGER,
      rebalance_threshold      REAL DEFAULT 0.005,
      permission_level         TEXT DEFAULT 'full',
      escalation_contact       TEXT,
      allowed_actions          TEXT DEFAULT '["spend","rebalance","model_switch"]'
    );

    CREATE TABLE IF NOT EXISTS action_log (
      id          TEXT PRIMARY KEY,
      company_id  TEXT NOT NULL REFERENCES companies(id),
      timestamp   TEXT NOT NULL,
      agent       TEXT NOT NULL,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_usd  REAL,
      outcome     TEXT,
      guardrail   TEXT
    );

    -- Mock data tables: seeded source of truth for LEDGER_MODE=mock.
    CREATE TABLE IF NOT EXISTS mock_charges (
      id         TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      amount     REAL NOT NULL,
      currency   TEXT DEFAULT 'usd',
      status     TEXT NOT NULL,
      customer   TEXT,
      plan       TEXT,
      created    TEXT NOT NULL,
      metadata   TEXT
    );

    CREATE TABLE IF NOT EXISTS mock_subscriptions (
      id                 TEXT PRIMARY KEY,
      company_id         TEXT NOT NULL,
      customer           TEXT,
      plan               TEXT,
      amount             REAL NOT NULL,
      status             TEXT NOT NULL,
      created            TEXT NOT NULL,
      current_period_end TEXT,
      metadata           TEXT
    );

    CREATE TABLE IF NOT EXISTS mock_issuing_txns (
      id         TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      amount     REAL NOT NULL,
      type       TEXT NOT NULL,
      workflow   TEXT,
      unit       TEXT,
      merchant   TEXT,
      created    TEXT NOT NULL,
      metadata   TEXT
    );

    CREATE TABLE IF NOT EXISTS mock_balances (
      company_id TEXT NOT NULL,
      kind       TEXT NOT NULL,
      currency   TEXT NOT NULL,
      amount     REAL NOT NULL,
      apy        REAL DEFAULT 0,
      PRIMARY KEY (company_id, kind, currency)
    );

    CREATE TABLE IF NOT EXISTS mock_project_spend (
      company_id TEXT NOT NULL,
      project    TEXT NOT NULL,
      provider   TEXT NOT NULL,
      spend      REAL NOT NULL,
      cap        REAL,
      PRIMARY KEY (company_id, project, provider)
    );
  `);
}

function nowISO(): string {
  return new Date().toISOString();
}

function nextCompanyId(d: Database): string {
  const row = d.prepare("SELECT COUNT(*) AS n FROM companies").get() as { n: number };
  return `comp_${String(row.n + 1).padStart(2, "0")}`;
}

function nextLogId(d: Database): string {
  const row = d.prepare("SELECT COUNT(*) AS n FROM action_log").get() as { n: number };
  return `log_${String(row.n + 1).padStart(4, "0")}`;
}

const DEFAULT_GUARDRAILS: Omit<Guardrails, "company_id"> = {
  autonomous_limit_single: 500,
  autonomous_limit_daily: 2000,
  monthly_inference_budget: null,
  rebalance_threshold: 0.005,
  permission_level: "full",
  escalation_contact: null,
  allowed_actions: '["spend","rebalance","model_switch"]',
};

export interface AddCompanyParams {
  name: string;
  slug?: string;
  type: CompanyType;
  connection_type: ConnectionType;
  stripe_key?: string;
  connect_token?: string;
  connect_account?: string;
  currency?: string;
  autonomous_limit_single?: number;
  autonomous_limit_daily?: number;
  monthly_inference_budget?: number;
  permission_level?: PermissionLevel;
  escalation_contact?: string;
  allowed_actions?: string[];
  status?: CompanyStatus;
  id?: string;
  notes?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function addCompany(p: AddCompanyParams): { company_id: string; status: string } {
  const d = db();
  const slug = p.slug ?? slugify(p.name);
  const existing = d.prepare("SELECT id FROM companies WHERE slug = ?").get(slug) as
    | { id: string }
    | undefined;
  const id = p.id ?? existing?.id ?? nextCompanyId(d);
  const keyRef = p.stripe_key ? `STRIPE_KEY_${slug.toUpperCase().replace(/-/g, "_")}` : null;

  d.prepare(
    `INSERT INTO companies (id, slug, name, type, connection_type, stripe_key_ref,
        connect_token, connect_account, currency, status, added_at, notes)
     VALUES ($id,$slug,$name,$type,$connection_type,$stripe_key_ref,$connect_token,
        $connect_account,$currency,$status,$added_at,$notes)
     ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, type=excluded.type, connection_type=excluded.connection_type,
        stripe_key_ref=excluded.stripe_key_ref, connect_token=excluded.connect_token,
        connect_account=excluded.connect_account, currency=excluded.currency,
        status=excluded.status, notes=excluded.notes`,
  ).run({
    $id: id,
    $slug: slug,
    $name: p.name,
    $type: p.type,
    $connection_type: p.connection_type,
    $stripe_key_ref: keyRef,
    $connect_token: p.connect_token ?? null,
    $connect_account: p.connect_account ?? null,
    $currency: p.currency ?? "usd",
    $status: p.status ?? "active",
    $added_at: nowISO(),
    $notes: p.notes ?? null,
  });

  d.prepare(
    `INSERT INTO guardrails (company_id, autonomous_limit_single, autonomous_limit_daily,
        monthly_inference_budget, rebalance_threshold, permission_level, escalation_contact, allowed_actions)
     VALUES ($company_id,$single,$daily,$monthly,$rebalance,$permission,$escalation,$allowed)
     ON CONFLICT(company_id) DO UPDATE SET
        autonomous_limit_single=excluded.autonomous_limit_single,
        autonomous_limit_daily=excluded.autonomous_limit_daily,
        monthly_inference_budget=excluded.monthly_inference_budget,
        permission_level=excluded.permission_level,
        escalation_contact=excluded.escalation_contact,
        allowed_actions=excluded.allowed_actions`,
  ).run({
    $company_id: id,
    $single: p.autonomous_limit_single ?? DEFAULT_GUARDRAILS.autonomous_limit_single,
    $daily: p.autonomous_limit_daily ?? DEFAULT_GUARDRAILS.autonomous_limit_daily,
    $monthly: p.monthly_inference_budget ?? null,
    $rebalance: DEFAULT_GUARDRAILS.rebalance_threshold,
    $permission: p.permission_level ?? DEFAULT_GUARDRAILS.permission_level,
    $escalation: p.escalation_contact ?? null,
    $allowed: JSON.stringify(p.allowed_actions ?? JSON.parse(DEFAULT_GUARDRAILS.allowed_actions)),
  });

  return { company_id: id, status: "active" };
}

export function listCompanies(status?: string): { companies: Company[]; total: number } {
  const d = db();
  const rows = status
    ? (d.prepare("SELECT * FROM companies WHERE status = ? ORDER BY id").all(status) as Company[])
    : (d.prepare("SELECT * FROM companies ORDER BY id").all() as Company[]);
  return { companies: rows, total: rows.length };
}

export function getCompany(identifier: string): Company | null {
  const d = db();
  const row = d
    .prepare(
      "SELECT * FROM companies WHERE id = ? OR slug = ? OR lower(name) = lower(?) LIMIT 1",
    )
    .get(identifier, identifier, identifier) as Company | undefined;
  return row ?? null;
}

export function getGuardrails(company_id: string): Guardrails {
  const d = db();
  const row = d.prepare("SELECT * FROM guardrails WHERE company_id = ?").get(company_id) as
    | Guardrails
    | undefined;
  if (!row) return { company_id, ...DEFAULT_GUARDRAILS };
  return row;
}

const GUARDRAIL_FIELDS = new Set([
  "autonomous_limit_single",
  "autonomous_limit_daily",
  "monthly_inference_budget",
  "rebalance_threshold",
  "permission_level",
  "escalation_contact",
  "allowed_actions",
]);

export function updateGuardrails(
  company_id: string,
  field: string,
  value: unknown,
): { updated: boolean } {
  if (!GUARDRAIL_FIELDS.has(field)) throw new Error(`Unknown guardrail field: ${field}`);
  const d = db();
  const stored = field === "allowed_actions" && Array.isArray(value) ? JSON.stringify(value) : value;
  const res = d
    .prepare(`UPDATE guardrails SET ${field} = ? WHERE company_id = ?`)
    .run(stored as never, company_id);
  return { updated: res.changes > 0 };
}

export function removeCompany(company_id: string): { removed: boolean } {
  const d = db();
  // Archive: keep action_log for audit, drop registry + guardrails + mock data.
  const tx = d.transaction(() => {
    d.prepare("DELETE FROM guardrails WHERE company_id = ?").run(company_id);
    d.prepare("DELETE FROM mock_charges WHERE company_id = ?").run(company_id);
    d.prepare("DELETE FROM mock_subscriptions WHERE company_id = ?").run(company_id);
    d.prepare("DELETE FROM mock_issuing_txns WHERE company_id = ?").run(company_id);
    d.prepare("DELETE FROM mock_balances WHERE company_id = ?").run(company_id);
    d.prepare("DELETE FROM mock_project_spend WHERE company_id = ?").run(company_id);
    const res = d.prepare("DELETE FROM companies WHERE id = ?").run(company_id);
    return res.changes > 0;
  });
  return { removed: tx() };
}

export function logAction(p: {
  company_id: string;
  agent: string;
  action_type: string;
  description: string;
  amount_usd?: number | null;
  outcome: string;
  guardrail?: string | null;
}): { log_id: string } {
  const d = db();
  const id = nextLogId(d);
  d.prepare(
    `INSERT INTO action_log (id, company_id, timestamp, agent, action_type, description, amount_usd, outcome, guardrail)
     VALUES ($id,$company_id,$timestamp,$agent,$action_type,$description,$amount_usd,$outcome,$guardrail)`,
  ).run({
    $id: id,
    $company_id: p.company_id,
    $timestamp: nowISO(),
    $agent: p.agent,
    $action_type: p.action_type,
    $description: p.description,
    $amount_usd: p.amount_usd ?? null,
    $outcome: p.outcome,
    $guardrail: p.guardrail ?? null,
  });
  return { log_id: id };
}

export function getActionLog(company_id?: string, limit = 50): { entries: ActionLogEntry[] } {
  const d = db();
  const rows = company_id
    ? (d
        .prepare("SELECT * FROM action_log WHERE company_id = ? ORDER BY timestamp DESC LIMIT ?")
        .all(company_id, limit) as ActionLogEntry[])
    : (d
        .prepare("SELECT * FROM action_log ORDER BY timestamp DESC LIMIT ?")
        .all(limit) as ActionLogEntry[]);
  return { entries: rows };
}

export function getTodaySpend(company_id: string): number {
  const d = db();
  const today = nowISO().slice(0, 10);
  const row = d
    .prepare(
      `SELECT COALESCE(SUM(amount_usd), 0) AS total FROM action_log
       WHERE company_id = ? AND date(timestamp) = ? AND outcome = 'executed'`,
    )
    .get(company_id, today) as { total: number };
  return row.total;
}
