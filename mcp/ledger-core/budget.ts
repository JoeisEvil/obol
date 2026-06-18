import * as registry from "./registry.js";

export type Level = "process" | "workflow" | "agent" | "company";
export type Remedy = "throttle" | "escalate" | "downgrade_model" | "pause";

export interface Eval {
  allowed: boolean;
  level_hit?: Level;
  reason?: string;
  remedy?: Remedy;
}

const MODEL_RANK: Record<string, number> = {
  "nemotron-3-mini": 1,
  "nemotron-3-standard": 2,
  "nemotron-3-ultra": 3,
};

export function modelRank(model: string): number {
  return MODEL_RANK[model] ?? 2;
}

// Synchronous cascade: walk PROCESS → WORKFLOW → AGENT → COMPANY and return the
// FIRST level that blocks. hard_stop=0 downgrades a block to alert-only (logged,
// allowed=true) but still reports level_hit/remedy.
export function evaluate(params: {
  company_id: string;
  agent: string;
  workflow: string;
  kind: "spend" | "compute";
  amount: number;
  model?: string;
  action_type?: string;
}): Eval {
  const { company_id, agent, workflow, kind, amount, model, action_type } = params;
  const cb = registry.getCompanyBudget(company_id);
  const hardStop = cb.hard_stop === 1;

  const block = (level: Level, reason: string, remedy: Remedy): Eval => ({
    allowed: hardStop ? false : true,
    level_hit: level,
    reason,
    remedy,
  });

  // ── LEVEL 4: PROCESS ──
  const proc = registry.getProcessLimit(company_id, workflow);
  if (proc) {
    if (kind === "compute" && amount > proc.per_run_compute_cap)
      return block("process", `run $${amount} > per-run cap $${proc.per_run_compute_cap}`, "throttle");
    if (kind === "spend" && proc.per_action_spend_cap && amount > proc.per_action_spend_cap)
      return block("process", `action $${amount} > per-action cap $${proc.per_action_spend_cap}`, "escalate");
    if (proc.requires_approval_over != null && amount > proc.requires_approval_over)
      return block("process", `single item $${amount} requires approval`, "escalate");
  }

  // ── LEVEL 3: WORKFLOW ──
  const wf = registry.getWorkflowBudget(company_id, workflow);
  if (wf) {
    const wfUsed = registry.windowConsumption(company_id, { workflow, kind, window: "month" });
    const cap = kind === "compute" ? wf.compute_monthly_cap : wf.spend_monthly_cap;
    if (cap != null && cap > 0 && wfUsed + amount > cap)
      return block("workflow", `workflow ${workflow} ${kind} $${wfUsed + amount} > monthly cap $${cap}`, wf.on_breach);
  }

  // ── LEVEL 2: AGENT ──
  const ab = registry.getAgentBudget(company_id, agent);
  if (!ab || !ab.enabled) return block("agent", `agent ${agent} not enabled`, "escalate");
  if (kind === "spend") {
    if (ab.spend_authority === "none" || ab.spend_authority === "read_only")
      return block("agent", `${agent} has no spend authority (${ab.spend_authority})`, "escalate");
    if (ab.spend_authority === "propose")
      return block("agent", `${agent} may only propose; staging for approval`, "escalate");
    if (amount > ab.spend_single_cap)
      return block("agent", `$${amount} > ${agent} single cap $${ab.spend_single_cap}`, "escalate");
    const agentDay = registry.windowConsumption(company_id, { agent, kind: "spend", window: "day" });
    if (agentDay + amount > ab.spend_daily_cap)
      return block("agent", `${agent} daily spend cap $${ab.spend_daily_cap} exceeded`, "escalate");
  } else {
    if (model && modelRank(model) > modelRank(ab.model_ceiling))
      return block("agent", `model ${model} exceeds ${agent} ceiling ${ab.model_ceiling}`, "downgrade_model");
    const agentMo = registry.windowConsumption(company_id, { agent, kind: "compute", window: "month" });
    if (ab.compute_monthly_cap != null && agentMo + amount > ab.compute_monthly_cap)
      return block("agent", `${agent} monthly compute cap $${ab.compute_monthly_cap} exceeded`, "downgrade_model");
  }

  // ── LEVEL 1: COMPANY ──
  if (cb.permission_level === "read_only" && kind === "spend")
    return block("company", "company is read_only", "escalate");
  if (kind === "spend" && action_type) {
    let allowed: string[] = [];
    try {
      allowed = JSON.parse(cb.allowed_actions);
    } catch {
      allowed = [];
    }
    if (!allowed.includes(action_type))
      return block("company", `action ${action_type} not in company allowed_actions`, "escalate");
  }
  const coCap = kind === "spend" ? cb.spend_daily_cap : cb.compute_daily_cap;
  if (coCap != null) {
    const coUsed = registry.windowConsumption(company_id, { kind, window: "day" });
    if (coUsed + amount > coCap)
      return block("company", `company daily ${kind} cap $${coCap} exceeded`, "escalate");
  }

  return { allowed: true };
}

export function recordConsumption(params: {
  company_id: string;
  agent?: string;
  workflow?: string;
  kind: "spend" | "compute";
  amount: number;
  model?: string;
  run_id?: string;
}): { recorded: boolean; window_totals: { compute_month: number; spend_day: number } } {
  registry.insertConsumption(params);
  return {
    recorded: true,
    window_totals: {
      compute_month: registry.windowConsumption(params.company_id, { kind: "compute", window: "month" }),
      spend_day: registry.windowConsumption(params.company_id, { kind: "spend", window: "day" }),
    },
  };
}
