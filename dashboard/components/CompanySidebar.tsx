"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher, fmtUSD } from "@/lib/api";
import type { RegistryList, RegistryCompany } from "@/lib/types";
import AddCompanyModal from "./AddCompanyModal";

function dotClass(c: RegistryCompany): string {
  const status = (c.status || "").toLowerCase();
  const perm = (c.permission_level || "").toLowerCase();
  if (perm === "read_only") return "grey";
  if (status === "active") return "green";
  if (status === "paused") return "amber";
  return "grey";
}

export default function CompanySidebar({ active }: { active: string }) {
  const { data, mutate } = useSWR<RegistryList>("/api/companies", fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const { data: portfolio } = useSWR<{ companies?: { company_id: string; headline?: { label: string; value: number; unit: string } }[] }>(
    "/api/portfolio",
    fetcher,
    { refreshInterval: 60000, keepPreviousData: true }
  );
  const [modalOpen, setModalOpen] = useState(false);

  const companies = data?.companies ?? [];
  const headlineFor = (id: string) =>
    portfolio?.companies?.find((c) => c.company_id === id)?.headline;

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <span className="dot" />
          LEDGER
        </div>
        <div className="tag">FINANCIAL OS</div>
      </div>

      <div className="sidebar-list">
        <Link
          href="/"
          className={`side-item portfolio ${active === "portfolio" ? "active" : ""}`}
        >
          <div className="side-row">
            <span className="status-dot green" />
            <span className="side-name">LEDGER PORTFOLIO</span>
          </div>
        </Link>

        {!data &&
          [0, 1, 2].map((i) => (
            <div key={i} className="side-item">
              <div className="skel" style={{ height: 14, width: "70%" }} />
              <div className="skel" style={{ height: 10, width: "40%", marginTop: 8 }} />
            </div>
          ))}

        {companies.map((c) => {
          const h = headlineFor(c.id);
          return (
            <Link
              key={c.id}
              href={`/${c.id}`}
              className={`side-item ${active === c.id ? "active" : ""}`}
            >
              <div className="side-row">
                <span className={`status-dot ${dotClass(c)}`} />
                <span className="side-name">{c.name}</span>
              </div>
              <div className="side-meta">
                <span className="badge">{c.type}</span>
                {h && (
                  <span className="side-headline">
                    {h.label} <b>{fmtUSD(h.value)}</b>
                    {h.unit}
                  </span>
                )}
              </div>
            </Link>
          );
        })}

        {data && companies.length === 0 && (
          <div className="empty">No companies yet.</div>
        )}
      </div>

      <div className="sidebar-foot">
        <button className="add-btn" onClick={() => setModalOpen(true)}>
          + ADD COMPANY
        </button>
      </div>

      {modalOpen && (
        <AddCompanyModal
          onClose={() => setModalOpen(false)}
          onAdded={() => {
            mutate();
            setModalOpen(false);
          }}
        />
      )}
    </aside>
  );
}
