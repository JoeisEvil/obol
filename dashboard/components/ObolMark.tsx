"use client";

import { useId } from "react";

export type ObolVariant = "full" | "flat" | "mono" | "reversed";

// The Obol minted mark. `full` is the gradient master with milled edge + bevel;
// it auto-downgrades to `flat` below 24px (gradient detail muds at small sizes).
export default function ObolMark({
  size = 32,
  variant = "full",
  title = "Obol",
}: {
  size?: number;
  variant?: ObolVariant;
  title?: string;
}) {
  const raw = useId().replace(/[:]/g, "");
  const v: ObolVariant = variant === "full" && size < 24 ? "flat" : variant;
  const common = { width: size, height: size, viewBox: "0 0 200 200", role: "img" as const };

  if (v === "flat") {
    return (
      <svg {...common} aria-label={title}>
        <circle cx="100" cy="100" r="90" fill="#c08a2e" />
        <rect x="76" y="76" width="48" height="48" rx="5" fill="#f3efe7" />
      </svg>
    );
  }

  if (v === "mono") {
    return (
      <svg {...common} aria-label={title}>
        <circle cx="100" cy="100" r="90" fill="#23211c" />
        <rect x="76" y="76" width="48" height="48" rx="5" fill="#f3efe7" />
      </svg>
    );
  }

  if (v === "reversed") {
    return (
      <svg {...common} aria-label={title}>
        <circle cx="100" cy="100" r="88" fill="none" stroke="#e8c46a" strokeWidth="6" />
        <rect x="76" y="76" width="48" height="48" rx="5" fill="none" stroke="#e8c46a" strokeWidth="6" />
      </svg>
    );
  }

  // full master
  const cx = 100;
  const cy = 100;
  const rO = 90.5;
  const rI = 86;
  const n = 72;
  const ticks = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ticks.push(
      <line
        key={i}
        x1={(cx + Math.cos(a) * rI).toFixed(2)}
        y1={(cy + Math.sin(a) * rI).toFixed(2)}
        x2={(cx + Math.cos(a) * rO).toFixed(2)}
        y2={(cy + Math.sin(a) * rO).toFixed(2)}
      />,
    );
  }

  return (
    <svg {...common} aria-label={`${title} coin`}>
      <defs>
        <radialGradient id={`oc${raw}`} cx="36%" cy="30%" r="80%">
          <stop offset="0" stopColor="#f3d98f" />
          <stop offset="0.42" stopColor="#d29c3c" />
          <stop offset="0.8" stopColor="#a8761f" />
          <stop offset="1" stopColor="#6e4a12" />
        </radialGradient>
        <radialGradient id={`oh${raw}`} cx="50%" cy="40%" r="75%">
          <stop offset="0" stopColor="#eee3cd" />
          <stop offset="1" stopColor="#c4b393" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="92" fill={`url(#oc${raw})`} />
      <circle cx="100" cy="100" r="92" fill="none" stroke="#6e4a12" strokeWidth="2.5" />
      <g stroke="#6e4a12" strokeWidth="1.6" opacity="0.5">
        {ticks}
      </g>
      <circle cx="100" cy="100" r="80" fill="none" stroke="#6e4a12" strokeWidth="1.4" opacity="0.45" />
      <rect x="76" y="76" width="48" height="48" rx="5" fill={`url(#oh${raw})`} />
      <rect x="76" y="76" width="48" height="48" rx="5" fill="none" stroke="#6e4a12" strokeWidth="2.5" />
      <rect x="79" y="79" width="42" height="42" rx="4" fill="none" stroke="#f3d98f" strokeWidth="1" opacity="0.5" />
      <ellipse cx="72" cy="62" rx="34" ry="20" fill="#fff" opacity="0.14" transform="rotate(-32 72 62)" />
    </svg>
  );
}
