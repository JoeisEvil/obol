import type { CompanyOverview } from "@/lib/types";
import { fmtUSD } from "@/lib/api";

export default function WorkflowLedger({
  tokenCostMap,
}: {
  tokenCostMap: CompanyOverview["token_cost_map"];
}) {
  const workflows = tokenCostMap.workflows ?? [];
  const projects = tokenCostMap.projects ?? [];

  const rows = workflows.map((w) => {
    const isWin = /win|revenue|profit/i.test(w.workflow);
    return { label: w.workflow, amount: w.cost, credit: isWin, over: false };
  });

  return (
    <>
      <div className="sect">Workflow ledger</div>
      <div className="wfledger">
        {rows.length === 0 ? (
          <div className="wfrow">
            <span className="nm">No workflows recorded</span>
            <span className="lead" />
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.label} className={`wfrow${r.over ? " overruled" : ""}`}>
              <span className="nm">{r.label}</span>
              <span className="lead">
                {" "}
                {"·".repeat(60)}
              </span>
              {r.credit ? (
                <span className="cr">cr. {fmtUSD(r.amount)}</span>
              ) : (
                <span className="dr">dr. {fmtUSD(r.amount)}</span>
              )}
              {r.over ? <span className="overnote">over-ruled</span> : null}
            </div>
          ))
        )}

        {projects.map((p) => {
          const over = (p.utilization ?? 0) >= 100 || p.spend >= p.cap;
          return (
            <div key={`${p.project}:${p.provider}`} className={`wfrow${over ? " overruled" : ""}`}>
              <span className="nm">
                {p.project} · {p.provider}
              </span>
              <span className="lead"> {"·".repeat(60)}</span>
              <span className="dr">dr. {fmtUSD(p.spend)}</span>
              {over ? <span className="overnote">over-ruled</span> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
