"use client";

import type { Runway } from "@/lib/types";

const MAX_MONTHS = 24;

export default function RunwayGauge({ runway }: { runway?: Runway }) {
  const base = runway?.base ?? null;
  const profitable = base === null;

  // Arc geometry — semicircle
  const r = 70;
  const cx = 90;
  const cy = 90;
  const circ = Math.PI * r; // half circumference
  const frac = profitable ? 1 : Math.min(base / MAX_MONTHS, 1);
  const dash = circ * frac;

  const color = profitable
    ? "var(--accent)"
    : base < 6
    ? "var(--red)"
    : base < 12
    ? "var(--amber)"
    : "var(--accent)";

  return (
    <div className="gauge-wrap">
      <svg width="180" height="104" viewBox="0 0 180 104">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="var(--border)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.3s" }}
        />
        <text
          x={cx}
          y={cy - 18}
          textAnchor="middle"
          fontFamily="var(--mono)"
          fontSize={profitable ? 19 : 30}
          fontWeight="600"
          fill={color}
        >
          {profitable ? "PROFITABLE" : base}
        </text>
        {!profitable && (
          <text
            x={cx}
            y={cy + 2}
            textAnchor="middle"
            fontFamily="var(--mono)"
            fontSize="11"
            fill="var(--text-dim)"
          >
            MONTHS
          </text>
        )}
      </svg>

      <div className="gauge-scenarios">
        <div className="gauge-scn bear">
          <div className="lbl">Bear</div>
          <div className="val">{runway?.bear === null || runway?.bear === undefined ? "∞" : runway.bear + "m"}</div>
        </div>
        <div className="gauge-scn">
          <div className="lbl">Base</div>
          <div className="val">{profitable ? "∞" : base + "m"}</div>
        </div>
        <div className="gauge-scn bull">
          <div className="lbl">Bull</div>
          <div className="val">{runway?.bull === null || runway?.bull === undefined ? "∞" : runway.bull + "m"}</div>
        </div>
      </div>
    </div>
  );
}
