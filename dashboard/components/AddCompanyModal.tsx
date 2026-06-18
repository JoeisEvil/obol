"use client";

import { useState } from "react";

type Type = "saas" | "trading-agent" | "agency" | "client";
type Conn = "direct_key" | "stripe_connect";
type Perm = "full" | "read_write" | "read_only";

const TYPES: { id: Type; label: string }[] = [
  { id: "saas", label: "SaaS" },
  { id: "trading-agent", label: "Trading Agent" },
  { id: "agency", label: "Agency" },
  { id: "client", label: "Client" },
];

export default function AddCompanyModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [type, setType] = useState<Type>("saas");

  const [conn, setConn] = useState<Conn>("direct_key");
  const [stripeKey, setStripeKey] = useState("");
  const [testResult, setTestResult] = useState<{ valid: boolean; account_name?: string; account_id?: string; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [perm, setPerm] = useState<Perm>("read_write");
  const [limitSingle, setLimitSingle] = useState(500);
  const [limitDaily, setLimitDaily] = useState(2000);
  const [escalation, setEscalation] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/companies/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripe_key: stripeKey }),
      });
      setTestResult(await res.json());
    } catch {
      setTestResult({ valid: false, error: "Network error" });
    } finally {
      setTesting(false);
    }
  }

  async function genLink() {
    setLinkLoading(true);
    setOauthUrl(null);
    try {
      const res = await fetch("/api/companies/connect-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: name || "New Company", scopes: ["read_only"] }),
      });
      const json = await res.json();
      setOauthUrl(json.oauth_url ?? null);
    } catch {
      setOauthUrl(null);
    } finally {
      setLinkLoading(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        type,
        connection_type: conn,
        permission_level: perm,
        autonomous_limit_single: limitSingle,
        autonomous_limit_daily: limitDaily,
        escalation_contact: escalation,
      };
      if (conn === "direct_key" && stripeKey) body.stripe_key = stripeKey;
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) {
        setSubmitError(json.error);
        setSubmitting(false);
        return;
      }
      onAdded();
    } catch {
      setSubmitError("Failed to add company.");
      setSubmitting(false);
    }
  }

  const canNext1 = name.trim().length > 0;
  const canNext2 =
    (conn === "direct_key" && testResult?.valid) ||
    (conn === "stripe_connect" && !!oauthUrl);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Add Company</h2>
            <div className="modal-steps">
              {[1, 2, 3].map((s) => (
                <span key={s} className={`modal-step ${step >= s ? "on" : ""}`} />
              ))}
            </div>
          </div>
          <button className="x-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {step === 1 && (
            <>
              <div className="field">
                <label>Company Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." autoFocus />
              </div>
              <div className="field">
                <label>Type</label>
                <div className="choice-grid">
                  {TYPES.map((t) => (
                    <div
                      key={t.id}
                      className={`choice ${type === t.id ? "sel" : ""}`}
                      onClick={() => setType(t.id)}
                    >
                      {t.label}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="field">
                <label>Connection Method</label>
                <div className="choice-grid">
                  <div className={`choice ${conn === "direct_key" ? "sel" : ""}`} onClick={() => setConn("direct_key")}>
                    I have a Stripe key
                  </div>
                  <div className={`choice ${conn === "stripe_connect" ? "sel" : ""}`} onClick={() => setConn("stripe_connect")}>
                    Generate Connect link
                  </div>
                </div>
              </div>

              {conn === "direct_key" && (
                <>
                  <div className="field">
                    <label>Stripe Secret Key</label>
                    <input
                      value={stripeKey}
                      onChange={(e) => { setStripeKey(e.target.value); setTestResult(null); }}
                      placeholder="sk_test_..."
                    />
                  </div>
                  <button className="btn ghost" onClick={testConnection} disabled={testing || !stripeKey.trim()}>
                    {testing ? "Testing…" : "Test connection"}
                  </button>
                  {testResult && (
                    <div className={`result-box ${testResult.valid ? "ok" : "err"}`}>
                      {testResult.valid
                        ? `✓ Connected — ${testResult.account_name ?? "account"} (${testResult.account_id ?? "—"})`
                        : `✗ ${testResult.error ?? "Invalid key"}`}
                    </div>
                  )}
                </>
              )}

              {conn === "stripe_connect" && (
                <>
                  <button className="btn ghost" onClick={genLink} disabled={linkLoading}>
                    {linkLoading ? "Generating…" : "Generate Connect link"}
                  </button>
                  {oauthUrl && (
                    <>
                      <div className="oauth-link">{oauthUrl}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          className="btn ghost"
                          onClick={() => {
                            navigator.clipboard?.writeText(oauthUrl);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          }}
                        >
                          {copied ? "Copied ✓" : "Copy link"}
                        </button>
                        <span style={{ fontSize: 11, color: "var(--amber)", fontFamily: "var(--mono)" }}>
                          Waiting for authorisation…
                        </span>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="field">
                <label>Permission Level</label>
                <div className="choice-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  {(["full", "read_write", "read_only"] as Perm[]).map((p) => (
                    <div key={p} className={`choice ${perm === p ? "sel" : ""}`} onClick={() => setPerm(p)}>
                      {p.replace("_", " ")}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field">
                  <label>Single Limit ($)</label>
                  <input type="number" value={limitSingle} onChange={(e) => setLimitSingle(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>Daily Limit ($)</label>
                  <input type="number" value={limitDaily} onChange={(e) => setLimitDaily(Number(e.target.value))} />
                </div>
              </div>
              <div className="field">
                <label>Escalation Contact</label>
                <input value={escalation} onChange={(e) => setEscalation(e.target.value)} placeholder="ops@company.com" />
              </div>
              {submitError && <div className="result-box err">{submitError}</div>}
            </>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={() => (step === 1 ? onClose() : setStep(step - 1))}>
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button
              className="btn"
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
            >
              Next
            </button>
          ) : (
            <button className="btn" onClick={submit} disabled={submitting}>
              {submitting ? "Adding…" : "Confirm & Add"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
