"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import type { RegistryList, PortfolioSummary, CompanyMetrics } from "@/lib/types";
import { fetcher, fmtUSD } from "@/lib/api";
import AddCompanyModal from "./AddCompanyModal";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const railCfg = { refreshInterval: 60000, revalidateOnFocus: false, keepPreviousData: true } as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export default function IndexTabsRail() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);

  const { data: reg, mutate } = useSWR<RegistryList>("/api/companies", fetcher, railCfg);
  const { data: portfolio } = useSWR<PortfolioSummary>("/api/portfolio", fetcher, railCfg);

  const companies = reg?.companies ?? [];
  const metricsById = new Map<string, CompanyMetrics>();
  portfolio?.companies?.forEach((c) => metricsById.set(c.company_id, c));

  const summaryActive =
    pathname === "/" || pathname === "/budget" || pathname === "/growth";

  return (
    <>
      <nav className="rail">
        <Link href="/" className={`tab summary${summaryActive ? " active" : ""}`}>
          <div className="lt">§ 00</div>
          <div className="nm">Summary</div>
          <div className="fig">portfolio</div>
        </Link>

        {companies.map((c, i) => {
          const ro = c.permission_level === "read_only";
          const m = metricsById.get(c.id);
          let fig: string | null = null;
          if (ro) {
            fig = "read-only";
          } else if (m) {
            const isMrr = m.headline.label === "MRR";
            fig = isMrr
              ? `${fmtUSD(m.headline.value)} ▲`
              : `${fmtUSD(m.headline.value, { sign: m.headline.value > 0 })} ▲`;
          }
          const active = pathname === `/${c.id}` || pathname.startsWith(`/${c.id}/`);
          return (
            <Link
              key={c.id}
              href={`/${c.id}`}
              className={`tab${ro ? " ro" : ""}${active ? " active" : ""}`}
            >
              <div className="lt">
                {LETTERS[i] ?? "·"} {pad(i + 1)}
              </div>
              <div className="nm">{c.name}</div>
              {fig ? <div className="fig">{fig}</div> : null}
            </Link>
          );
        })}

        <button className="tab add" onClick={() => setOpen(true)} type="button">
          <div className="lt">+ NEW</div>
          <div className="nm">Open account</div>
        </button>
      </nav>

      {open && (
        <AddCompanyModal
          onClose={() => setOpen(false)}
          onAdded={() => {
            setOpen(false);
            mutate();
          }}
        />
      )}
    </>
  );
}
