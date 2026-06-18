"use client";

import { useRef, useState } from "react";

type Msg = { who: "user" | "bot"; text: string };

const PORTFOLIO_SUGGESTIONS = [
  "What's our runway?",
  "How is treasury looking?",
  "Show portfolio MRR",
  "Where is spend going?",
];
const COMPANY_SUGGESTIONS = [
  "What's the runway?",
  "How's treasury?",
  "Token cost breakdown",
  "Revenue & past due",
];

export default function ChatInterface({
  scope,
  companyId,
}: {
  scope: "portfolio" | "company";
  companyId?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      who: "bot",
      text:
        scope === "company"
          ? "Forecaster online for this company. Ask about runway, treasury, token spend, or revenue."
          : "Forecaster online. Ask about runway, treasury, spend, MRR/churn, or how a company is doing.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const suggestions = scope === "company" ? COMPANY_SUGGESTIONS : PORTFOLIO_SUGGESTIONS;

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setMessages((m) => [...m, { who: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, companyId: scope === "company" ? companyId : undefined }),
      });
      const json = await res.json();
      setMessages((m) => [...m, { who: "bot", text: json.reply ?? "No response." }]);
    } catch {
      setMessages((m) => [...m, { who: "bot", text: "Connection error — try again." }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 7px var(--accent)" }} />
        Forecaster Assistant
      </div>
      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => (
          <div className={`msg ${m.who}`} key={i}>
            <span className="msg-who">{m.who === "user" ? "YOU" : "FCX"}</span>
            <div className="msg-body">{m.text}</div>
          </div>
        ))}
        {busy && (
          <div className="msg bot">
            <span className="msg-who">FCX</span>
            <div className="msg-body" style={{ color: "var(--text-dim)" }}>analysing…</div>
          </div>
        )}
      </div>
      <div className="suggest">
        {suggestions.map((s) => (
          <button key={s} onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the Forecaster…"
          disabled={busy}
        />
        <button className="btn" type="submit" disabled={busy || !input.trim()}>
          SEND
        </button>
      </form>
    </div>
  );
}
