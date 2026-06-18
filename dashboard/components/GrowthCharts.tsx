import type { GrowthView, MonthPoint } from "@/lib/types";
import { fmtUSD } from "@/lib/api";

function kfmt(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return fmtUSD(n);
}

function monthLabel(m: string): string {
  const [, mm] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return names[Number(mm) - 1] ?? m;
}

function pctDelta(first: number, last: number): { txt: string; up: boolean } {
  if (first === 0) return { txt: "▲", up: true };
  const d = ((last - first) / Math.abs(first)) * 100;
  const up = d >= 0;
  return { txt: `${up ? "▲" : "▼"} ${Math.abs(Math.round(d))}%`, up };
}

// map a value into a y coordinate within [yTop, yBot] given [min,max]
function yScale(v: number, min: number, max: number, yTop: number, yBot: number): number {
  if (max === min) return yBot;
  const t = (v - min) / (max - min);
  return yBot - t * (yBot - yTop);
}

function xScale(i: number, n: number, xLeft: number, xRight: number): number {
  if (n <= 1) return xLeft;
  return xLeft + (i / (n - 1)) * (xRight - xLeft);
}

export default function GrowthCharts({ growth }: { growth: GrowthView }) {
  const months: MonthPoint[] = growth.months ?? [];
  const n = months.length;
  const first = months[0];
  const last = months[n - 1];
  const per = growth.per_company ?? [];

  if (n === 0) {
    return <div className="psub" style={{ marginTop: 20 }}>No growth data available.</div>;
  }

  // ---- panel 1: MRR area+line ----
  const mrrVals = months.map((m) => m.mrr);
  const mrrMax = Math.max(...mrrVals) * 1.15 || 1;
  const mrrMin = 0;
  const p1Pts = months.map((m, i) => ({
    x: xScale(i, n, 34, 340),
    y: yScale(m.mrr, mrrMin, mrrMax, 20, 130),
  }));
  const p1Line = p1Pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const p1Area = `${p1Line} L${p1Pts[n - 1].x.toFixed(1)},130 L34,130 Z`;
  const mrrDelta = pctDelta(first.mrr, last.mrr);

  // ---- panel 2: revenue by account, stacked bars ----
  const saas = per.find((c) => c.type === "saas") ?? per[0];
  const trading = per.find((c) => c.type === "trading-agent") ?? per[1];
  const stacks = months.map((_, i) => {
    const a = saas?.months[i];
    const b = trading?.months[i];
    const aVal = a ? a.mrr || a.pnl : 0;
    const bVal = b ? b.mrr || b.pnl : 0;
    return { aVal, bVal, total: aVal + bVal };
  });
  const stackMax = Math.max(...stacks.map((s) => s.total)) * 1.1 || 1;
  const barW = 22;
  const slotW = (340 - 44) / n;
  const p2DeltaTotal = last.mrr + last.pnl;

  // ---- panel 3: runway projection band ----
  // project treasury forward using last net change; build base + bear lines over ~11 future steps
  const treas = months.map((m) => m.treasury);
  const lastTreas = treas[n - 1];
  const monthlyNet = n > 1 ? treas[n - 1] - treas[n - 2] : 0;
  const steps = 11;
  const baseProj: number[] = [];
  const bearProj: number[] = [];
  for (let i = 0; i <= steps; i++) {
    baseProj.push(lastTreas + monthlyNet * i);
    bearProj.push(lastTreas - Math.abs(monthlyNet) * 0.6 * i);
  }
  const allProj = [...baseProj, ...bearProj, 0];
  const projMax = Math.max(...allProj) * 1.05;
  const projMin = Math.min(...allProj, 0);
  const projX = (i: number) => xScale(i, steps + 1, 34, 340);
  const projY = (v: number) => yScale(v, projMin, projMax, 30, 130);
  const baseLine = baseProj.map((v, i) => `${i === 0 ? "M" : "L"}${projX(i).toFixed(1)},${projY(v).toFixed(1)}`).join(" ");
  const bearLine = bearProj.map((v, i) => `${i === 0 ? "M" : "L"}${projX(i).toFixed(1)},${projY(v).toFixed(1)}`).join(" ");
  const bandPath = `${baseLine} ${bearProj.map((v, i) => `L${projX(steps - i).toFixed(1)},${projY(bearProj[steps - i]).toFixed(1)}`).join(" ")} Z`;
  const zeroY = projY(0);
  const runwayMo = monthlyNet < 0 ? Math.min(steps, Math.floor(lastTreas / Math.abs(monthlyNet))) : steps;

  // ---- panel 4: inference margin (bars receding + margin line) ----
  const tokVals = months.map((m) => m.token_cost);
  const tokMax = Math.max(...tokVals) * 1.15 || 1;
  const marVals = months.map((m) => m.margin);
  const marMin = Math.min(...marVals) - 0.05;
  const marMax = Math.max(...marVals) + 0.05;
  const p4MarLine = months
    .map((m, i) => {
      const x = 54 + i * ((294 - 54) / Math.max(1, n - 1));
      const y = yScale(m.margin, marMin, marMax, 28, 100);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const marDelta = Math.round((last.margin - first.margin) * 100);

  // ---- panel 5: cumulative treasury (full width) ----
  const tMax = Math.max(...treas) * 1.08 || 1;
  const tMin = Math.min(...treas) * 0.85;
  const p5Pts = treas.map((v, i) => ({
    x: xScale(i, n, 40, 1030),
    y: yScale(v, tMin, tMax, 24, 150),
  }));
  const p5Line = p5Pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const p5Area = `${p5Line} L${p5Pts[n - 1].x.toFixed(1)},150 L40,150 Z`;
  const stagedIdx = Math.max(0, n - 2);
  const treasDelta = last.treasury - first.treasury;

  const midIdx = Math.floor((n - 1) / 2);

  return (
    <div className="grid2">
      {/* 1. Recurring revenue */}
      <div className="panel">
        <div className="phead">
          <span className="ptitle">Recurring revenue</span>
          <span className="pval">
            {kfmt(last.mrr)}
            <span className={`delta ${mrrDelta.up ? "up" : "down"}`}>{mrrDelta.txt}</span>
          </span>
        </div>
        <div className="psub">Monthly recurring across all accounts</div>
        <svg className="chart" viewBox="0 0 340 150" height={150}>
          <line className="gridline" x1="34" y1="20" x2="340" y2="20" />
          <line className="gridline" x1="34" y1="60" x2="340" y2="60" />
          <line className="gridline" x1="34" y1="100" x2="340" y2="100" />
          <line className="axis" x1="34" y1="130" x2="340" y2="130" />
          <text className="axlab" x="0" y="23">{kfmt(mrrMax)}</text>
          <text className="axlab" x="0" y="103">{kfmt(mrrMax / 3)}</text>
          <defs>
            <linearGradient id="fill1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#b0432f" stopOpacity="0.14" />
              <stop offset="1" stopColor="#b0432f" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={p1Area} fill="url(#fill1)" />
          <path d={p1Line} fill="none" className="stroke-red" strokeWidth="2" />
          <circle cx={p1Pts[n - 1].x} cy={p1Pts[n - 1].y} r="3.5" fill="#b0432f" />
          <text className="axlab" x="30" y="145">{monthLabel(first.month)}</text>
          <text className="axlab" x="150" y="145">{monthLabel(months[midIdx].month)}</text>
          <text className="axlab" x="315" y="145">{monthLabel(last.month)}</text>
        </svg>
      </div>

      {/* 2. Revenue by account */}
      <div className="panel">
        <div className="phead">
          <span className="ptitle">Revenue by account</span>
          <span className="pval">
            {kfmt(p2DeltaTotal)}
            <span className="delta up">▲</span>
          </span>
        </div>
        <div className="psub">Composition — SaaS vs trading agent</div>
        <svg className="chart" viewBox="0 0 340 150" height={150}>
          <line className="axis" x1="34" y1="130" x2="340" y2="130" />
          <text className="axlab" x="6" y="33">{kfmt(stackMax)}</text>
          <text className="axlab" x="6" y="113">{kfmt(stackMax / 5)}</text>
          <g>
            {stacks.map((s, i) => {
              const x = 44 + i * slotW + (slotW - barW) / 2;
              const aH = (s.aVal / stackMax) * 110;
              const bH = (s.bVal / stackMax) * 110;
              const aY = 130 - aH;
              const bY = aY - bH;
              return (
                <g key={i}>
                  <rect x={x} y={aY} width={barW} height={Math.max(0, aH)} fill="#4a7355" opacity="0.85" />
                  <rect x={x} y={bY} width={barW} height={Math.max(0, bH)} fill="#42566e" opacity="0.7" />
                </g>
              );
            })}
          </g>
        </svg>
        <div className="chart-legend">
          <span>
            <i style={{ background: "#4a7355" }} />
            {saas?.name ?? "SaaS"}
          </span>
          <span>
            <i style={{ background: "#42566e" }} />
            {trading?.name ?? "Trading"}
          </span>
        </div>
      </div>

      {/* 3. Runway projection */}
      <div className="panel">
        <div className="phead">
          <span className="ptitle">Runway projection</span>
          <span className="pval">
            {runwayMo}
            <span style={{ fontSize: 13, color: "var(--ink-2)" }}> mo</span>
          </span>
        </div>
        <div className="psub">Cash trajectory with bear / bull band</div>
        <svg className="chart" viewBox="0 0 340 150" height={150}>
          <line className="axis" x1="34" y1="130" x2="340" y2="130" />
          <line className="gridline" x1="34" y1={zeroY} x2="340" y2={zeroY} />
          <text className="axlab" x="2" y={zeroY + 3} fill="#b0432f">zero</text>
          <path d={bandPath} fill="#42566e" opacity="0.10" />
          <path d={baseLine} fill="none" className="stroke-blue" strokeWidth="2" />
          <path d={bearLine} fill="none" stroke="#b0432f" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
          <circle cx={projX(0)} cy={projY(baseProj[0])} r="3" fill="#42566e" />
          <text className="axlab" x="28" y="145">now</text>
          <text className="axlab" x="300" y="145">+{steps}mo</text>
        </svg>
        <div className="chart-legend">
          <span>
            <i style={{ background: "#42566e" }} />
            base case
          </span>
          <span>
            <i style={{ background: "#b0432f" }} />
            bear case
          </span>
        </div>
      </div>

      {/* 4. Inference margin */}
      <div className="panel">
        <div className="phead">
          <span className="ptitle">Inference margin</span>
          <span className="pval">
            {Math.round(last.margin * 100)}%
            <span className={`delta ${marDelta >= 0 ? "up" : "down"}`}>
              {marDelta >= 0 ? "▲" : "▼"} {Math.abs(marDelta)}pt
            </span>
          </span>
        </div>
        <div className="psub">Revenue per dollar of token spend, trending</div>
        <svg className="chart" viewBox="0 0 340 150" height={150}>
          <line className="axis" x1="34" y1="130" x2="340" y2="130" />
          {months.map((m, i) => {
            const x = 44 + i * ((340 - 44) / n);
            const h = (m.token_cost / tokMax) * 60;
            return <rect key={i} x={x} y={130 - h} width="20" height={h} fill="#b08a3f" opacity="0.4" />;
          })}
          <path d={p4MarLine} fill="none" className="stroke-green" strokeWidth="2" />
          <circle
            cx={54 + (n - 1) * ((294 - 54) / Math.max(1, n - 1))}
            cy={yScale(last.margin, marMin, marMax, 28, 100)}
            r="3.5"
            fill="#4a7355"
          />
        </svg>
        <div className="chart-legend">
          <span>
            <i style={{ background: "#b08a3f", opacity: 0.5 }} />
            token cost
          </span>
          <span>
            <i style={{ background: "#4a7355" }} />
            margin %
          </span>
        </div>
      </div>

      {/* 5. Cumulative treasury (full width) */}
      <div className="panel full">
        <div className="phead">
          <span className="ptitle">Cumulative treasury — net position build</span>
          <span className="pval">
            {fmtUSD(last.treasury)}
            <span className="delta up">▲ {fmtUSD(treasDelta)} this period</span>
          </span>
        </div>
        <div className="psub">Total liquid across all accounts and rails, penned in as it settles</div>
        <svg className="chart" viewBox="0 0 1080 170" height={170}>
          <line className="gridline" x1="40" y1="24" x2="1080" y2="24" />
          <line className="gridline" x1="40" y1="68" x2="1080" y2="68" />
          <line className="gridline" x1="40" y1="112" x2="1080" y2="112" />
          <line className="axis" x1="40" y1="150" x2="1080" y2="150" />
          <text className="axlab" x="2" y="27">{kfmt(tMax)}</text>
          <text className="axlab" x="2" y="71">{kfmt((tMax + tMin) / 2)}</text>
          <text className="axlab" x="2" y="115">{kfmt(tMin)}</text>
          <defs>
            <linearGradient id="fill5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4a7355" stopOpacity="0.16" />
              <stop offset="1" stopColor="#4a7355" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={p5Area} fill="url(#fill5)" />
          <path d={p5Line} fill="none" className="stroke-green" strokeWidth="2.5" />
          <circle cx={p5Pts[n - 1].x} cy={p5Pts[n - 1].y} r="4.5" fill="#4a7355" />
          <circle cx={p5Pts[n - 1].x} cy={p5Pts[n - 1].y} r="9" fill="none" stroke="#4a7355" strokeWidth="1" opacity="0.4" />
          <text
            x={p5Pts[n - 1].x - 50}
            y={Math.max(14, p5Pts[n - 1].y - 12)}
            fontFamily="JetBrains Mono, monospace"
            fontSize="11"
            fontWeight="500"
            fill="#4a7355"
          >
            {fmtUSD(last.treasury)}
          </text>
          <line
            x1={p5Pts[stagedIdx].x}
            y1={p5Pts[stagedIdx].y}
            x2={p5Pts[stagedIdx].x}
            y2="150"
            stroke="#b0432f"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.5"
          />
          <text className="axlab" x={p5Pts[stagedIdx].x - 26} y="164" fill="#b0432f">USDB staged</text>
          <text className="axlab" x="34" y="164">{monthLabel(first.month)}</text>
          <text className="axlab" x="520" y="164">{monthLabel(months[midIdx].month)}</text>
          <text className="axlab" x="1010" y="164">{monthLabel(last.month)}</text>
        </svg>
      </div>
    </div>
  );
}
