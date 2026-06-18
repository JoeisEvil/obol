import { getGuardrails, getTodaySpend } from "./registry.js";

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
  requires_escalation?: boolean;
}

export function checkGuardrails(
  company_id: string,
  action_type: string,
  amount_usd?: number,
): GuardrailResult {
  const g = getGuardrails(company_id);

  if (g.permission_level === "read_only") {
    return {
      allowed: false,
      reason: "Company is read_only. Action requires explicit approval.",
    };
  }

  if (amount_usd != null && amount_usd > g.autonomous_limit_single) {
    return {
      allowed: false,
      requires_escalation: true,
      reason: `Amount $${amount_usd} exceeds single-action limit $${g.autonomous_limit_single}`,
    };
  }

  if (amount_usd != null) {
    const todaySpend = getTodaySpend(company_id);
    if (todaySpend + amount_usd > g.autonomous_limit_daily) {
      return {
        allowed: false,
        requires_escalation: true,
        reason: `Daily ceiling $${g.autonomous_limit_daily} would be exceeded (today: $${todaySpend})`,
      };
    }
  }

  let allowed_actions: string[];
  try {
    allowed_actions = JSON.parse(g.allowed_actions);
  } catch {
    allowed_actions = [];
  }
  if (!allowed_actions.includes(action_type)) {
    return {
      allowed: false,
      reason: `Action ${action_type} not in company's allowed actions [${allowed_actions.join(", ")}]`,
    };
  }

  return { allowed: true };
}
