import React, { useState, useEffect, useCallback } from "react";
import { C } from "./theme.js";
import { Btn, Field, Modal, SectionLabel, inp, th, td } from "./ui.jsx";
import * as setup from "./setupData.js";
import { parseCodes, planCodes } from "./codePaste.js";

/* ── Setup ────────────────────────────────────────────────────────
   The roster and the cost codes. Both tables existed from the start
   and had no screen, which is a large part of why the roster is empty
   and nobody has a PIN.

   Nothing here can read a PIN. Adding a mechanic leaves it unset so
   they pick their own the first time they sign in, and Reset clears it
   so they can pick again. There is no path to reveal one — it is a
   bcrypt hash and the browser is not granted the column. */

export default function SetupSection({ who, tab, onBusy }) {
  const [roster, setRoster] = useState([]);
  const [codes, setCodes] = useState([]);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([setup.listRoster(), setup.listAllCostCodes()]);
      setRoster(r); setCodes(c); setErr("");
    } catch (e) { setErr(e.message || String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, msg) => {
    onBusy?.(true); setErr(""); setNote("");
    try { await fn(); if (msg) setNote(msg); await load(); }
    catch (e) { setErr(e.message || String(e)); }
    finally { onBusy?.(false); }
  };

  return (
    <div>
      {err && <div style={banner(C.pull)}>{err}</div>}
      {note && <div style={banner(C.good)}>{note}</div>}
      {tab === "codes"
        ? <Codes codes={codes} run={run} />
        : <Roster roster={roster} run={run} />}
    </div>
  );
}

const banner = (bg) => ({
  background: bg, color: "#fff", padding: "8px 12px", borderRadius: 4,
  marginBottom: 12, fontSize: 13,
});

/* ── Roster ────────────────────────────────────────────────────── */

function Roster({ roster, run }) {
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(null);

  const [role, setRole] = useState("mechanic");

  const add = async () => {
    const r = await setup.addMechanic(name, role, email);
    if (!r?.ok) throw new Error(r?.error || "Could not add that mechanic.");
    setAdding(false); setEmail(""); setName(""); setRole("mechanic");
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 10 }}>
        <SectionLabel>Mechanics</SectionLabel>
        <Btn onClick={() => setAdding(true)}>+ ADD MECHANIC</Btn>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>Name</th><th style={th}>Role</th>
            <th style={th}>PIN</th><th style={th}>On the roster</th>
            <th style={th}></th>
          </tr></thead>
          <tbody>
            {roster.map((m) => (
              <tr key={m.id}>
                <td style={td}>
                  {m.name}
                  {m.email && (
                    <div style={{ fontSize: 11, color: C.muted }}>{m.email}</div>
                  )}
                </td>
                <td style={td}>
                  <select style={{ ...inp, maxWidth: 150 }} value={m.role}
                    onChange={(e) => run(
                      () => setup.setRole(m.id, e.target.value),
                      `${m.name} is now ${e.target.value}.`)}>
                    <option value="mechanic">Mechanic</option>
                    <option value="dashboard">Dashboard</option>
                    <option value="admin">Admin/Dashboard</option>
                  </select>
                </td>
                <td style={td}>
                  {m.locked
                    ? <span style={{ color: C.pull }}>locked out</span>
                    : m.pinSet
                      ? <span style={{ color: C.good }}>set</span>
                      : <span style={{ color: C.muted }}>not set yet</span>}
                </td>
                <td style={td}>{m.active ? "yes" : "no"}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {m.pinSet && (
                    <Btn tone="ghost" onClick={() => setConfirm(m)}>RESET PIN</Btn>
                  )}{" "}
                  <Btn tone="ghost" onClick={() => run(
                    () => setup.setMechanicActive(m.id, !m.active),
                    m.active ? `${m.name} taken off the roster.`
                             : `${m.name} back on the roster.`)}>
                    {m.active ? "REMOVE" : "RESTORE"}
                  </Btn>
                </td>
              </tr>
            ))}
            {!roster.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={5}>
                Nobody on the roster yet. Add somebody and they set their own PIN
                the first time they tap their name on the timecard tab.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ color: C.muted, fontSize: 12, marginTop: 12, maxWidth: 620 }}>
        <b>Reset PIN</b> clears a mechanic's PIN so they can set a new one the
        next time they sign in. Nobody, including you, can read an existing
        one — they are hashed.
      </p>

      {adding && (
        <Modal title="Add a mechanic" onClose={() => setAdding(false)}>
          <Field label="Name">
            <input style={inp} value={name} autoFocus
                   onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Role">
            <select style={inp} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="mechanic">Mechanic</option>
              <option value="dashboard">Dashboard</option>
              <option value="admin">Admin/Dashboard</option>
            </select>
          </Field>
          <Field label="Company email, if they have one">
            <input style={inp} value={email} type="email"
                   placeholder="leave blank if not"
                   onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <p style={{ color: C.muted, fontSize: 12 }}>
            Email is optional — most of the shop signs in by tapping their name on
            the timecard tab. They pick their own PIN the first time they do.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn tone="ghost" onClick={() => setAdding(false)}>CANCEL</Btn>
            <Btn disabled={!name.trim()}
                 onClick={() => run(add, "Added.")}>ADD</Btn>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title={`Reset ${confirm.name}'s PIN?`} onClose={() => setConfirm(null)}>
          <p style={{ fontSize: 14 }}>
            Their current PIN stops working immediately and they choose a new
            one next time they sign in. Their hours are not touched.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn tone="ghost" onClick={() => setConfirm(null)}>CANCEL</Btn>
            <Btn onClick={() => { const m = confirm; setConfirm(null);
              run(async () => {
                const r = await setup.resetPin(m.id);
                if (!r?.ok) throw new Error(r?.error || "Could not reset it.");
              }, `${m.name} can set a new PIN now.`); }}>
              RESET IT
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── Cost codes ────────────────────────────────────────────────── */

function Codes({ codes, run }) {
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [plan, setPlan] = useState(null);
  const [adding, setAdding] = useState(false);
  const [one, setOne] = useState({ code: "", name: "" });

  const preview = () => setPlan(planCodes(parseCodes(text), codes, replace));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 10 }}>
        <SectionLabel>Cost codes · {codes.filter((c) => c.active).length}</SectionLabel>
        <Btn onClick={() => setAdding(true)}>+ ADD CODE</Btn>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 22 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>Code</th><th style={th}>Name</th>
            <th style={th}>In use</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.code} style={{ opacity: c.active ? 1 : 0.5 }}>
                <td style={{ ...td, fontFamily: "monospace" }}>{c.code}</td>
                <td style={td}>{c.name}</td>
                <td style={td}>{c.active ? "yes" : "no"}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <Btn tone="ghost" onClick={() => run(
                    () => setup.setCostCodeActive(c.code, !c.active),
                    c.active ? `${c.code} retired.` : `${c.code} back in use.`)}>
                    {c.active ? "RETIRE" : "RESTORE"}
                  </Btn>
                </td>
              </tr>
            ))}
            {!codes.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={4}>
                No cost codes yet. Paste the sheet in below.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <SectionLabel>Paste the rest of the sheet</SectionLabel>
      <p style={{ color: C.muted, fontSize: 12, margin: "6px 0 8px" }}>
        One per line: <code>873 Service</code>, <code>873,Service</code> or
        tab-separated, which is what a paste out of Excel gives you. Pasting a
        code that already exists updates its name.
      </p>
      <textarea
        style={{ ...inp, minHeight: 130, fontFamily: "monospace", width: "100%" }}
        value={text} placeholder={"873 Service\n874,Road call\n875\tShop labour"}
        onChange={(e) => { setText(e.target.value); setPlan(null); }} />

      <label style={{ display: "flex", alignItems: "center", gap: 8,
                      margin: "10px 0", fontSize: 13 }}>
        <input type="checkbox" checked={replace}
               onChange={(e) => { setReplace(e.target.checked); setPlan(null); }} />
        Replace the whole list — anything not in the paste gets retired
      </label>

      <Btn disabled={!text.trim()} onClick={preview}>
        SEE WHAT THIS WILL DO
      </Btn>

      {plan && (
        <Modal title="What this will do" onClose={() => setPlan(null)}>
          <ul style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 18 }}>
            <li><b>{plan.add.length}</b> new</li>
            <li><b>{plan.rename.length}</b> renamed</li>
            <li><b>{plan.same.length}</b> already match and stay as they are</li>
            {!!plan.deactivate.length &&
              <li style={{ color: C.watch }}>
                <b>{plan.deactivate.length}</b> retired, being codes not in the paste
              </li>}
            {!!plan.bad.length &&
              <li style={{ color: C.pull }}>
                <b>{plan.bad.length}</b> lines skipped — {plan.bad[0].why}
              </li>}
          </ul>
          {!!plan.rename.length && (
            <div style={{ maxHeight: 150, overflowY: "auto", fontSize: 12,
                          color: C.muted, marginBottom: 10 }}>
              {plan.rename.slice(0, 12).map((r) => (
                <div key={r.code}>{r.code}: “{r.was}” → “{r.name}”</div>
              ))}
            </div>
          )}
          <p style={{ color: C.muted, fontSize: 12 }}>
            Retiring never deletes. Hours already booked against a code still
            need its name to render.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn tone="ghost" onClick={() => setPlan(null)}>CANCEL</Btn>
            <Btn onClick={() => { const p = plan; setPlan(null); setText("");
              run(async () => {
                const r = await setup.applyCodePlan(p);
                return r;
              }, `${p.add.length} added, ${p.rename.length} renamed.`); }}>
              APPLY {plan.add.length + plan.rename.length} CHANGES
            </Btn>
          </div>
        </Modal>
      )}

      {adding && (
        <Modal title="Add a cost code" onClose={() => setAdding(false)}>
          <Field label="Code">
            <input style={inp} value={one.code} autoFocus
                   onChange={(e) => setOne({ ...one, code: e.target.value })} />
          </Field>
          <Field label="Name">
            <input style={inp} value={one.name}
                   onChange={(e) => setOne({ ...one, name: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn tone="ghost" onClick={() => setAdding(false)}>CANCEL</Btn>
            <Btn disabled={!one.code.trim() || !one.name.trim()}
                 onClick={() => { const o = one; setAdding(false);
                   setOne({ code: "", name: "" });
                   run(() => setup.saveCostCode(o), `${o.code} added.`); }}>
              ADD
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
