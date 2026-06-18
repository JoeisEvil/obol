"use client";

import useSWR from "swr";
import type { GrowthView as GV } from "@/lib/types";
import { fetcher, swrConfig } from "@/lib/api";
import Masthead from "./Masthead";
import SubNav from "./SubNav";
import GrowthCharts from "./GrowthCharts";
import StaleBadge, { RuledShimmer } from "./StaleBadge";

export default function GrowthView({ scope }: { scope: "portfolio" | string }) {
  const url =
    scope === "portfolio" ? "/api/growth?scope=portfolio" : `/api/company/${scope}/growth`;
  const { data } = useSWR<GV>(url, fetcher, swrConfig);

  const stale = !data || data.stale || !!data.error;
  const hasData = data && data.months;

  const months = data?.months ?? [];
  const first = months[0];
  const last = months[months.length - 1];
  let deltaPct = 0;
  if (first && last) {
    const a = first.mrr + first.pnl;
    const b = last.mrr + last.pnl;
    deltaPct = a > 0 ? Math.round(((b - a) / a) * 100) : 0;
  }
  const netNew = first && last ? last.mrr + last.pnl - (first.mrr + first.pnl) : 0;

  const isPortfolio = scope === "portfolio";

  return (
    <>
      <Masthead
        title="Growth"
        crumb={`${isPortfolio ? "Portfolio" : data?.scope ?? "Account"} · trailing ${months.length || 6}mo`}
        metaRight={
          <>
            {stale && hasData ? (
              <>
                <StaleBadge />
                <br />
              </>
            ) : null}
            Combined MRR + P&amp;L <b>↑ {deltaPct}%</b> over period
            <br />
            Net new revenue <b>${Math.round(netNew).toLocaleString("en-US")}/mo</b>
          </>
        }
      />
      <SubNav scope={scope} active="growth" />

      {!hasData ? <RuledShimmer rows={6} /> : <GrowthCharts growth={data!} />}
    </>
  );
}
