import React, { useState, useEffect, useCallback } from "react";
import { C, FM } from "./theme.js";
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

export default function SetupSection({ who, tab, onBusy, supervisor }) {
  const [roster, setRoster] = useState([]);
  const [codes, setCodes] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, c, f] = await Promise.all([
        setup.listRoster(), setup.listAllCostCodes(), setup.listVehicles()]);
      setRoster(r); setCodes(c); setFleet(f); setErr("");
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
      {tab === "codes" ? <Codes codes={codes} run={run} />
        : tab === "equipment" ? <Equipment fleet={fleet} run={run} />
        : <Roster roster={roster} run={run} supervisor={supervisor} />}
    </div>
  );
}

const banner = (bg) => ({
  background: bg, color: "#fff", padding: "8px 12px", borderRadius: 4,
  marginBottom: 12, fontSize: 13,
});

/* ── Roster ────────────────────────────────────────────────────── */

function Roster({ roster, run, supervisor }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
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
                  <Btn tone="ghost" onClick={() => setEditing(m)}>EDIT</Btn>{" "}
                  {m.pinSet && (
                    <Btn tone="ghost" onClick={() => setConfirm(m)}>RESET PIN</Btn>
                  )}{" "}
                  <Btn tone="ghost" onClick={() => run(
                    () => setup.setMechanicActive(m.id, !m.active),
                    m.active ? `${m.name} taken off the roster.`
                             : `${m.name} back on the roster.`)}>
                    {m.active ? "OFF ROSTER" : "RESTORE"}
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

      {editing && (
        <EditMechanic m={editing} run={run} supervisor={supervisor}
          onClose={() => setEditing(null)} />
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

/* ── Editing one mechanic ──────────────────────────────────────── */

/* Jason's record: name, address, phone, email, Allen employee number,
   emergency contact, PIN.

   It comes in two halves on purpose. The top half is what the roster
   already shows the whole shop, so it saves on its own. The bottom half
   is where somebody lives and who to ring if they are hurt, and the
   browser is not granted those columns at all — they are fetched and
   written by a database function that checks the supervisor's own PIN.
   That is one PIN entry, on a screen used now and then, in exchange for
   a home address not being readable by anyone who pulls the key out of
   the page. */
function EditMechanic({ m, run, supervisor, onClose }) {
  const [name, setName] = useState(m.name || "");
  const [email, setEmail] = useState(m.email || "");
  const [empNo, setEmpNo] = useState(m.empNo || "");

  const [pin, setPin] = useState("");
  const [priv, setPriv] = useState(null);      // null until unlocked
  const [privErr, setPrivErr] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [confirmGone, setConfirmGone] = useState(false);

  const changed = name.trim() !== (m.name || "")
    || email.trim() !== (m.email || "")
    || empNo.trim() !== (m.empNo || "");

  const unlock = async () => {
    setPrivErr(""); setUnlocking(true);
    try {
      const r = await setup.getPrivate(supervisor.id, pin, m.id);
      if (!r?.ok) { setPrivErr(r?.error || "Could not check that PIN."); return; }
      setPriv({
        address: r.address || "", phone: r.phone || "",
        emergencyName: r.emergency_name || "",
        emergencyPhone: r.emergency_phone || "",
      });
    } catch (e) {
      setPrivErr(e.message || String(e));
    } finally { setUnlocking(false); }
  };

  return (
    <Modal title={`Edit ${m.name}`} width={560} onClose={onClose}>
      <Field label="Name">
        <input style={inp} value={name} autoFocus
               onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email">
        <input style={inp} value={email} placeholder="optional"
               onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Allen Co employee number">
        <input style={{ ...inp, fontFamily: FM }} value={empNo} placeholder="optional"
               onChange={(e) => setEmpNo(e.target.value)} />
      </Field>

      <div style={{ borderTop: `1px solid ${C.line}`, margin: "16px 0 12px" }} />
      <SectionLabel>Personal details</SectionLabel>

      {!supervisor ? (
        <p style={{ fontSize: 13, color: C.muted }}>
          Sign in on the supervisor tab to see these.
        </p>
      ) : !priv ? (
        <>
          <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 8px", maxWidth: 480 }}>
            Address and next of kin are kept out of everything the browser can
            read on its own. Type your own PIN, {supervisor.name.split(" ")[0]},
            to see and change them.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ maxWidth: 150 }}>
              <Field label="Your PIN">
                <input style={{ ...inp, fontFamily: FM, letterSpacing: 4 }}
                  type="password" inputMode="numeric" maxLength={4} value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPrivErr(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && pin.length === 4) unlock(); }} />
              </Field>
            </div>
            <Btn disabled={pin.length !== 4 || unlocking} onClick={unlock}>
              {unlocking ? "CHECKING…" : "UNLOCK"}
            </Btn>
          </div>
          {privErr && (
            <div style={{ color: C.pull, fontSize: 12, fontWeight: 600, marginTop: 6 }}>
              {privErr}
            </div>
          )}
        </>
      ) : (
        <>
          <Field label="Address">
            <textarea style={{ ...inp, minHeight: 60 }} value={priv.address}
              onChange={(e) => setPriv({ ...priv, address: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input style={{ ...inp, fontFamily: FM }} value={priv.phone}
              onChange={(e) => setPriv({ ...priv, phone: e.target.value })} />
          </Field>
          <Field label="Emergency contact name">
            <input style={inp} value={priv.emergencyName}
              onChange={(e) => setPriv({ ...priv, emergencyName: e.target.value })} />
          </Field>
          <Field label="Emergency contact phone">
            <input style={{ ...inp, fontFamily: FM }} value={priv.emergencyPhone}
              onChange={(e) => setPriv({ ...priv, emergencyPhone: e.target.value })} />
          </Field>
        </>
      )}

      <div style={{ borderTop: `1px solid ${C.line}`, margin: "16px 0 12px" }} />
      <SectionLabel>PIN for this site</SectionLabel>
      <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 0" }}>
        {m.pinSet
          ? "Set. Nobody can read it back — resetting it lets them choose again, from the RESET PIN button on the roster."
          : "Not set yet. They choose it themselves the first time they tap their name on the timecard tab."}
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between",
                    alignItems: "center", marginTop: 18 }}>
        {/* Only offered for somebody who has never worked. Anyone else
            goes off the roster instead — the delete cascades to hours. */}
        <Btn tone="ghost" onClick={() => setConfirmGone(true)}>DELETE</Btn>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn tone="ghost" onClick={onClose}>CANCEL</Btn>
          <Btn disabled={!name.trim() || (!changed && !priv)}
            onClick={() => {
              const wanted = { name: name.trim(), email: email.trim(), empNo: empNo.trim() };
              const p = priv;
              onClose();
              run(async () => {
                if (changed) {
                  const r = await setup.updateMechanic(m.id, wanted);
                  if (!r?.ok) throw new Error(r?.error || "Could not save that.");
                }
                if (p) {
                  const r = await setup.setPrivate(supervisor.id, pin, m.id, p);
                  if (!r?.ok) throw new Error(r?.error || "Could not save the personal details.");
                }
              }, `${wanted.name} saved.`);
            }}>
            SAVE
          </Btn>
        </div>
      </div>

      {confirmGone && (
        <Modal title={`Delete ${m.name} for good?`} onClose={() => setConfirmGone(false)}>
          <p style={{ fontSize: 14 }}>
            This is for somebody added by mistake. It only goes through if they
            have never booked an hour or punched in — anyone who has is taken off
            the roster instead, so their hours stay where payroll can see them.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn tone="ghost" onClick={() => setConfirmGone(false)}>CANCEL</Btn>
            <Btn onClick={() => { setConfirmGone(false); onClose();
              run(async () => {
                const r = await setup.removeMechanic(m.id);
                if (!r?.ok) throw new Error(r?.error || "Could not remove them.");
              }, `${m.name} removed.`); }}>
              DELETE
            </Btn>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

/* ── Cost codes ────────────────────────────────────────────────── */

/* The mechanic's cost-code dropdown is grouped by these, so a code
   filed under nothing lands in an unlabelled clump at the bottom of it.
   Whatever groups are already in use win; these are the fallback for a
   list that has not got any yet. */
const CODE_GROUPS = ["Vehicle", "Plant", "Shop", "Other"];

function Codes({ codes, run }) {
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [plan, setPlan] = useState(null);
  const [group, setGroup] = useState("");
  const [adding, setAdding] = useState(false);
  const [one, setOne] = useState({ code: "", name: "", group: "" });

  const groups = [...new Set([...codes.map((c) => c.group).filter(Boolean),
                              ...CODE_GROUPS])];
  /* New codes go after the ones already there, not on top of them. */
  const endOfList = codes.reduce((m, c) => Math.max(m, Number(c.sort) || 0), 0);

  const preview = () => setPlan(planCodes(parseCodes(text), codes, replace, group));

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
            <th style={th}>Group</th>
            <th style={th}>In use</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.code} style={{ opacity: c.active ? 1 : 0.5 }}>
                <td style={{ ...td, fontFamily: "monospace" }}>{c.code}</td>
                <td style={td}>{c.name}</td>
                <td style={{ ...td, color: c.group ? C.ink : C.pull }}>
                  {c.group || "not filed"}
                </td>
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
              <tr><td style={{ ...td, color: C.muted }} colSpan={5}>
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

      <div style={{ maxWidth: 260, marginTop: 10 }}>
        <Field label="File the new ones under">
          <select style={inp} value={group}
                  onChange={(e) => { setGroup(e.target.value); setPlan(null); }}>
            <option value="">Choose a group…</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <div style={{ fontSize: 12, color: group ? C.muted : C.pull, marginTop: -4 }}>
          {group
            ? `New codes show under ${group} on the timecard. Codes already on the list keep the group they have.`
            : "Without one, new codes sit in an unlabelled group at the bottom of the mechanic's dropdown."}
        </div>
      </div>

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
            <li><b>{plan.add.length}</b> new{plan.add.length && group ? ` under ${group}` : ""}</li>
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
          <Field label="Group">
            <select style={inp} value={one.group}
                    onChange={(e) => setOne({ ...one, group: e.target.value })}>
              <option value="">Choose a group…</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <p style={{ color: C.muted, fontSize: 12 }}>
            The group is the heading it sits under in the mechanic's dropdown.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn tone="ghost" onClick={() => setAdding(false)}>CANCEL</Btn>
            <Btn disabled={!one.code.trim() || !one.name.trim() || !one.group}
                 onClick={() => { const o = { ...one, sort: endOfList + 10 };
                   setAdding(false);
                   setOne({ code: "", name: "", group: "" });
                   run(() => setup.saveCostCode(o), `${o.code} added.`); }}>
              ADD
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── Equipment ─────────────────────────────────────────────────────
   The haul fleet comes from Motive and needs no screen. This is for
   everything else that comes through the shop — a rental, a customer's
   truck, a machine borrowed for a week — so it can carry a service, a
   set of tires or a defect like any other unit.

   Once it is in, it is in: tires, PM, hours and defects all key off
   vehicle_id and none of them care where the row came from. The one
   difference is the odometer, which nobody will be feeding but you.

   Removing is deliberately absent. Every one of those tables cascades
   on vehicle_id, so a delete would take the unit's history with it
   without saying so. RETIRE takes it off the boards and keeps the lot. */

const DIVISIONS = [
  ["DT", "DT — haul fleet"],
  ["HT", "HT — haul fleet"],
  ["OT", "Other — rental, customer, one-off"],
];
const CFGS = [
  ["dump12", "12-tire dump · steer + pusher + tandem"],
  ["dualpush14", "14-tire dump · steer + dual pusher + tandem"],
  ["quad14", "14-tire · steer + 2 pushers + tandem"],
  ["tandem10", "10-tire tractor · steer + tandem drive"],
  ["single6", "6-tire · steer + single drive"],
  ["light4", "4-tire · light duty"],
];
const blankUnit = { num: "", make: "", model: "", year: "",
                    division: "OT", cfg: "tandem10", notes: "" };

function Equipment({ fleet, run }) {
  const [form, setForm] = useState(null);   // null | {…unit} for add or edit
  const [showAll, setShowAll] = useState(false);

  /* The 134 Motive units are the noise here — somebody opening this tab
     wants the handful they typed in themselves. */
  const manual = fleet.filter((v) => v.manual);
  const shown = showAll ? fleet : manual;
  const editing = form?.id != null;

  const save = async () => {
    if (editing) await setup.updateVehicle(form.id, form);
    else await setup.addVehicle(form);
    setForm(null);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 10 }}>
        <SectionLabel>{showAll ? "All equipment" : "Added by hand"}</SectionLabel>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn tone="ghost" onClick={() => setShowAll((x) => !x)}>
            {showAll ? `JUST THE ${manual.length} ADDED` : `SHOW ALL ${fleet.length}`}
          </Btn>
          <Btn onClick={() => setForm({ ...blankUnit })}>+ ADD EQUIPMENT</Btn>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>Unit</th><th style={th}>Make / model</th>
            <th style={th}>Division</th><th style={th}>Tires</th>
            <th style={th}>Source</th><th style={th}>In service</th>
            <th style={th}></th>
          </tr></thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id} style={{ opacity: v.active ? 1 : 0.55 }}>
                <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{v.num}</td>
                <td style={td}>
                  {[v.make, v.model].filter(Boolean).join(" ") || "—"}
                  {v.year && <span style={{ color: C.muted }}> · {v.year}</span>}
                </td>
                <td style={td}>{v.division}</td>
                <td style={{ ...td, color: C.muted }}>
                  {(CFGS.find(([k]) => k === v.cfg) || [null, v.cfg])[1]}
                </td>
                <td style={td}>
                  {v.manual
                    ? <span style={{ color: C.muted }}>entered here</span>
                    : <span style={{ color: C.good }}>Motive</span>}
                </td>
                <td style={td}>{v.active ? "yes" : "retired"}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  <Btn tone="ghost" onClick={() => setForm({ ...v })}>EDIT</Btn>{" "}
                  <Btn tone="ghost" onClick={() => run(
                    () => setup.setVehicleActive(v.id, !v.active),
                    v.active ? `${v.num} retired.` : `${v.num} back in service.`)}>
                    {v.active ? "RETIRE" : "RESTORE"}
                  </Btn>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={7}>
                Nothing added by hand yet. Everything on the tire and PM boards
                came from Motive. Add a unit here and it works the same as any
                other — except the odometer, which has to be logged by hand.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ color: C.muted, fontSize: 12, marginTop: 12, maxWidth: 620 }}>
        <b>Motive is not told about anything added here</b>, and the nightly sync
        leaves it alone — so its odometer only moves when somebody uses LOG
        MILEAGE on the truck. PM due by miles and tire wear rates both read that
        number, so a unit nobody logs will sit at zero miles forever.
      </p>
      <p style={{ color: C.muted, fontSize: 12, maxWidth: 620 }}>
        <b>RETIRE</b> takes a unit off the boards and keeps every tire, service
        and hour recorded against it. There is no delete: those records hang off
        the unit, and removing it would take them too.
      </p>

      {form && (
        <Modal title={editing ? `Edit ${form.num || "unit"}` : "Add equipment"}
          onClose={() => setForm(null)}>
          <Field label="Unit number">
            <input style={{ ...inp, fontFamily: FM }} value={form.num} autoFocus
              placeholder="RENTAL-4, CUST-882…"
              onChange={(e) => setForm((f) => ({ ...f, num: e.target.value }))} />
          </Field>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Make">
              <input style={inp} value={form.make}
                onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} />
            </Field>
            <Field label="Model">
              <input style={inp} value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
            </Field>
            <Field label="Year">
              <input style={inp} value={form.year} placeholder="optional"
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
            </Field>
            <Field label="Division">
              <select style={inp} value={form.division}
                onChange={(e) => setForm((f) => ({ ...f, division: e.target.value }))}>
                {DIVISIONS.map(([k, label]) =>
                  <option key={k} value={k}>{label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Tire layout">
            <select style={inp} value={form.cfg}
              onChange={(e) => setForm((f) => ({ ...f, cfg: e.target.value }))}>
              {CFGS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </Field>
          <Field label="Note (optional)">
            <input style={inp} value={form.notes}
              placeholder="Whose it is, why it is here"
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <p style={{ color: C.muted, fontSize: 12 }}>
            The tire layout decides which wheel positions exist on the diagram.
            It can be changed later from the truck's own screen if it turns out
            wrong.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn tone="ghost" onClick={() => setForm(null)}>CANCEL</Btn>
            <Btn disabled={!form.num.trim()}
              onClick={() => run(save, editing ? "Saved." : `${form.num.trim()} added.`)}>
              {editing ? "SAVE" : "ADD"}
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
