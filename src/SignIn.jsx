import React, { useState } from "react";
import { supabase } from "./supabase.js";
import { C, FB, FD } from "./theme.js";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [msg, setMsg] = useState("");

  async function send(e) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setState("error");
      setMsg(error.message);
    } else {
      setState("sent");
    }
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
          {state === "sent" ? (
            <>
              <div style={{ fontFamily: FD, fontSize: 19, fontWeight: 700, color: C.navy900 }}>
                Check your email
              </div>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55, marginTop: 6 }}>
                We sent a sign-in link to <strong style={{ color: C.ink }}>{email.trim()}</strong>.
                Open it on this device and you are in — there is no password to remember.
              </p>
              <button onClick={() => setState("idle")}
                style={{ background: "none", border: "none", padding: 0, marginTop: 10,
                  color: C.navy600, fontWeight: 600, fontSize: 13.5, cursor: "pointer",
                  textDecoration: "underline", textUnderlineOffset: 2 }}>
                Use a different address
              </button>
            </>
          ) : (
            <form onSubmit={send}>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55, marginTop: 0 }}>
                Sign in with your Allen email. We will send you a link — no password.
              </p>
              <label style={{ display: "block", marginTop: 14 }}>
                <div style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 600,
                  letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted,
                  marginBottom: 4 }}>
                  Email
                </div>
                <input type="email" value={email} autoFocus required
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@theallen.com"
                  style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.line}`,
                    borderRadius: 5, fontSize: 15, fontFamily: FB, outline: "none" }} />
              </label>
              {state === "error" && (
                <div style={{ fontSize: 13, color: C.pull, marginTop: 10, fontWeight: 600 }}>
                  {msg}
                </div>
              )}
              <button type="submit" disabled={state === "sending"}
                style={{ width: "100%", marginTop: 16, background: C.navy700, color: "#fff",
                  border: `1px solid ${C.navy700}`, fontFamily: FD, fontSize: 15,
                  fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
                  padding: "11px 15px", borderRadius: 5,
                  cursor: state === "sending" ? "wait" : "pointer",
                  opacity: state === "sending" ? 0.6 : 1 }}>
                {state === "sending" ? "Sending…" : "Send sign-in link"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
