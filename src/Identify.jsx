import React, { useState } from "react";
import { ALLOWED_DOMAINS, domainOk, saveWho } from "./identity.js";
import { C, FB, FD } from "./theme.js";

export default function Identify({ onDone }) {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");

  function submit(e) {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    if (!domainOk(v)) {
      setErr(`Use your Allen Company email — an address ending @${ALLOWED_DOMAINS[0]}.`);
      return;
    }
    onDone(saveWho(v));
  }

  return (
    <div style={{ fontFamily: FB, background: C.paper, minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10,
        width: "100%", maxWidth: 420, overflow: "hidden",
        boxShadow: "0 14px 40px rgba(11,29,51,0.14)" }}>
        <div style={{ background: C.navy900, padding: "18px 20px",
          borderBottom: `3px solid ${C.gold}` }}>
          <div style={{ fontFamily: FD, fontSize: 11, letterSpacing: "0.22em",
            color: C.gold, fontWeight: 600, textTransform: "uppercase" }}>
            The Allen Company · Haul Division
          </div>
          <div style={{ fontFamily: FD, fontSize: 30, fontWeight: 700, color: "#fff",
            lineHeight: 1.05, marginTop: 2 }}>
            Tire Wear
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <form onSubmit={submit}>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55, margin: 0 }}>
              Who is entering data? Your email goes on every reading you take, so the
              shop can tell whose gauge a number came from.
            </p>
            <label style={{ display: "block", marginTop: 14 }}>
              <div style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 600,
                letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted,
                marginBottom: 4 }}>
                Allen Company email
              </div>
              <input type="email" value={email} autoFocus required
                autoComplete="email" inputMode="email"
                onChange={(e) => { setEmail(e.target.value); setErr(""); }}
                placeholder={`you@${ALLOWED_DOMAINS[0]}`}
                style={{ width: "100%", padding: "10px 12px",
                  border: `1px solid ${err ? C.pull : C.line}`, borderRadius: 5,
                  fontSize: 16, fontFamily: FB, outline: "none" }} />
            </label>
            {err && (
              <div style={{ fontSize: 13, color: C.pull, marginTop: 8, fontWeight: 600 }}>
                {err}
              </div>
            )}
            <button type="submit"
              style={{ width: "100%", marginTop: 16, background: C.navy700, color: "#fff",
                border: `1px solid ${C.navy700}`, fontFamily: FD, fontSize: 15,
                fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
                padding: "11px 15px", borderRadius: 5, cursor: "pointer" }}>
              Start
            </button>
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 0 }}>
              No password, and nothing to wait for. This device remembers you until you
              switch users.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
