"use client";

import type { ProjectCost } from "@/lib/types";
import { fmtUSD } from "@/lib/api";

export default function TokenCostMap({
  workflows,
  projects,
}: {
  workflows: { workflow: string; cost: number }[];
  projects: ProjectCost[];
}) {
  const maxWf = Math.max(1, ...workflows.map((w) => w.cost));

  const utilOf = (p: ProjectCost) => {
    if (p.utilization !== null && p.utilization !== undefined) return p.utilization;
    if (p.cap > 0) return (p.spend / p.cap) * 100;
    return 0;
  };

  return (
    <div className="card">
      <div className="card-title">Token Cost Map</div>

      <div style={{ marginBottom: 18 }}>
        <div className="section-head" style={{ fontSize: 9, marginBottom: 8 }}>
          Workflows
        </div>
        {workflows.length === 0 && <div className="empty">No workflow costs.</div>}
        {workflows.map((w) => {
          const frac = w.cost / maxWf;
          const cls = frac > 0.75 ? "amber" : frac > 0.45 ? "blue" : "pos";
          return (
            <div className="bar-row" key={w.workflow}>
              <span className="bar-label" title={w.workflow}>{w.workflow}</span>
              <span className="bar-track">
                <span className={`bar-fill ${cls}`} style={{ width: `${Math.max(frac * 100, 3)}%` }} />
              </span>
              <span className="bar-val">{fmtUSD(w.cost)}</span>
            </div>
          );
        })}
      </div>

      <div>
        <div className="section-head" style={{ fontSize: 9, marginBottom: 8 }}>
          Project Caps
        </div>
        {projects.length === 0 && <div className="empty">No projects.</div>}
        {projects.map((p) => {
          const util = utilOf(p);
          const atCap = util >= 100;
          const cls = atCap ? "neg" : util > 80 ? "amber" : "pos";
          return (
            <div className="bar-row" key={`${p.project}-${p.provider}`}>
              <span className="bar-label" title={`${p.project} · ${p.provider}`}>
                {p.project}
              </span>
              <span className="bar-track">
                <span className={`bar-fill ${cls}`} style={{ width: `${Math.min(util, 100)}%` }} />
              </span>
              <span className="bar-val">
                {Math.round(util)}%
                <span style={{ color: "var(--text-faint)", marginLeft: 4 }}>
                  {fmtUSD(p.cap)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
