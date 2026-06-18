export type TreasuryHolding = {
  kind: "fiat" | "usdc" | "usdb" | "eur";
  currency: string;
  amount: number;
  apy: number;
};

export type ProjectCost = {
  project: string;
  provider: string;
  spend: number;
  cap: number;
  utilization?: number | null;
};

export type CompanyMetrics = {
  company_id: string;
  name: string;
  type: string;
  mrr: number;
  net_pnl: number;
  headline: { label: "MRR" | "P&L"; value: number; unit: "" | "/mo" };
  past_due: number;
  monthly_spend: number;
  monthly_revenue: number;
  net_burn: number;
  profitable: boolean;
  liquid: number;
  treasury: TreasuryHolding[];
  projects: { project: string; provider: string; spend: number; cap: number }[];
  runway_months: number | null;
};

export type Runway = { base: number | null; bear: number | null; bull: number | null };

export type PortfolioSummary = {
  companies: CompanyMetrics[];
  total_companies: number;
  portfolio_mrr: number;
  portfolio_pnl: number;
  portfolio_liquid: number;
  portfolio_net_burn: number;
  runway: Runway;
  stablecoin_yield_annual: number;
  error?: string;
  stale?: boolean;
};

export type Guardrails = {
  company_id: string;
  autonomous_limit_single: number;
  autonomous_limit_daily: number;
  permission_level: "full" | "read_write" | "read_only";
  escalation_contact: string;
  allowed_actions: string[];
};

export type ActionLogEntry = {
  id: string;
  company_id: string;
  timestamp: string;
  agent: string;
  action_type: string;
  description: string;
  amount_usd: number;
  outcome: string;
  guardrail?: string;
};

export type CompanyOverview = {
  company: {
    id: string;
    slug: string;
    name: string;
    type: string;
    connection_type: string;
    currency: string;
    status: string;
  };
  guardrails: Guardrails;
  metrics: CompanyMetrics;
  runway: Runway;
  token_cost_map: {
    workflows: { workflow: string; cost: number }[];
    projects: ProjectCost[];
  };
  action_log: ActionLogEntry[];
  error?: string;
  stale?: boolean;
};

export type Agent = {
  name: "sentinel" | "comptroller" | "treasurer" | "forecaster";
  status: "active";
  mode: string;
};

export type AgentStatus = {
  agents: Agent[];
  last_action: {
    id: string;
    company_id: string;
    agent: string;
    action_type: string;
    description: string;
    amount_usd: number;
    outcome: string;
    timestamp: string;
  } | null;
  error?: string;
  stale?: boolean;
};

export type RegistryCompany = {
  id: string;
  slug: string;
  name: string;
  type: string;
  connection_type: string;
  status: string;
  permission_level?: string;
};

export type RegistryList = {
  companies: RegistryCompany[];
  total: number;
  error?: string;
  stale?: boolean;
};
