"use client";

import { useRouter } from "next/navigation";
import type { CompanyMetrics } from "@/lib/types";
import { fmtUSD } from "@/lib/api";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function readOnly(c: CompanyMetrics): boolean {
  // portfolio metrics don't carry permission; treat profitable + no spend signal otherwise.
  // read-only companies are flagged via permission level upstream; fall back to false.
  return (c as unknown as { permission_level?: string }).permission_level === "read_only";
}

export default function AccountsOfRecord({
  companies,
}: {
  companies: CompanyMetrics[];
}) {
  const router = useRouter();
  return (
    <>
      <div className="sect">Accounts of record</div>
      {companies.map((c, i) => {
        const ro = readOnly(c);
        const isMrr = c.headline.label === "MRR";
        const amt = isMrr
          ? fmtUSD(c.headline.value)
          : fmtUSD(c.headline.value, { sign: c.headline.value > 0 });
        const note = ro ? "read-only" : isMrr ? "MRR cr." : "P&L cr.";
        return (
          <div
            key={c.company_id}
            className={`acct${ro ? " muted" : ""}`}
            onClick={() => router.push(`/${c.company_id}`)}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push(`/${c.company_id}`);
            }}
            style={{ cursor: "pointer" }}
          >
            <span className={`seal-dot${ro ? "" : " g"}`} />
            <span className="nm">{c.name}</span>
            <span className="tag">{c.type}</span>
            <span className="sp" />
            <span className="amt">{amt}</span>
            <span className="note">{note}</span>
            <span className="fol">→ {LETTERS[i] ?? "·"}</span>
          </div>
        );
      })}
    </>
  );
}
