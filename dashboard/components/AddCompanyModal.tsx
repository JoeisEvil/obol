"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Type = "saas" | "trading-agent" | "agency" | "client";
type Conn = "direct_key" | "stripe_connect";
type Perm = "full" | "read_write" | "read_only";

const TYPES: { id: Type; label: string }[] = [
  { id: "saas", label: "SaaS" },
  { id: "trading-agent", label: "Trading Agent" },
  { id: "agency", label: "Agency" },
  { id: "client", label: "Client" },
];

const PERMS: { id: Perm; label: string }[] = [
  { id: "full", label: "Full" },
  { id: "read_write", label: "Read + Write" },
  { id: "read_only", label: "Read Only" },
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
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    account_name?: string;
    account_id?: string;
    error?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [perm, setPerm] = useState<Perm>("read_write");
  const [limitSingle, setLimitSingle] = useState(500);
  const [limitDaily, setLimitDaily] = useState(2000);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

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
        body: JSON.stringify({ company_name: name || "New Account", scopes: ["read_only"] }),
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
      setSubmitError("Could not enter the account into the ledger.");
      setSubmitting(false);
    }
  }

  const canNext1 = name.trim().length > 0;
  const canNext2 =
    (conn === "direct_key" && testResult?.valid) || (conn === "stripe_connect" && !!oauthUrl);

  if (!mounted) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Open a new account"
      >
        <div className="card-head">
          <div>
            <h2>Open a New Account</h2>
            <div className="steps">
              {[1, 2, 3].map((s) => (
                <span key={s} className={`step ${step >= s ? "on" : ""}`} />
              ))}
            </div>
          </div>
          <button className="x-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="card-body">
          {step === 1 && (
            <>
              <div className="field">
                <label>Account name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme AI"
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Class</label>
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
                <label>Connection</label>
                <div className="choice-grid">
                  <div
                    className={`choice ${conn === "direct_key" ? "sel" : ""}`}
                    onClick={() => setConn("direct_key")}
                  >
                    Present a Stripe key
                  </div>
                  <div
                    className={`choice ${conn === "stripe_connect" ? "sel" : ""}`}
                    onClick={() => setConn("stripe_connect")}
                  >
                    Request authorisation (Connect)
                  </div>
                </div>
              </div>

              {conn === "direct_key" && (
                <>
                  <div className="field">
                    <label>Stripe secret key</label>
                    <input
                      value={stripeKey}
                      onChange={(e) => {
                        setStripeKey(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="sk_live_…"
                    />
                  </div>
                  <button
                    className="btn ghost"
                    onClick={testConnection}
                    disabled={testing || !stripeKey.trim()}
                  >
                    {testing ? "Verifying…" : "Verify"}
                  </button>
                  {testResult &&
                    (testResult.valid ? (
                      <div>
                        <span className="stamp verified">VERIFIED</span>{" "}
                        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                          {testResult.account_name ?? "account"}
                        </span>
                      </div>
                    ) : (
                      <div className="result-box err">{testResult.error ?? "Invalid key"}</div>
                    ))}
                </>
              )}

              {conn === "stripe_connect" && (
                <>
                  <button className="btn ghost" onClick={genLink} disabled={linkLoading}>
                    {linkLoading ? "Generating…" : "Generate link"}
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
                          {copied ? "Copied ✓" : "Copy"}
                        </button>
                        <span style={{ fontSize: 11, color: "var(--amber)", fontFamily: "var(--mono)" }}>
                          Awaiting the counterparty&rsquo;s signature…
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
                <label>Authority</label>
                <div className="choice-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  {PERMS.map((p) => (
                    <div
                      key={p.id}
                      className={`choice ${perm === p.id ? "sel" : ""}`}
                      onClick={() => setPerm(p.id)}
                    >
                      {p.label}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field">
                  <label>Single spend limit ($)</label>
                  <input
                    type="number"
                    value={limitSingle}
                    onChange={(e) => setLimitSingle(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>Daily spend limit ($)</label>
                  <input
                    type="number"
                    value={limitDaily}
                    onChange={(e) => setLimitDaily(Number(e.target.value))}
                  />
                </div>
              </div>
              {submitError && <div className="result-box err">{submitError}</div>}
            </>
          )}
        </div>

        <div className="card-foot">
          <button className="btn ghost" onClick={() => (step === 1 ? onClose() : setStep(step - 1))}>
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button
              className="btn"
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
            >
              Continue
            </button>
          ) : (
            <button className="btn" onClick={submit} disabled={submitting}>
              {submitting ? "Entering…" : "Enter into the ledger"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
