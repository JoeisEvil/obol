"use client";

import useSWR from "swr";
import { fetcher, swrConfig, fmtUSD } from "@/lib/api";
import type { PortfolioSummary } from "@/lib/types";
import RunwayGauge from "./RunwayGauge";
import AgentStatusBar from "./AgentStatusBar";

export default function PortfolioView() {
  const { data } = useSWR<PortfolioSummary>("/api/portfolio", fetcher, swrConfig);

  const stale = !!data?.error || !!data?.stale;
  const loading = !data;

  const companies = data?.companies ?? [];
  const maxHeadline = Math.max(
    1,
    ...companies.map((c) => Math.abs(c.headline?.value ?? 0))
  );

  // Stablecoin breakdown across portfolio
  const stableTotal = companies.reduce(
    (s, c) =>
      s +
      (c.treasury ?? [])
        .filter((t) => t.kind === "usdc" || t.kind === "usdb")
        .reduce((a, t) => a + t.amount, 0),
    0
  );

  return (
    <>
      <div className="grid grid-3">
        {/* Runway */}
        <div className="card">
          <div className="card-title">
            Portfolio Runway
            {stale && <span className="stale-badge">stale</span>}
          </div>
          {loading ? (
            <div className="skel" style={{ height: 140 }} />
          ) : (
            <RunwayGauge runway={data!.runway} />
          )}
          {!loading && (
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)", textAlign: "center" }}>
              Net burn {fmtUSD(data!.portfolio_net_burn)}/mo
              {data!.portfolio_net_burn < 0 ? " · cashflow positive" : ""}
            </div>
          )}
        </div>

        {/* Treasury */}
        <div className="card">
          <div className="card-title">
            Total Treasury
            {stale && <span className="stale-badge">stale</span>}
          </div>
          {loading ? (
            <div className="skel" style={{ height: 140 }} />
          ) : (
            <>
              <div className="big-num pos">{fmtUSD(data!.portfolio_liquid)}</div>
              <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 4, fontFamily: "var(--mono)" }}>
                LIQUID ACROSS {data!.total_companies} COMPANIES
              </div>
              <div style={{ marginTop: 16 }}>
                <div className="kv">
                  <span className="k">Stablecoin holdings</span>
                  <span className="v">{fmtUSD(stableTotal)}</span>
                </div>
                <div className="kv">
                  <span className="k">Stablecoin yield / yr</span>
                  <span className="v" style={{ color: "var(--accent)" }}>
                    {fmtUSD(data!.stablecoin_yield_annual)}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">Portfolio MRR</span>
                  <span className="v">{fmtUSD(data!.portfolio_mrr)}/mo</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Agents */}
        <AgentStatusBar />
      </div>

      {/* P&L comparison */}
      <div className="section">
        <div className="section-head">Company P&amp;L Comparison</div>
        <div className="card">
          {loading &&
            [0, 1, 2].map((i) => (
              <div className="bar-row" key={i}>
                <span className="skel" style={{ height: 12 }} />
                <span className="skel" style={{ height: 8 }} />
                <span className="skel" style={{ height: 12 }} />
              </div>
            ))}
          {!loading && companies.length === 0 && <div className="empty">No companies.</div>}
          {!loading &&
            companies.map((c) => {
              const v = c.headline?.value ?? 0;
              const frac = Math.abs(v) / maxHeadline;
              const cls = v < 0 ? "neg" : "pos";
              return (
                <div className="bar-row" key={c.company_id}>
                  <span className="bar-label" title={c.name}>{c.name}</span>
                  <span className="bar-track">
                    <span className={`bar-fill ${cls}`} style={{ width: `${Math.max(frac * 100, 2)}%` }} />
                  </span>
                  <span className="bar-val" style={{ color: v < 0 ? "var(--red)" : "var(--text)" }}>
                    {fmtUSD(v)}
                    {c.headline?.unit}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
