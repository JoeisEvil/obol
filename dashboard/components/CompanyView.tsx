"use client";

import useSWR from "swr";
import { fetcher, swrConfig, fmtUSD, fmtTime } from "@/lib/api";
import type { CompanyOverview } from "@/lib/types";
import RunwayGauge from "./RunwayGauge";
import TreasuryPanel from "./TreasuryPanel";
import TokenCostMap from "./TokenCostMap";
import AgentStatusBar from "./AgentStatusBar";

export default function CompanyView({ companyId }: { companyId: string }) {
  const { data } = useSWR<CompanyOverview>(`/api/company/${companyId}`, fetcher, swrConfig);

  const stale = !!data?.error || !!data?.stale;
  const loading = !data || !data.company;

  return (
    <>
      <div className="topbar">
        <h1>{loading ? "Loading…" : data!.company.name}</h1>
        <span className="sub">
          {!loading && (
            <>
              {data!.company.type.toUpperCase()} · {data!.guardrails?.permission_level?.toUpperCase()} ·{" "}
              {data!.company.status?.toUpperCase()}
            </>
          )}
          {stale && <span className="stale-badge" style={{ marginLeft: 10 }}>stale</span>}
        </span>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="card-title">Runway</div>
          {loading ? (
            <div className="skel" style={{ height: 140 }} />
          ) : (
            <RunwayGauge runway={data!.runway} />
          )}
        </div>

        {loading ? (
          <div className="card">
            <div className="card-title">Treasury</div>
            <div className="skel" style={{ height: 140 }} />
          </div>
        ) : (
          <TreasuryPanel treasury={data!.metrics?.treasury} liquid={data!.metrics?.liquid} />
        )}

        <AgentStatusBar />
      </div>

      {/* Headline metrics strip */}
      {!loading && (
        <div className="section">
          <div className="card">
            <div className="grid grid-3" style={{ gap: 0 }}>
              <Metric label={data!.metrics.headline.label} value={`${fmtUSD(data!.metrics.headline.value)}${data!.metrics.headline.unit}`} accent={data!.metrics.profitable} />
              <Metric label="Net Burn / mo" value={`${fmtUSD(data!.metrics.net_burn)}`} />
              <Metric label="Past Due" value={fmtUSD(data!.metrics.past_due)} warn={data!.metrics.past_due > 0} />
            </div>
          </div>
        </div>
      )}

      {/* Token cost map */}
      <div className="section">
        <div className="section-head">Token Cost Map</div>
        {loading ? (
          <div className="card">
            <div className="skel" style={{ height: 160 }} />
          </div>
        ) : (
          <TokenCostMap
            workflows={data!.token_cost_map?.workflows ?? []}
            projects={data!.token_cost_map?.projects ?? []}
          />
        )}
      </div>

      {/* Action log */}
      <div className="section">
        <div className="section-head">Action Log</div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 16 }}>
              <div className="skel" style={{ height: 120 }} />
            </div>
          ) : (data!.action_log ?? []).length === 0 ? (
            <div className="empty">No actions logged.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Agent</th>
                  <th>Action</th>
                  <th className="num">Amount</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {data!.action_log.map((a) => (
                  <tr key={a.id}>
                    <td className="mono" style={{ color: "var(--text-dim)", fontSize: 11 }}>
                      {fmtTime(a.timestamp)}
                    </td>
                    <td className="mono" style={{ textTransform: "capitalize" }}>{a.agent}</td>
                    <td>
                      <div>{a.description}</div>
                      <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--mono)" }}>
                        {a.action_type}
                        {a.guardrail ? ` · ${a.guardrail}` : ""}
                      </div>
                    </td>
                    <td className="num">{a.amount_usd ? fmtUSD(a.amount_usd) : "—"}</td>
                    <td>
                      <span className={`outcome ${a.outcome}`}>{a.outcome}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div style={{ padding: "4px 18px", borderRight: "1px solid var(--border)" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-dim)", fontFamily: "var(--mono)", marginBottom: 8 }}>
        {label}
      </div>
      <div
        className="num"
        style={{
          fontSize: 22,
          fontWeight: 600,
          textAlign: "left",
          color: warn ? "var(--amber)" : accent ? "var(--accent)" : "var(--text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
