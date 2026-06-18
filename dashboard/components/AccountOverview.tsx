"use client";

import useSWR from "swr";
import type { CompanyOverview } from "@/lib/types";
import { fetcher, swrConfig, fmtUSD } from "@/lib/api";
import Masthead from "./Masthead";
import SubNav from "./SubNav";
import MetricStrip from "./MetricStrip";
import WorkflowLedger from "./WorkflowLedger";
import ActionsJournal from "./ActionsJournal";
import InquiryPanel from "./InquiryPanel";
import StaleBadge, { RuledShimmer } from "./StaleBadge";

function runwayLabel(n: number | null): string {
  return n === null ? "∞" : `${Math.round(n)}`;
}

export default function AccountOverview({ companyId }: { companyId: string }) {
  const { data } = useSWR<CompanyOverview>(`/api/company/${companyId}`, fetcher, swrConfig);

  const stale = !data || data.stale || !!data.error;
  const hasData = data && data.company && data.metrics;

  const ro = data?.guardrails?.permission_level === "read_only";
  const m = data?.metrics;

  // treasury breakdown
  let usdc = 0;
  let usdb = 0;
  let fiat = 0;
  m?.treasury?.forEach((t) => {
    if (t.kind === "usdc") usdc += t.amount;
    else if (t.kind === "usdb") usdb += t.amount;
    else fiat += t.amount;
  });

  const base = data?.runway?.base ?? null;
  const bear = data?.runway?.bear ?? null;
  const bull = data?.runway?.bull ?? null;

  const title = hasData ? data!.company.name : "Account";
  const type = data?.company?.type ?? "—";
  const perm = data?.guardrails?.permission_level ?? "—";

  return (
    <>
      <Masthead
        title={title}
        crumb={hasData ? `Folio · ${data!.company.slug}` : "Account"}
        metaRight={
          <>
            {stale && hasData ? (
              <>
                <StaleBadge />
                <br />
              </>
            ) : null}
            Class: <b>{type}</b> · Authority: <b>{perm}</b>
            <br />
            <span className={`stamp${ro ? " ro" : ""}`}>{ro ? "READ ONLY" : "ACTIVE"}</span>
          </>
        }
      />
      <SubNav scope={companyId} active="overview" />

      {!hasData ? (
        <RuledShimmer rows={6} />
      ) : (
        <>
          <MetricStrip
            account={{ value: data!.company.name, sub: data!.company.type, small: true }}
            runway={{
              value: runwayLabel(base),
              unit: "mo",
              sub: `bear ${runwayLabel(bear)} · bull ${runwayLabel(bull)}`,
            }}
            treasury={{
              value: fmtUSD(m!.liquid),
              sub: `USDC ${Math.round(usdc / 1000)} · USDB ${Math.round(usdb / 1000)} · USD ${Math.round(fiat / 1000)}`,
            }}
            standing={{
              value: m!.profitable ? "Profitable" : "At a loss",
              sub: `net burn ${fmtUSD(m!.net_burn)}/mo`,
              good: m!.profitable,
            }}
            balance={{ value: fmtUSD(m!.liquid), sub: "running" }}
          />

          <WorkflowLedger tokenCostMap={data!.token_cost_map} />
          <ActionsJournal entries={data!.action_log ?? []} />
          <InquiryPanel companyId={companyId} />
        </>
      )}
    </>
  );
}
