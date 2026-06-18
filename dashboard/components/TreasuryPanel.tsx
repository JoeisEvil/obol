"use client";

import type { TreasuryHolding } from "@/lib/types";
import { fmtUSD, fmtPct } from "@/lib/api";

const KIND_LABEL: Record<string, string> = {
  fiat: "Fiat",
  usdc: "USDC",
  usdb: "USDB",
  eur: "EUR",
};

export default function TreasuryPanel({
  treasury,
  liquid,
}: {
  treasury?: TreasuryHolding[];
  liquid?: number;
}) {
  const holdings = treasury ?? [];
  const total = liquid ?? holdings.reduce((s, h) => s + h.amount, 0);
  const annualYield = holdings.reduce((s, h) => s + (h.amount * h.apy) / 100, 0);

  return (
    <div className="card">
      <div className="card-title">Treasury</div>
      <div className="big-num pos">{fmtUSD(total)}</div>
      <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 4, fontFamily: "var(--mono)" }}>
        LIQUID · ~{fmtUSD(annualYield)}/yr yield
      </div>
      <div style={{ marginTop: 14 }}>
        {holdings.length === 0 && <div className="empty">No treasury holdings.</div>}
        {holdings.map((h, i) => (
          <div className="kv" key={`${h.kind}-${h.currency}-${i}`}>
            <span className="k">
              {KIND_LABEL[h.kind] ?? h.kind.toUpperCase()}
              <span style={{ color: "var(--text-faint)", marginLeft: 6 }}>{h.currency}</span>
            </span>
            <span className="v">
              {fmtUSD(h.amount)}
              <span style={{ color: "var(--accent)", marginLeft: 8 }}>{fmtPct(h.apy)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
