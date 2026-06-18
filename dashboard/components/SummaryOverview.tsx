"use client";

import useSWR from "swr";
import type { PortfolioSummary } from "@/lib/types";
import { fetcher, swrConfig, fmtUSD } from "@/lib/api";
import Masthead from "./Masthead";
import SubNav from "./SubNav";
import MetricStrip from "./MetricStrip";
import AccountsOfRecord from "./AccountsOfRecord";
import AgentSeals from "./AgentSeals";
import InquiryPanel from "./InquiryPanel";
import StaleBadge, { RuledShimmer } from "./StaleBadge";

function runwayLabel(n: number | null): string {
  return n === null ? "—" : `${Math.round(n)}`;
}

export default function SummaryOverview() {
  const { data } = useSWR<PortfolioSummary>("/api/portfolio", fetcher, swrConfig);

  const stale = !data || data.stale || !!data.error;
  const hasData = data && data.companies;

  // treasury breakdown
  let usdc = 0;
  let usdb = 0;
  let fiat = 0;
  data?.companies?.forEach((c) =>
    c.treasury?.forEach((t) => {
      if (t.kind === "usdc") usdc += t.amount;
      else if (t.kind === "usdb") usdb += t.amount;
      else fiat += t.amount;
    })
  );

  const base = data?.runway?.base ?? null;
  const bear = data?.runway?.bear ?? null;
  const bull = data?.runway?.bull ?? null;
  const standing =
    base === null
      ? data && data.portfolio_pnl > 0
        ? "Profitable"
        : "Building"
      : `${runwayLabel(base)}mo runway`;

  const meta = (
    <>
      {data?.total_companies ?? "—"} accounts · {data?.companies?.filter((c) => c.profitable).length ?? "—"} profitable
      <br />
      <b>{fmtUSD(data?.portfolio_liquid)}</b> liquid · runway{" "}
      <b>{base === null ? (bear !== null ? `${runwayLabel(bear)}mo bear` : "—") : `${runwayLabel(base)} mo`}</b>
      <br />
      <span className="kept">kept by LEDGER — autonomous</span>
    </>
  );

  return (
    <>
      <Masthead
        title="Summary"
        crumb="Portfolio · No.001"
        metaRight={
          <>
            {stale && hasData ? (
              <>
                <StaleBadge />
                <br />
              </>
            ) : null}
            {meta}
          </>
        }
      />
      <SubNav scope="portfolio" active="overview" />

      {!hasData ? (
        <RuledShimmer rows={6} />
      ) : (
        <>
          <MetricStrip
            account={{ value: "Consolidated", sub: "all entities", small: true }}
            runway={{
              value: base === null ? "∞" : runwayLabel(base),
              unit: "mo",
              sub: `bear ${runwayLabel(bear)} · bull ${runwayLabel(bull)}`,
            }}
            treasury={{
              value: fmtUSD(data!.portfolio_liquid),
              sub: `USDC ${Math.round(usdc / 1000)} · USDB ${Math.round(usdb / 1000)} · USD ${Math.round(fiat / 1000)}`,
            }}
            standing={{
              value: standing,
              sub: `+${fmtUSD(data!.stablecoin_yield_annual)}/yr stablecoin yield`,
              good: data!.portfolio_pnl > 0,
            }}
            balance={{ value: fmtUSD(data!.portfolio_liquid), sub: "running" }}
          />

          <AccountsOfRecord companies={data!.companies} />
          <AgentSeals />
          <InquiryPanel />
        </>
      )}
    </>
  );
}
