"use client";

import useSWR from "swr";
import type { AgentStatus } from "@/lib/types";
import { fetcher, swrConfig, fmtTime } from "@/lib/api";

const NAMES = ["sentinel", "comptroller", "treasurer", "forecaster"] as const;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function AgentSeals() {
  const { data } = useSWR<AgentStatus>("/api/agent-status", fetcher, swrConfig);

  const agents =
    data?.agents && data.agents.length
      ? data.agents
      : NAMES.map((name) => ({ name, status: "active" as const, mode: "" }));

  const last = data?.last_action;

  return (
    <div className="foot">
      <span className="lab">Agents</span>
      {agents.map((a) => (
        <span
          key={a.name}
          className={`seal${a.status !== "active" ? " idle" : ""}`}
        >
          <span className="disc">
            <span className="mk">{cap(a.name).charAt(0)}</span>
          </span>
          <span className="nm">{cap(a.name)}</span>
        </span>
      ))}
      <span className="last">
        {last ? (
          <>
            <div className="t">{last.description}</div>
            <div className="m">
              {last.agent.toUpperCase()} · {fmtTime(last.timestamp)} · LOGGED
            </div>
          </>
        ) : (
          <>
            <div className="t">No actions logged yet</div>
            <div className="m">LEDGER · STANDING BY</div>
          </>
        )}
      </span>
    </div>
  );
}
