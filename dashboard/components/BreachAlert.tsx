"use client";

import { useState } from "react";
import type { Breach } from "@/lib/types";
import { fmtUSD } from "@/lib/api";

export default function BreachAlert({
  breach,
  onApproved,
}: {
  breach: Breach;
  onApproved?: () => void;
}) {
  const [approved, setApproved] = useState(false);
  const [pending, setPending] = useState(false);

  if (!breach) return null;

  async function approve() {
    if (!breach) return;
    setPending(true);
    try {
      const res = await fetch("/api/budget/approve-downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: breach.company_id,
          workflow: breach.workflow,
          from_model: breach.from_model,
          to_model: breach.to_model,
          est_savings: breach.est_savings,
        }),
      });
      const json = await res.json();
      if (!json.error) {
        setApproved(true);
        onApproved?.();
      }
    } catch {
      /* keep button */
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="breach">
      <span className="ic">!</span>
      <span className="tx">
        <b>{breach.workflow}</b> ({breach.company_name}) hit{" "}
        <span className="mono">{Math.round(breach.pct)}%</span> of its{" "}
        <span className="mono">{fmtUSD(breach.cap)}</span> monthly compute cap. Comptroller proposes
        downgrading the workflow from <span className="mono">{breach.from_model}</span> →{" "}
        <span className="mono">{breach.to_model}</span> — saves{" "}
        <span className="mono">~{fmtUSD(breach.est_savings)}/mo</span>, holds quality on this task.
        Caught <b>before</b> the overage, synchronously.
      </span>
      {approved ? (
        <span className="stamp verified">APPROVED ✓</span>
      ) : (
        <button className="act" onClick={approve} disabled={pending} type="button">
          {pending ? "SEALING…" : "APPROVE DOWNGRADE"}
        </button>
      )}
    </div>
  );
}
