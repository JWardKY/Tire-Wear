import React, { useState, useEffect, useMemo, useRef } from "react";
import { C, FD, FM } from "./theme.js";
import { Card, Field, Btn, inp } from "./ui.jsx";
import * as setup from "./setupData.js";

/* ── The supervisor gate ──────────────────────────────────────────
   The Supervisor section asks who you are before it opens. Everything
   else in the shop is open, because the mechanics have to be able to
   use it without a password in the way.

   It reuses the roster and the PINs that already exist rather than
   introducing a second shared secret. That is better in three ways:
   nothing new to remember, nothing to circulate when somebody leaves,
   and it records WHO looked rather than only that somebody did.

   Be clear about what this is. The Supabase key is in the page, so
   somebody determined can read the data whatever the screen shows.
   This keeps people out of screens they have no business wandering
   into. It is a door with a lock on it, not a vault. Hours and pay
   would need real per-person auth to be genuinely private, and
   HANDOFF.md says so.

   `what` names the section so the copy stays right if a second gated
   one is ever added; with one it reads "The supervisor tab". */

const KEY = "tirewear:supervisor";
const HOURS = 12;

function remember(u) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...u, at: Date.now() }));
  } catch { /* private window — they sign in again, which is fine */ }
}

export function readSupervisor() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!v?.id || !v.at) return null;
    /* Times out, because a supervisor screen left open on a shared
       tablet is the whole thing this is meant to prevent. */
    if (Date.now() - v.at > HOURS * 3600 * 1000) return null;
    return v;
  } catch { return null; }
}

export function forgetSupervisor() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to undo */ }
}

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clr", "0", "del"];
const ALLOWED = new Set(["dashboard", "admin"]);

export default function SupervisorGate({ what, onIn }) {
  const [roster, setRoster] = useState(null);
  const [picked, setPicked] = useState(null);
  const [buf, setBuf] = useState("");
  const [msg, setMsg] = useState("");
  const [working, setWorking] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    setup.listRoster()
      .then((r) => setRoster(r.filter((m) => m.active && ALLOWED.has(m.role))))
      .catch((e) => { setRoster([]); setMsg(e.message || String(e)); });
  }, []);

  /* Same shape as the timecard pad, and the same rule: this effect must
     not depend on the state it sets, or the cleanup cancels the run that
     would have re-enabled the buttons. */
  useEffect(() => {
    if (!picked || buf.length !== 4 || busy.current) return;
    let live = true;
    busy.current = true;
    (async () => {
      setWorking(true);
      try {
        const v = await setup.checkPin(picked.id, buf);
        if (!live) return;
        if (!v.ok) { setMsg(v.error); setBuf(""); return; }
        if (!ALLOWED.has(v.role)) {
          /* Should not happen — the list is filtered — but a role can
             change between the list loading and the PIN being typed. */
          setMsg("That account is not a supervisor."); setBuf(""); return;
        }
        const u = { id: picked.id, name: v.name || picked.name, role: v.role };
        remember(u);
        onIn(u);
      } catch (e) {
        if (live) { setMsg(e.message || String(e)); setBuf(""); }
      } finally {
        busy.current = false;
        setWorking(false);
      }
    })();
    return () => { live = false; };
  }, [buf, picked, onIn]);

  const tap = (k) => {
    setMsg("");
    if (k === "clr") return setBuf("");
    if (k === "del") return setBuf((b) => b.slice(0, -1));
    setBuf((b) => (b.length >= 4 ? b : b + k));
  };

  if (roster === null) {
    return <div style={{ padding: 40, color: C.muted }}>Checking the roster…</div>;
  }

  if (!roster.length) {
    return (
      <div style={{ maxWidth: 520, padding: 8 }}>
        <Card title={`The ${what.toLowerCase()} tab is for supervisors`}
          note="Nobody on the roster is marked Dashboard or Admin yet, so there is no one to let in. Set somebody's role under Supervisor → Mechanics — which needs a supervisor too, so the first one has to be set in the database.">
          <div />
        </Card>
      </div>
    );
  }

  if (!picked) {
    return (
      <div style={{ maxWidth: 560, padding: 8 }}>
        <Card title={`The ${what.toLowerCase()} tab is for supervisors`}
          note="Hours, timecards, the work log, the roster and the cost codes. Tap your name, then your four-digit PIN. It is the same PIN as your timecard.">
          <div style={{ display: "grid", gap: 7,
                        gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,185px),1fr))" }}>
            {roster.map((m) => (
              <button key={m.id} type="button"
                onClick={() => { setPicked(m); setBuf(""); setMsg(""); }}
                style={{ textAlign: "left", padding: "12px 14px", borderRadius: 6,
                         border: `1px solid ${m.pinSet ? C.line : C.watch}`,
                         background: "#fff", cursor: "pointer", fontFamily: FD,
                         fontSize: 15.5, fontWeight: 600, color: C.ink }}>
                {m.name}
                <div style={{ fontSize: 11, fontWeight: 400,
                              color: m.pinSet ? C.muted : C.watch,
                              textTransform: "uppercase", letterSpacing: "0.05em",
                              marginTop: 2 }}>
                  {m.locked ? "Locked out"
                    : m.pinSet ? (m.role === "admin" ? "Admin" : "Dashboard")
                    : "Set a PIN on the timecard first"}
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 340, padding: 8 }}>
      <Card title={picked.name} note="Enter your PIN">
        <div style={{ display: "flex", gap: 12, justifyContent: "center",
                      margin: "6px 0 18px" }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ width: 14, height: 14, borderRadius: "50%",
              border: `2px solid ${C.green700}`,
              background: i < buf.length ? C.green700 : "transparent" }} />
          ))}
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3,1fr)" }}>
          {PAD.map((k) => (
            <button key={k} type="button" disabled={working} onClick={() => tap(k)}
              style={{ padding: "16px 0", fontFamily: FD,
                fontSize: k === "clr" || k === "del" ? 13 : 24, fontWeight: 600,
                color: k === "clr" || k === "del" ? C.muted : C.ink,
                background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8,
                cursor: working ? "wait" : "pointer", textTransform: "uppercase",
                letterSpacing: k.length > 1 ? "0.05em" : 0 }}>
              {k === "clr" ? "Clear" : k === "del" ? "Delete" : k}
            </button>
          ))}
        </div>
        {msg && (
          <div style={{ fontSize: 13, color: C.pull, marginTop: 12,
                        fontWeight: 600, textAlign: "center" }}>{msg}</div>
        )}
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" onClick={() => { setPicked(null); setBuf(""); setMsg(""); }}
            style={{ background: "none", border: 0, color: C.muted, fontSize: 13,
                     cursor: "pointer", textDecoration: "underline" }}>
            Not me
          </button>
        </div>
      </Card>
    </div>
  );
}
