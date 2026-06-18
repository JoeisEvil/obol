import type { BudgetTree as Tree, BudgetNode } from "@/lib/types";
import { fmtUSD } from "@/lib/api";

function fillClass(pct: number | null): string {
  if (pct === null) return "fg";
  if (pct >= 90) return "fr";
  if (pct >= 70) return "fa";
  return "fg";
}

function width(pct: number | null): number {
  if (pct === null) return 6;
  return Math.max(2, Math.min(100, pct));
}

function planeLabel(p: string): string {
  return p === "spend" ? "spend" : "compute";
}

function Meter({ pct }: { pct: number | null }) {
  return (
    <div className="meter">
      <div className={`fill ${fillClass(pct)}`} style={{ width: `${width(pct)}%` }} />
      <div className="cap" style={{ left: "100%" }} />
    </div>
  );
}

function Usage({ node, suffix }: { node: BudgetNode; suffix?: string }) {
  const usedStr =
    Math.abs(node.used) < 10 && node.used !== Math.round(node.used)
      ? `$${node.used.toFixed(2)}`
      : fmtUSD(node.used);
  const capStr =
    node.cap === null
      ? "uncapped"
      : Math.abs(node.cap) < 10 && node.cap !== Math.round(node.cap)
        ? `/ $${node.cap.toFixed(2)}${suffix ?? ""}`
        : `/ ${fmtUSD(node.cap)}${suffix ?? ""}`;
  return (
    <div className="usage">
      <b>{usedStr}</b> <span className="den">{capStr}</span>
    </div>
  );
}

function spendAuthorityText(meta: Record<string, unknown>): {
  text: string;
  cls: string;
} {
  const authority = String(meta.spend_authority ?? "none");
  const single = Number(meta.spend_single_cap ?? 0);
  if (authority === "none") return { text: "spend: none", cls: "none" };
  if (authority === "execute" && single > 0)
    return { text: `execute ${fmtUSD(single)}`, cls: "exec" };
  if (authority === "execute") return { text: "execute: caps only", cls: "exec" };
  if (authority === "propose") return { text: "propose only", cls: "prop" };
  return { text: `spend: ${authority}`, cls: "" };
}

function SingleTree({ tree, label }: { tree: Tree; label?: string }) {
  const cn = tree.company_node;
  const computeKind = cn.kind;
  const companySuffix = computeKind === "compute" ? " compute" : " spend";

  return (
    <>
      {label ? (
        <div className="sect" style={{ marginTop: 18 }}>
          {label}
        </div>
      ) : null}

      {/* COMPANY — L1 */}
      <div className="node">
        <div className="name">
          <span className="lvl">L1</span>
          <span className="nmx s">{cn.label}</span>
        </div>
        <Meter pct={cn.pct} />
        <Usage node={cn} suffix={companySuffix} />
        <div className="authcol exec">
          {String((cn.meta?.permission_level as string) ?? tree.enforcement.permission_level).toUpperCase()}
        </div>
      </div>

      {/* AGENTS — L2 */}
      {tree.agents.map((a) => {
        const planes = (a.meta?.planes as string[]) ?? [];
        const auth = spendAuthorityText(a.meta ?? {});
        return (
          <div className="node ind1" key={a.key}>
            <div className="name tick-rail">
              <span className="lvl">L2</span>
              <span className="nmx" style={{ textTransform: "capitalize" }}>
                {a.label}
              </span>
              <span className="planes">
                {planes.map((p) => (
                  <span key={p} className={`plane p-${p === "spend" ? "spend" : "compute"}`}>
                    {planeLabel(p)}
                  </span>
                ))}
              </span>
            </div>
            <Meter pct={a.pct} />
            <Usage node={a} suffix={a.kind === "spend" ? " spend" : ""} />
            <div className={`authcol ${auth.cls}`}>{auth.text}</div>
          </div>
        );
      })}

      {/* WORKFLOWS — L3 */}
      {tree.workflows.map((w) => {
        const onBreach = String(w.meta?.on_breach ?? "");
        const near = w.pct !== null && w.pct >= 70;
        return (
          <div className="node ind2" key={w.key}>
            <div className="name tick-rail">
              <span className="lvl">L3</span>
              <span className="nmx">{w.label}</span>
              {near ? <span className="flag">▲ {Math.round(w.pct as number)}% — near cap</span> : null}
            </div>
            <Meter pct={w.pct} />
            <Usage node={w} />
            <div className="authcol">{onBreach ? `on breach: ${onBreach}` : ""}</div>
          </div>
        );
      })}

      {/* PROCESSES — L4 */}
      {tree.processes.map((p) => {
        const approveOver = p.meta?.requires_approval_over;
        const maxCalls = p.meta?.max_calls_per_run;
        return (
          <div className="node ind3" key={p.key}>
            <div className="name tick-rail">
              <span className="lvl">L4</span>
              <span className="nmx" style={{ fontSize: 13 }}>
                {p.label}
              </span>
            </div>
            <Meter pct={p.pct} />
            <Usage node={p} suffix=" run" />
            <div className="authcol">
              {approveOver != null
                ? `approve > ${fmtUSD(Number(approveOver))}`
                : maxCalls != null
                  ? `per-run · ${maxCalls}`
                  : ""}
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function BudgetTree({
  trees,
}: {
  trees: Tree[];
}) {
  const multi = trees.length > 1;
  return (
    <>
      <div className="legend">
        <span>
          <i className="fg" />
          under 70%
        </span>
        <span>
          <i className="fa" />
          70–90%
        </span>
        <span>
          <i className="fr" />
          over 90%
        </span>
        <span style={{ marginLeft: "auto" }}>│ = cap · spend &amp; compute are separate planes</span>
      </div>

      {trees.map((t) => (
        <SingleTree key={t.company.id} tree={t} label={multi ? t.company.name : undefined} />
      ))}
    </>
  );
}
