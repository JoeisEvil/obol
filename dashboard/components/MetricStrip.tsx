import RunningBalance from "./RunningBalance";

export type MetricStripProps = {
  account: { value: string; sub: string; small?: boolean };
  runway: { value: string; unit?: string; sub: string };
  treasury: { value: string; sub: string };
  standing: { value: string; sub: string; good?: boolean };
  balance: { value: string; sub: string };
};

export default function MetricStrip({
  account,
  runway,
  treasury,
  standing,
  balance,
}: MetricStripProps) {
  return (
    <div className="strip">
      <div className="col">
        <div className="lab">Account</div>
        <div className="val" style={{ fontSize: account.small ? 19 : undefined }}>
          {account.value}
        </div>
        <div className="sub">{account.sub}</div>
      </div>
      <div className="col">
        <div className="lab">Runway</div>
        <div className="val mono">
          {runway.value}
          {runway.unit ? (
            <span style={{ fontSize: 14, color: "var(--ink-2)" }}> {runway.unit}</span>
          ) : null}
        </div>
        <div className="sub">{runway.sub}</div>
      </div>
      <div className="col">
        <div className="lab">Treasury</div>
        <div className="val mono">{treasury.value}</div>
        <div className="sub">{treasury.sub}</div>
      </div>
      <div className="col">
        <div className="lab">Standing</div>
        <div
          className={`val${standing.good ? " g" : ""}`}
          style={{ fontSize: 18 }}
        >
          {standing.value}
        </div>
        <div className="sub">{standing.sub}</div>
      </div>
      <div className="col bal">
        <div className="tick">↑ live</div>
        <div className="lab">Balance</div>
        <RunningBalance value={balance.value} />
        <div className="sub">{balance.sub}</div>
      </div>
    </div>
  );
}
