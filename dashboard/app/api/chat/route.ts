import { NextResponse } from "next/server";
import { callTool } from "@/lib/mcp";
import type { PortfolioSummary, CompanyOverview } from "@/lib/types";

export const dynamic = "force-dynamic";

function usd(n: number | null | undefined, sign = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${n < 0 ? "-$" : sign ? "+$" : "$"}${abs}`;
}

function runwayText(base: number | null): string {
  return base === null ? "profitable (no finite runway)" : `${base} months`;
}

type Reply = { bottom: string; support: string[]; action: string };

function format(r: Reply): string {
  return [r.bottom, ...r.support, `→ ${r.action}`].join("\n");
}

async function portfolioAnswer(message: string): Promise<string> {
  const { data } = await callTool<PortfolioSummary>("portfolio_summary");
  if (!data || data.error) {
    return format({
      bottom: "I can't reach live portfolio data right now.",
      support: ["The MCP server appears to be offline or unreachable."],
      action: "Retry in a moment, or check the MCP server at localhost:3001.",
    });
  }
  const m = message.toLowerCase();

  if (/runway|burn/.test(m)) {
    const burn = data.portfolio_net_burn;
    return format({
      bottom:
        data.runway.base === null
          ? "The portfolio is profitable — there is no finite runway constraint."
          : `Portfolio runway is ${data.runway.base} months at the base case.`,
      support: [
        `Net burn is ${usd(burn)}/mo (${burn < 0 ? "net positive cashflow" : "cash consumed"}). Liquid reserves: ${usd(data.portfolio_liquid)}.`,
        `Scenarios — bear: ${runwayText(data.runway.bear)}, bull: ${runwayText(data.runway.bull)}.`,
      ],
      action:
        data.runway.base !== null && data.runway.base < 9
          ? "Prioritise the shortest-runway company; consider shifting idle cash into yield-bearing stablecoins."
          : "Maintain current allocation; sweep excess fiat into stablecoin yield to extend runway.",
    });
  }

  if (/treasury|stable|yield|usdc|usdb|cash|liquid/.test(m)) {
    const stableYield = data.stablecoin_yield_annual;
    return format({
      bottom: `Total liquid treasury is ${usd(data.portfolio_liquid)} across the portfolio.`,
      support: [
        `Stablecoin holdings are generating ${usd(stableYield)}/yr in yield.`,
        `Portfolio MRR ${usd(data.portfolio_mrr)}/mo, net P&L ${usd(data.portfolio_pnl, true)}.`,
      ],
      action: "Route undeployed fiat into USDC/USDB to compound the annual yield.",
    });
  }

  if (/churn|revenue|mrr|sales|growth/.test(m)) {
    const sorted = [...data.companies].sort((a, b) => b.mrr - a.mrr);
    const top = sorted[0];
    return format({
      bottom: `Portfolio MRR is ${usd(data.portfolio_mrr)}/mo across ${data.total_companies} companies.`,
      support: [
        top ? `Top earner: ${top.name} at ${usd(top.mrr)}/mo.` : "No company MRR data available.",
        `Aggregate net P&L is ${usd(data.portfolio_pnl, true)}.`,
      ],
      action: "Drill into the lowest-margin company to defend against churn risk.",
    });
  }

  if (/spend|token|cost|compute|api/.test(m)) {
    const totalSpend = data.companies.reduce((s, c) => s + (c.monthly_spend || 0), 0);
    return format({
      bottom: `Combined monthly operating spend is ${usd(totalSpend)}/mo.`,
      support: [
        `Net burn across the portfolio is ${usd(data.portfolio_net_burn)}/mo.`,
        "Open a specific company to see its workflow + project token cost map.",
      ],
      action: "Review project caps on the highest-utilisation company to avoid overrun.",
    });
  }

  // "how is <company>" at portfolio scope
  const named = data.companies.find((c) => m.includes(c.name.toLowerCase()));
  if (named || /how is|status of|how's/.test(m)) {
    const c = named ?? [...data.companies].sort((a, b) => b.mrr - a.mrr)[0];
    if (c) {
      return format({
        bottom: `${c.name} is ${c.profitable ? "profitable" : "running at a loss"} with ${c.headline.label} of ${usd(c.headline.value)}${c.headline.unit}.`,
        support: [
          `Liquid: ${usd(c.liquid)}, net burn ${usd(c.net_burn)}/mo, runway ${runwayText(c.runway_months)}.`,
          c.past_due > 0 ? `Past due balance: ${usd(c.past_due)}.` : "No past-due balances.",
        ],
        action: `Open /${c.company_id} for the full action log and token cost map.`,
      });
    }
  }

  return format({
    bottom: `Portfolio overview: ${data.total_companies} companies, ${usd(data.portfolio_mrr)}/mo MRR, runway ${runwayText(data.runway.base)}.`,
    support: [
      "Ask me about: runway, treasury / stablecoin yield, spend / token cost, churn / MRR, or how a specific company is doing.",
    ],
    action: "Try \"what's our runway?\" or \"how is treasury looking?\"",
  });
}

async function companyAnswer(message: string, companyId: string): Promise<string> {
  const { data } = await callTool<CompanyOverview>("company_overview", { company_id: companyId });
  if (!data || data.error) {
    return format({
      bottom: "I can't reach live data for this company right now.",
      support: ["The MCP server appears to be offline or unreachable."],
      action: "Retry shortly, or check the MCP server.",
    });
  }
  const m = message.toLowerCase();
  const c = data.metrics;
  const name = data.company.name;

  if (/runway|burn/.test(m)) {
    return format({
      bottom:
        data.runway.base === null
          ? `${name} is profitable — no finite runway constraint.`
          : `${name}'s runway is ${data.runway.base} months at base case.`,
      support: [
        `Net burn ${usd(c.net_burn)}/mo, liquid ${usd(c.liquid)}.`,
        `Bear: ${runwayText(data.runway.bear)}, bull: ${runwayText(data.runway.bull)}.`,
      ],
      action:
        data.runway.base !== null && data.runway.base < 6
          ? "Tighten autonomous spend limits and review project caps this week."
          : "Hold course; deploy idle cash into stablecoin yield.",
    });
  }

  if (/treasury|stable|yield|usdc|usdb|cash|liquid/.test(m)) {
    const yieldTotal = c.treasury.reduce((s, t) => s + (t.amount * t.apy) / 100, 0);
    return format({
      bottom: `${name} holds ${usd(c.liquid)} in liquid treasury.`,
      support: [
        `Holdings: ${c.treasury.map((t) => `${t.currency} ${usd(t.amount)} @ ${t.apy}%`).join(", ") || "none"}.`,
        `Estimated annual yield: ${usd(yieldTotal)}.`,
      ],
      action: "Convert idle fiat to USDC/USDB to lift blended yield.",
    });
  }

  if (/spend|token|cost|compute|api/.test(m)) {
    const wf = [...data.token_cost_map.workflows].sort((a, b) => b.cost - a.cost)[0];
    const hot = data.token_cost_map.projects.find((p) => (p.utilization ?? 0) > 80);
    return format({
      bottom: `${name}'s monthly spend is ${usd(c.monthly_spend)}/mo.`,
      support: [
        wf ? `Most expensive workflow: ${wf.workflow} at ${usd(wf.cost)}.` : "No workflow cost data.",
        hot
          ? `${hot.project} is at ${Math.round(hot.utilization ?? 0)}% of its ${usd(hot.cap)} cap — watch closely.`
          : "All project caps are within safe limits.",
      ],
      action: hot
        ? `Raise or rebalance the cap on ${hot.project} before it blocks workflows.`
        : "No action needed on caps; continue monitoring.",
    });
  }

  if (/churn|revenue|mrr|sales|growth/.test(m)) {
    return format({
      bottom: `${name} ${c.headline.label} is ${usd(c.headline.value)}${c.headline.unit}.`,
      support: [
        `Monthly revenue ${usd(c.monthly_revenue)}, spend ${usd(c.monthly_spend)}.`,
        c.past_due > 0 ? `Past due: ${usd(c.past_due)} — collection risk.` : "No past-due balances.",
      ],
      action: c.past_due > 0 ? "Trigger a dunning sequence on past-due invoices." : "Maintain current billing cadence.",
    });
  }

  // default / "how is it"
  return format({
    bottom: `${name} is ${c.profitable ? "profitable" : "operating at a loss"}; ${c.headline.label} ${usd(c.headline.value)}${c.headline.unit}, runway ${runwayText(data.runway.base)}.`,
    support: [
      `Liquid ${usd(c.liquid)}, net burn ${usd(c.net_burn)}/mo, permission level ${data.guardrails.permission_level}.`,
      `Last logged action: ${data.action_log[0]?.description ?? "none recorded"}.`,
    ],
    action: "Ask about runway, treasury, spend/token cost, or revenue for a deeper read.",
  });
}

export async function POST(req: Request) {
  let message = "";
  let companyId: string | undefined;
  try {
    const body = await req.json();
    message = String(body.message ?? "");
    companyId = body.companyId ? String(body.companyId) : undefined;
  } catch {
    /* noop */
  }

  if (!message.trim()) {
    return NextResponse.json({ reply: "Ask me about runway, treasury, spend, or revenue." });
  }

  const reply = companyId
    ? await companyAnswer(message, companyId)
    : await portfolioAnswer(message);

  return NextResponse.json({ reply });
}
