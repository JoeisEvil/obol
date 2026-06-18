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
  workflow: string | null;
  action_type: string;
  description: string;
  amount_usd: number | null;
  kind: string | null;
  outcome: string;
  guardrail: string | null;
  level_hit: string | null;
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
      workflow    TEXT,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_usd  REAL,
      kind        TEXT,
      outcome     TEXT,
      guardrail   TEXT,
      level_hit   TEXT
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

    -- 6-month series for the Growth view (one row per company per month).
    CREATE TABLE IF NOT EXISTS mock_monthly (
      company_id TEXT NOT NULL,
      month      TEXT NOT NULL,          -- "2026-01"
      mrr        REAL DEFAULT 0,
      pnl        REAL DEFAULT 0,
      treasury   REAL DEFAULT 0,
      token_cost REAL DEFAULT 0,
      margin     REAL DEFAULT 0,
      PRIMARY KEY (company_id, month)
    );

    -- ── HIERARCHICAL BUDGET & AUTHORITY MODEL (COMPANY→AGENT→WORKFLOW→PROCESS) ──
    CREATE TABLE IF NOT EXISTS company_budget (
      company_id           TEXT PRIMARY KEY REFERENCES companies(id),
      permission_level     TEXT DEFAULT 'full',
      spend_monthly_cap    INTEGER,
      spend_daily_cap      INTEGER DEFAULT 2000,
      spend_single_cap     INTEGER DEFAULT 500,
      compute_monthly_cap  INTEGER,
      compute_daily_cap    INTEGER,
      allowed_actions      TEXT DEFAULT '["spend","rebalance","model_switch","provision","pay_vendor"]',
      escalation_contact   TEXT,
      hard_stop            INTEGER DEFAULT 1,
      reset_anchor         TEXT DEFAULT 'utc_midnight'
    );

    CREATE TABLE IF NOT EXISTS agent_budget (
      id                  TEXT PRIMARY KEY,
      company_id          TEXT NOT NULL REFERENCES companies(id),
      agent               TEXT NOT NULL,
      enabled             INTEGER DEFAULT 1,
      spend_authority     TEXT DEFAULT 'read_only',
      spend_single_cap    INTEGER DEFAULT 0,
      spend_daily_cap     INTEGER DEFAULT 0,
      allowed_actions     TEXT DEFAULT '[]',
      compute_monthly_cap INTEGER,
      compute_daily_cap   INTEGER,
      model_ceiling       TEXT DEFAULT 'nemotron-3-ultra',
      max_session_minutes INTEGER DEFAULT 30,
      UNIQUE(company_id, agent)
    );

    CREATE TABLE IF NOT EXISTS workflow_budget (
      id                  TEXT PRIMARY KEY,
      company_id          TEXT NOT NULL REFERENCES companies(id),
      workflow            TEXT NOT NULL,
      owner_agent         TEXT,
      compute_monthly_cap INTEGER,
      spend_monthly_cap   INTEGER DEFAULT 0,
      margin_floor        REAL DEFAULT 0.40,
      on_breach           TEXT DEFAULT 'pause',
      UNIQUE(company_id, workflow)
    );

    CREATE TABLE IF NOT EXISTS process_limit (
      id                     TEXT PRIMARY KEY,
      company_id             TEXT NOT NULL REFERENCES companies(id),
      workflow               TEXT NOT NULL,
      per_run_compute_cap    REAL DEFAULT 0.50,
      per_action_spend_cap   REAL DEFAULT 0,
      max_calls_per_run      INTEGER DEFAULT 40,
      requires_approval_over REAL,
      approved_vendors       TEXT DEFAULT '[]',
      UNIQUE(company_id, workflow)
    );

    CREATE TABLE IF NOT EXISTS consumption (
      id         TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      agent      TEXT,
      workflow   TEXT,
      kind       TEXT NOT NULL,          -- "spend" | "compute"
      amount_usd REAL NOT NULL,
      model      TEXT,
      ts         TEXT NOT NULL,
      run_id     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_consumption_lookup
      ON consumption (company_id, agent, workflow, kind, ts);
  `);

  // Additive migrations for DBs created before these columns existed.
  ensureColumn(d, "action_log", "workflow", "TEXT");
  ensureColumn(d, "action_log", "kind", "TEXT");
  ensureColumn(d, "action_log", "level_hit", "TEXT");
}

function ensureColumn(d: Database, table: string, col: string, decl: string) {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  }
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
    d.prepare("DELETE FROM mock_monthly WHERE company_id = ?").run(company_id);
    d.prepare("DELETE FROM company_budget WHERE company_id = ?").run(company_id);
    d.prepare("DELETE FROM agent_budget WHERE company_id = ?").run(company_id);
    d.prepare("DELETE FROM workflow_budget WHERE company_id = ?").run(company_id);
    d.prepare("DELETE FROM process_limit WHERE company_id = ?").run(company_id);
    d.prepare("DELETE FROM consumption WHERE company_id = ?").run(company_id);
    const res = d.prepare("DELETE FROM companies WHERE id = ?").run(company_id);
    return res.changes > 0;
  });
  return { removed: tx() };
}

export function logAction(p: {
  company_id: string;
  agent: string;
  workflow?: string | null;
  action_type: string;
  description: string;
  amount_usd?: number | null;
  kind?: string | null;
  outcome: string;
  guardrail?: string | null;
  level_hit?: string | null;
}): { log_id: string } {
  const d = db();
  const id = nextLogId(d);
  d.prepare(
    `INSERT INTO action_log (id, company_id, timestamp, agent, workflow, action_type, description, amount_usd, kind, outcome, guardrail, level_hit)
     VALUES ($id,$company_id,$timestamp,$agent,$workflow,$action_type,$description,$amount_usd,$kind,$outcome,$guardrail,$level_hit)`,
  ).run({
    $id: id,
    $company_id: p.company_id,
    $timestamp: nowISO(),
    $agent: p.agent,
    $workflow: p.workflow ?? null,
    $action_type: p.action_type,
    $description: p.description,
    $amount_usd: p.amount_usd ?? null,
    $kind: p.kind ?? null,
    $outcome: p.outcome,
    $guardrail: p.guardrail ?? null,
    $level_hit: p.level_hit ?? null,
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

// ───────────────────────── Hierarchical budget model ─────────────────────────

export type SpendAuthority = "none" | "read_only" | "propose" | "execute";
export type OnBreach = "pause" | "throttle" | "escalate" | "downgrade_model";

export interface CompanyBudget {
  company_id: string;
  permission_level: PermissionLevel;
  spend_monthly_cap: number | null;
  spend_daily_cap: number | null;
  spend_single_cap: number | null;
  compute_monthly_cap: number | null;
  compute_daily_cap: number | null;
  allowed_actions: string;
  escalation_contact: string | null;
  hard_stop: number;
  reset_anchor: string;
}

export interface AgentBudget {
  id: string;
  company_id: string;
  agent: string;
  enabled: number;
  spend_authority: SpendAuthority;
  spend_single_cap: number;
  spend_daily_cap: number;
  allowed_actions: string;
  compute_monthly_cap: number | null;
  compute_daily_cap: number | null;
  model_ceiling: string;
  max_session_minutes: number;
}

export interface WorkflowBudget {
  id: string;
  company_id: string;
  workflow: string;
  owner_agent: string | null;
  compute_monthly_cap: number | null;
  spend_monthly_cap: number;
  margin_floor: number;
  on_breach: OnBreach;
}

export interface ProcessLimit {
  id: string;
  company_id: string;
  workflow: string;
  per_run_compute_cap: number;
  per_action_spend_cap: number;
  max_calls_per_run: number;
  requires_approval_over: number | null;
  approved_vendors: string;
}

const COMPANY_BUDGET_DEFAULTS: Omit<CompanyBudget, "company_id"> = {
  permission_level: "full",
  spend_monthly_cap: null,
  spend_daily_cap: 2000,
  spend_single_cap: 500,
  compute_monthly_cap: null,
  compute_daily_cap: null,
  allowed_actions: '["spend","rebalance","model_switch","provision","pay_vendor"]',
  escalation_contact: null,
  hard_stop: 1,
  reset_anchor: "utc_midnight",
};

function upsert(table: string, keyCols: string[], data: Record<string, unknown>) {
  const d = db();
  const cols = Object.keys(data);
  const placeholders = cols.map((c) => `$${c}`).join(",");
  const updates = cols
    .filter((c) => !keyCols.includes(c))
    .map((c) => `${c}=excluded.${c}`)
    .join(", ");
  const bind: Record<string, unknown> = {};
  for (const c of cols) bind[`$${c}`] = data[c];
  d.prepare(
    `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})
     ON CONFLICT(${keyCols.join(",")}) DO UPDATE SET ${updates}`,
  ).run(bind);
}

export function getCompanyBudget(company_id: string): CompanyBudget {
  const d = db();
  const row = d.prepare("SELECT * FROM company_budget WHERE company_id = ?").get(company_id) as
    | CompanyBudget
    | undefined;
  return row ?? { company_id, ...COMPANY_BUDGET_DEFAULTS };
}

export function setCompanyBudget(
  company_id: string,
  fields: Partial<Omit<CompanyBudget, "company_id">>,
): { updated: boolean } {
  const current = getCompanyBudget(company_id);
  const merged = { ...current, ...fields, company_id };
  if (Array.isArray((fields as Record<string, unknown>).allowed_actions))
    merged.allowed_actions = JSON.stringify((fields as Record<string, unknown>).allowed_actions);
  upsert("company_budget", ["company_id"], merged as unknown as Record<string, unknown>);
  return { updated: true };
}

export function getAgentBudgets(company_id: string): AgentBudget[] {
  const d = db();
  return d
    .prepare("SELECT * FROM agent_budget WHERE company_id = ? ORDER BY agent")
    .all(company_id) as AgentBudget[];
}

export function getAgentBudget(company_id: string, agent: string): AgentBudget | null {
  const d = db();
  return (
    (d
      .prepare("SELECT * FROM agent_budget WHERE company_id = ? AND agent = ?")
      .get(company_id, agent) as AgentBudget | undefined) ?? null
  );
}

export function setAgentBudget(
  company_id: string,
  agent: string,
  fields: Partial<AgentBudget>,
): { updated: boolean; error?: string } {
  const cb = getCompanyBudget(company_id);
  // Validate child caps never exceed the company envelope.
  if (
    fields.compute_monthly_cap != null &&
    cb.compute_monthly_cap != null &&
    fields.compute_monthly_cap > cb.compute_monthly_cap
  )
    return { updated: false, error: "agent compute_monthly_cap exceeds company envelope" };
  if (
    fields.spend_single_cap != null &&
    cb.spend_single_cap != null &&
    fields.spend_single_cap > cb.spend_single_cap
  )
    return { updated: false, error: "agent spend_single_cap exceeds company single cap" };
  const existing = getAgentBudget(company_id, agent);
  const base: AgentBudget = existing ?? {
    id: `${company_id}:${agent}`,
    company_id,
    agent,
    enabled: 1,
    spend_authority: "read_only",
    spend_single_cap: 0,
    spend_daily_cap: 0,
    allowed_actions: "[]",
    compute_monthly_cap: null,
    compute_daily_cap: null,
    model_ceiling: "nemotron-3-ultra",
    max_session_minutes: 30,
  };
  const merged = { ...base, ...fields, id: base.id, company_id, agent };
  if (Array.isArray((fields as Record<string, unknown>).allowed_actions))
    merged.allowed_actions = JSON.stringify((fields as Record<string, unknown>).allowed_actions);
  upsert("agent_budget", ["company_id", "agent"], merged as unknown as Record<string, unknown>);
  return { updated: true };
}

export function getWorkflowBudgets(company_id: string): WorkflowBudget[] {
  const d = db();
  return d
    .prepare("SELECT * FROM workflow_budget WHERE company_id = ? ORDER BY workflow")
    .all(company_id) as WorkflowBudget[];
}

export function getWorkflowBudget(company_id: string, workflow: string): WorkflowBudget | null {
  const d = db();
  return (
    (d
      .prepare("SELECT * FROM workflow_budget WHERE company_id = ? AND workflow = ?")
      .get(company_id, workflow) as WorkflowBudget | undefined) ?? null
  );
}

export function setWorkflowBudget(
  company_id: string,
  workflow: string,
  fields: Partial<WorkflowBudget>,
): { updated: boolean } {
  const existing = getWorkflowBudget(company_id, workflow);
  const base: WorkflowBudget = existing ?? {
    id: `${company_id}:${workflow}`,
    company_id,
    workflow,
    owner_agent: null,
    compute_monthly_cap: null,
    spend_monthly_cap: 0,
    margin_floor: 0.4,
    on_breach: "pause",
  };
  const merged = { ...base, ...fields, id: base.id, company_id, workflow };
  upsert("workflow_budget", ["company_id", "workflow"], merged as unknown as Record<string, unknown>);
  return { updated: true };
}

export function getProcessLimit(company_id: string, workflow: string): ProcessLimit | null {
  const d = db();
  return (
    (d
      .prepare("SELECT * FROM process_limit WHERE company_id = ? AND workflow = ?")
      .get(company_id, workflow) as ProcessLimit | undefined) ?? null
  );
}

export function getProcessLimits(company_id: string): ProcessLimit[] {
  const d = db();
  return d
    .prepare("SELECT * FROM process_limit WHERE company_id = ? ORDER BY workflow")
    .all(company_id) as ProcessLimit[];
}

export function setProcessLimit(
  company_id: string,
  workflow: string,
  fields: Partial<ProcessLimit>,
): { updated: boolean } {
  const existing = getProcessLimit(company_id, workflow);
  const base: ProcessLimit = existing ?? {
    id: `${company_id}:${workflow}`,
    company_id,
    workflow,
    per_run_compute_cap: 0.5,
    per_action_spend_cap: 0,
    max_calls_per_run: 40,
    requires_approval_over: null,
    approved_vendors: "[]",
  };
  const merged = { ...base, ...fields, id: base.id, company_id, workflow };
  upsert("process_limit", ["company_id", "workflow"], merged as unknown as Record<string, unknown>);
  return { updated: true };
}

export interface ConsumptionEvent {
  company_id: string;
  agent?: string | null;
  workflow?: string | null;
  kind: "spend" | "compute";
  amount: number;
  model?: string | null;
  run_id?: string | null;
}

export function insertConsumption(e: ConsumptionEvent): { recorded: boolean } {
  const d = db();
  const n = (d.prepare("SELECT COUNT(*) AS n FROM consumption").get() as { n: number }).n;
  d.prepare(
    `INSERT INTO consumption (id, company_id, agent, workflow, kind, amount_usd, model, ts, run_id)
     VALUES ($id,$company_id,$agent,$workflow,$kind,$amount,$model,$ts,$run_id)`,
  ).run({
    $id: `cons_${String(n + 1).padStart(6, "0")}`,
    $company_id: e.company_id,
    $agent: e.agent ?? null,
    $workflow: e.workflow ?? null,
    $kind: e.kind,
    $amount: e.amount,
    $model: e.model ?? null,
    $ts: nowISO(),
    $run_id: e.run_id ?? null,
  });
  return { recorded: true };
}

export function windowConsumption(
  company_id: string,
  opts: { agent?: string; workflow?: string; kind: "spend" | "compute"; window: "day" | "month" },
): number {
  const d = db();
  const bind: Record<string, unknown> = { $company_id: company_id, $kind: opts.kind };
  let sql = "SELECT COALESCE(SUM(amount_usd),0) AS total FROM consumption WHERE company_id = $company_id AND kind = $kind";
  if (opts.agent) {
    sql += " AND agent = $agent";
    bind.$agent = opts.agent;
  }
  if (opts.workflow) {
    sql += " AND workflow = $workflow";
    bind.$workflow = opts.workflow;
  }
  if (opts.window === "day") {
    sql += " AND date(ts) = date($now)";
    bind.$now = nowISO();
  } else {
    sql += " AND substr(ts,1,7) = substr($now,1,7)";
    bind.$now = nowISO();
  }
  return (d.prepare(sql).get(bind) as { total: number }).total;
}

export interface BudgetNode {
  level: "company" | "agent" | "workflow" | "process";
  key: string;
  label: string;
  kind: "spend" | "compute" | "both";
  used: number;
  cap: number | null;
  pct: number | null;
  meta?: Record<string, unknown>;
}

export interface BudgetTree {
  company: { id: string; name: string; type: string };
  enforcement: { hard_stop: boolean; permission_level: string };
  company_node: BudgetNode;
  agents: BudgetNode[];
  workflows: BudgetNode[];
  processes: BudgetNode[];
  totals: { compute_used: number; compute_cap: number | null; spend_used: number; spend_cap: number | null };
}

function pct(used: number, cap: number | null): number | null {
  if (cap == null || cap === 0) return null;
  return Math.round((used / cap) * 100);
}

export function getBudgetTree(company_id: string): BudgetTree | null {
  const company = getCompany(company_id);
  if (!company) return null;
  const cb = getCompanyBudget(company_id);

  const computeUsed = windowConsumption(company_id, { kind: "compute", window: "month" });
  const spendUsed = windowConsumption(company_id, { kind: "spend", window: "day" });

  const company_node: BudgetNode = {
    level: "company",
    key: company_id,
    label: company.name,
    kind: "compute",
    used: computeUsed,
    cap: cb.compute_monthly_cap,
    pct: pct(computeUsed, cb.compute_monthly_cap),
    meta: {
      spend_used: spendUsed,
      spend_cap: cb.spend_daily_cap,
      permission_level: cb.permission_level,
    },
  };

  const agents: BudgetNode[] = getAgentBudgets(company_id).map((a) => {
    // Prefer the compute meter when the agent has a compute budget; otherwise show its spend.
    const hasCompute = a.compute_monthly_cap != null;
    const used = hasCompute
      ? windowConsumption(company_id, { agent: a.agent, kind: "compute", window: "month" })
      : windowConsumption(company_id, { agent: a.agent, kind: "spend", window: "day" });
    const cap = hasCompute ? a.compute_monthly_cap : a.spend_daily_cap;
    const planes: string[] = [];
    if (a.spend_authority !== "none") planes.push("spend");
    if (a.compute_monthly_cap != null) planes.push("compute");
    return {
      level: "agent",
      key: `${company_id}:${a.agent}`,
      label: a.agent,
      kind: hasCompute ? "compute" : "spend",
      used,
      cap,
      pct: pct(used, cap),
      meta: {
        planes,
        spend_authority: a.spend_authority,
        spend_single_cap: a.spend_single_cap,
        model_ceiling: a.model_ceiling,
      },
    };
  });

  const workflows: BudgetNode[] = getWorkflowBudgets(company_id).map((w) => {
    const isCompute = w.compute_monthly_cap != null;
    const used = isCompute
      ? windowConsumption(company_id, { workflow: w.workflow, kind: "compute", window: "month" })
      : windowConsumption(company_id, { workflow: w.workflow, kind: "spend", window: "month" });
    const cap = isCompute ? w.compute_monthly_cap : w.spend_monthly_cap || null;
    return {
      level: "workflow",
      key: `${company_id}:${w.workflow}`,
      label: w.workflow,
      kind: isCompute ? "compute" : "spend",
      used,
      cap,
      pct: pct(used, cap),
      meta: { on_breach: w.on_breach, owner_agent: w.owner_agent, margin_floor: w.margin_floor },
    };
  });

  const processes: BudgetNode[] = getProcessLimits(company_id).map((p) => {
    // Per-run figure is illustrative (last run's cost); seed stores it in consumption run rows.
    const lastRun = (db()
      .prepare(
        `SELECT amount_usd FROM consumption WHERE company_id = ? AND workflow = ? AND kind = 'compute' AND run_id IS NOT NULL ORDER BY ts DESC LIMIT 1`,
      )
      .get(company_id, p.workflow) as { amount_usd: number } | undefined) ?? null;
    const used = lastRun ? lastRun.amount_usd : p.per_run_compute_cap * 0.5;
    return {
      level: "process",
      key: `${company_id}:${p.workflow}:run`,
      label: `per-run · ${p.workflow}`,
      kind: "compute",
      used,
      cap: p.per_run_compute_cap,
      pct: pct(used, p.per_run_compute_cap),
      meta: { requires_approval_over: p.requires_approval_over, max_calls_per_run: p.max_calls_per_run },
    };
  });

  return {
    company: { id: company.id, name: company.name, type: company.type },
    enforcement: { hard_stop: cb.hard_stop === 1, permission_level: cb.permission_level },
    company_node,
    agents,
    workflows,
    processes,
    totals: {
      compute_used: computeUsed,
      compute_cap: cb.compute_monthly_cap,
      spend_used: spendUsed,
      spend_cap: cb.spend_daily_cap,
    },
  };
}

export function getMonthlySeries(company_id: string): {
  month: string;
  mrr: number;
  pnl: number;
  treasury: number;
  token_cost: number;
  margin: number;
}[] {
  const d = db();
  return d
    .prepare("SELECT month, mrr, pnl, treasury, token_cost, margin FROM mock_monthly WHERE company_id = ? ORDER BY month")
    .all(company_id) as never;
}
