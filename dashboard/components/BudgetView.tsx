"use client";

import useSWR from "swr";
import type { BudgetView as BV } from "@/lib/types";
import { fetcher, swrConfig, fmtUSD } from "@/lib/api";
import Masthead from "./Masthead";
import SubNav from "./SubNav";
import BudgetTree from "./BudgetTree";
import BreachAlert from "./BreachAlert";
import StaleBadge, { RuledShimmer } from "./StaleBadge";

export default function BudgetView({ scope }: { scope: "portfolio" | string }) {
  const url =
    scope === "portfolio" ? "/api/budget?scope=portfolio" : `/api/company/${scope}/budget`;
  const { data, mutate } = useSWR<BV>(url, fetcher, swrConfig);

  const stale = !data || data.stale || !!data.error;
  const hasData = data && data.trees;

  const t = data?.totals;
  const isPortfolio = scope === "portfolio";
  const firstTree = data?.trees?.[0];
  const enforcement = firstTree?.enforcement;

  const crumb = isPortfolio
    ? "Portfolio · this month"
    : `${firstTree?.company.name ?? "Account"} · this month`;

  return (
    <>
      <Masthead
        title="Budget"
        crumb={crumb}
        metaRight={
          <>
            {stale && hasData ? (
              <>
                <StaleBadge />
                <br />
              </>
            ) : null}
            Enforcement <b>synchronous</b> · hard-stop{" "}
            <b>{enforcement?.hard_stop === false ? "off" : "on"}</b>
            <br />
            {t ? (
              <>
                Compute {fmtUSD(t.compute_used)} / {t.compute_cap === null ? "—" : fmtUSD(t.compute_cap)} · Spend{" "}
                {fmtUSD(t.spend_used)} / {t.spend_cap === null ? "—" : fmtUSD(t.spend_cap)}
              </>
            ) : null}
          </>
        }
      />
      <SubNav scope={scope} active="budget" />

      {!hasData ? (
        <RuledShimmer rows={8} />
      ) : (
        <>
          <BudgetTree trees={data!.trees} />
          <BreachAlert breach={data!.breach} onApproved={() => mutate()} />
        </>
      )}
    </>
  );
}
