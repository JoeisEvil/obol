"use client";

import useSWR from "swr";
import { fetcher, swrConfig, fmtUSD } from "@/lib/api";
import type { AgentStatus } from "@/lib/types";

const AGENT_ORDER = ["sentinel", "comptroller", "treasurer", "forecaster"] as const;

export default function AgentStatusBar() {
  const { data } = useSWR<AgentStatus>("/api/agent-status", fetcher, swrConfig);

  const stale = !!data?.error || !!data?.stale;
  const agents = data?.agents ?? [];
  const last = data?.last_action ?? null;

  const modeFor = (name: string) =>
    agents.find((a) => a.name === name)?.mode ?? "—";

  return (
    <div className="card">
      <div className="card-title">
        Agents
        {stale && <span className="stale-badge">stale</span>}
      </div>
      <div className="agent-bar">
        <div className="agent-dots">
          {AGENT_ORDER.map((name) => (
            <div className="agent-chip" key={name}>
              <span className="pulse" />
              <div>
                <div className="nm">{name}</div>
                <div className="md">{data ? modeFor(name) : "…"}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="agent-last">
          {last ? (
            <>
              <b>{last.agent}</b> · {last.description}{" "}
              {last.amount_usd ? `(${fmtUSD(last.amount_usd)})` : ""} —{" "}
              <span className={`outcome ${last.outcome}`}>{last.outcome}</span>
            </>
          ) : data ? (
            "No recent agent activity."
          ) : (
            <span className="skel" style={{ display: "inline-block", height: 10, width: 220 }} />
          )}
        </div>
      </div>
    </div>
  );
}
