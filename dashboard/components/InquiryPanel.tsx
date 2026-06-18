"use client";

import { useState } from "react";
import type { ReactNode } from "react";

function renderAnswer(text: string): ReactNode[] {
  // wrap $ figures in <span class="n">
  const parts = text.split(/(\$[0-9][0-9,]*(?:\.[0-9]+)?(?:\/(?:mo|yr))?|\+\$[0-9][0-9,]*)/g);
  return parts.map((p, i) =>
    /^\+?\$/.test(p) ? (
      <span className="n" key={i}>
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export default function InquiryPanel({ companyId }: { companyId?: string }) {
  const [question, setQuestion] = useState("What's our overall runway?");
  const [answer, setAnswer] = useState<string>(
    "Ask the ledger about runway, treasury, spend, or revenue — answers are penned from live data."
  );
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const msg = draft.trim();
    if (!msg || pending) return;
    setQuestion(msg);
    setDraft("");
    setPending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, companyId }),
      });
      const json = await res.json();
      setAnswer(json.reply ?? "No reply.");
    } catch {
      setAnswer("Could not reach the ledger. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ask">
      <div className="q">
        <b>Q</b>
        {question}
      </div>
      <div className="a">
        {answer.split("\n").map((line, i) => (
          <div key={i}>{renderAnswer(line)}</div>
        ))}
      </div>
      <form onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask the ledger anything"
          disabled={pending}
        />
        <span className="cur" />
      </form>
    </div>
  );
}
