import type { ActionLogEntry } from "@/lib/types";
import { fmtUSD, fmtTime } from "@/lib/api";

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short" });
  } catch {
    return fmtTime(iso);
  }
}

export default function ActionsJournal({ entries }: { entries: ActionLogEntry[] }) {
  return (
    <>
      <div className="sect">Journal of actions</div>
      <div className="journal">
        {entries.length === 0 ? (
          <div className="jrow">
            <span className="date">—</span>
            <span className="who">ledger</span>
            <span className="desc">No actions recorded yet.</span>
            <span className="amt">—</span>
            <span className="wax" />
          </div>
        ) : (
          entries.map((e) => {
            const escalated = /escalat/i.test(e.outcome);
            return (
              <div key={e.id} className={`jrow${escalated ? " out-escalated" : ""}`}>
                <span className="date">{shortDate(e.timestamp)}</span>
                <span className="who">{e.agent}</span>
                <span className="desc">{e.description}</span>
                <span className="amt">{e.amount_usd ? fmtUSD(e.amount_usd) : "—"}</span>
                <span className="wax" />
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
