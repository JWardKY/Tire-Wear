import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { C, FD, FM } from "./theme.js";
import {
  todayISO, fmtDate, nf, Modal, Btn, Field, SectionLabel, Card,
  inp, th, td, tdNum, linkBtn,
} from "./ui.jsx";
import * as time from "./timeData.js";
import * as shop from "./shopData.js";

/* ── The Timecard section ─────────────────────────────────────────
   Your own hours for one day. Behind a PIN, because this is the one
   part of the shop system where somebody else's record is somebody
   else's pay.

   There is no roster yet, so the first time you open this you make
   your own record: your name and a four digit PIN. The roster builds
   itself out of the people who actually use it, and can be reconciled
   against the real list when it turns up.

   The PIN unlocks for this browser tab only — sessionStorage, not
   local. A shop tablet left on a bench re-locks when the tab closes. */

const UNLOCK_KEY = "tirewear:timecard-unlocked";
const WHERE = [
  ["shop", "Shop"],
  ["field", "Field"],
  ["road", "Road call"],
  ["plant", "Plant"],
];

function readUnlock(email) {
  try {
    const v = JSON.parse(sessionStorage.getItem(UNLOCK_KEY) || "null");
    return v && v.email === email ? v : null;
  } catch {
    return null;
  }
}
function writeUnlock(v) {
  try { sessionStorage.setItem(UNLOCK_KEY, JSON.stringify(v)); } catch { /* not essential */ }
}
function clearUnlock() {
  try { sessionStorage.removeItem(UNLOCK_KEY); } catch { /* not essential */ }
}

export default function TimecardSection({ who, tab, onBusy }) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mechanic, setMechanic] = useState(null);
  const [unlocked, setUnlocked] = useState(() => readUnlock(who));
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [codes, setCodes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [changingPin, setChangingPin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [m, v, cc] = await Promise.all([
          time.findMechanic(who), shop.listVehicles(), time.listCostCodes(),
        ]);
        setMechanic(m);
        setVehicles(v);
        setCodes(cc);
      } catch (e) {
        setErr(`Could not load your timecard — ${e.message || e}`);
      }
      setReady(true);
    })();
  }, [who]);

  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]);

  const loadDay = useCallback(async () => {
    if (!unlocked?.id) return;
    setEntries(await time.listDay(unlocked.id, date));
  }, [unlocked, date]);

  useEffect(() => { loadDay().catch((e) => setErr(e.message)); }, [loadDay]);

  const run = useCallback(async (fn) => {
    setBusy(true);
    try {
      await fn();
      await loadDay();
      setErr(null);
    } catch (e) {
      setErr(`That did not save — ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }, [loadDay]);

  const total = useMemo(
    () => entries.reduce((a, e) => a + e.hours, 0), [entries]);

  if (!ready) return <div style={{ padding: 40, color: C.muted }}>Loading your timecard…</div>;

  if (tab === "pin") {
    return (
      <Body err={err}>
        <PinSettings who={who} mechanic={mechanic} unlocked={unlocked}
          onChanged={() => setChangingPin(false)}
          onLock={() => { clearUnlock(); setUnlocked(null); }} />
      </Body>
    );
  }

  if (!unlocked) {
    return (
      <Body err={err}>
        <Gate who={who} mechanic={mechanic}
          onIn={(u) => { writeUnlock(u); setUnlocked(u); }}
          onRegistered={async () => setMechanic(await time.findMechanic(who))} />
      </Body>
    );
  }

  return (
    <Body err={err}>
      <div className="flex flex-wrap items-center justify-between gap-3"
        style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
          padding: "12px 16px", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900,
            lineHeight: 1.1 }}>
            {nf(total, 2)} hour{total === 1 ? "" : "s"} on {fmtDate(date)}
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
            {unlocked.name} · every hour needs a truck or a place, and a cost code
          </div>
        </div>
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ ...inp, width: 160 }} />
          <Btn onClick={() => setEditing({})}>Add hours</Btn>
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 28 }}>
          <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900 }}>
            Nothing on this day yet
          </div>
          <p style={{ fontSize: 14, color: C.muted, marginTop: 6, maxWidth: 620, lineHeight: 1.55 }}>
            Add each chunk of work: which truck, how long, and what to charge it to.
            Use a plant or shop code for anything that is not against a truck — cleanup,
            a parts run, a safety meeting.
          </p>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
          overflow: "hidden" }}>
          <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.lineSoft}` }}>
            <SectionLabel noMargin>The day</SectionLabel>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
              <thead>
                <tr>
                  {["Unit", "Where", "Cost code", "Work order", "What you did", "Hours", ""]
                    .map((h, i) => (
                      <th key={h || i} style={{ ...th, textAlign: i === 5 ? "right" : "left" }}>{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                    <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{e.unit}</td>
                    <td style={{ ...td, color: C.muted }}>
                      {(WHERE.find(([k]) => k === e.where) || [, e.where])[1]}
                    </td>
                    <td style={td}>
                      <span style={{ fontFamily: FM }}>{e.costCode}</span>
                      <span style={{ color: C.muted }}> {e.costCodeName}</span>
                    </td>
                    <td style={{ ...td, fontFamily: FM, color: C.muted }}>{e.workOrder || "—"}</td>
                    <td style={{ ...td, color: C.muted }}>{e.note || "—"}</td>
                    <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{nf(e.hours, 2)}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button disabled={busy} onClick={() => setEditing(e)}
                        style={{ ...linkBtn, fontSize: 12.5 }}>Edit</button>
                      <span style={{ color: C.line }}> · </span>
                      <button disabled={busy}
                        onClick={() => run(() => time.deleteEntry(e.id))}
                        style={{ ...linkBtn, fontSize: 12.5, color: C.pull }}>Remove</button>
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${C.line}`, background: C.paper }}>
                  <td style={{ ...td, fontWeight: 700 }} colSpan={5}>Total</td>
                  <td style={{ ...td, ...tdNum, fontWeight: 700 }}>{nf(total, 2)}</td>
                  <td style={td} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <EntryDialog entry={editing} vehicles={vehicles} codes={codes} busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (e) => {
            await run(() => editing.id
              ? time.updateEntry(editing.id, e)
              : time.addEntry({ ...e, mechanicId: unlocked.id }));
            setEditing(null);
          }} />
      )}
    </Body>
  );
}

function Body({ err, children }) {
  return (
    <>
      {err && (
        <div style={{ background: "#FDECEA", color: C.pull, borderBottom: `1px solid ${C.pull}33`,
          padding: "10px 20px", fontSize: 13, fontWeight: 600 }}>{err}</div>
      )}
      <div className="mx-auto w-full" style={{ maxWidth: 1400, padding: "20px 16px 60px" }}>
        {children}
      </div>
    </>
  );
}

/* ── The PIN gate ─────────────────────────────────────────────── */

function Gate({ who, mechanic, onIn, onRegistered }) {
  const first = !mechanic;
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [msg, setMsg] = useState("");
  const [working, setWorking] = useState(false);
  const pinRef = useRef(null);

  useEffect(() => { pinRef.current?.focus(); }, [first]);

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    setWorking(true);
    try {
      if (first) {
        if (pin !== pin2) { setMsg("The two PINs are different."); return; }
        const r = await time.registerMechanic(who, name, pin);
        if (!r.ok) { setMsg(r.error); return; }
        await onRegistered();
        onIn({ email: who, id: r.id, name: name.trim() });
      } else {
        const r = await time.verifyPin(who, pin);
        if (!r.ok) { setMsg(r.error); setPin(""); return; }
        onIn({ email: who, id: r.id, name: r.name });
      }
    } catch (e2) {
      setMsg(e2.message || String(e2));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <Card
        title={first ? "Set up your timecard" : "Enter your PIN"}
        note={first
          ? "There is no roster loaded yet, so you set yourself up. Your name goes on the hours you enter, and the PIN keeps anyone else out of them."
          : `Signed in as ${who}. The PIN stops somebody else opening your hours on a shared tablet.`}>
        <form onSubmit={submit}>
          {first && (
            <Field label="Your name">
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="As it should read on the timecard" style={inp} />
            </Field>
          )}
          <div style={{ marginTop: first ? 12 : 0 }}>
            <Field label={first ? "Choose a 4-digit PIN" : "PIN"}>
              <input ref={pinRef} type="password" inputMode="numeric" autoComplete="off"
                maxLength={4} value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                style={{ ...inp, fontFamily: FM, fontSize: 22, letterSpacing: "0.5em", width: 160 }} />
            </Field>
          </div>
          {first && (
            <div style={{ marginTop: 12 }}>
              <Field label="Type it again">
                <input type="password" inputMode="numeric" autoComplete="off" maxLength={4}
                  value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                  style={{ ...inp, fontFamily: FM, fontSize: 22, letterSpacing: "0.5em", width: 160 }} />
              </Field>
            </div>
          )}
          {msg && (
            <div style={{ fontSize: 13, color: C.pull, marginTop: 10, fontWeight: 600 }}>{msg}</div>
          )}
          <div className="flex mt-4" style={{ gap: 8 }}>
            <Btn disabled={working || pin.length !== 4 || (first && (!name.trim() || pin2.length !== 4))}>
              {first ? "Set up and open" : "Open my timecard"}
            </Btn>
          </div>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
            Five wrong tries locks it for fifteen minutes. The PIN is stored hashed and
            nobody — including this page — can read it back.
          </p>
        </form>
      </Card>
    </div>
  );
}

function PinSettings({ who, mechanic, unlocked, onLock }) {
  const [f, setF] = useState({ old: "", next: "", again: "" });
  const [msg, setMsg] = useState("");
  const [good, setGood] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value.replace(/\D/g, "") }));

  async function submit(e) {
    e.preventDefault();
    setMsg(""); setGood("");
    if (f.next !== f.again) { setMsg("The two new PINs are different."); return; }
    try {
      const r = await time.changePin(who, f.old, f.next);
      if (!r.ok) { setMsg(r.error); return; }
      setGood("PIN changed.");
      setF({ old: "", next: "", again: "" });
    } catch (e2) {
      setMsg(e2.message || String(e2));
    }
  }

  if (!mechanic) {
    return (
      <div style={{ maxWidth: 560 }}>
        <Card title="No timecard yet"
          note="Open the Today tab and set yourself up first — then you can change your PIN here." />
      </div>
    );
  }

  return (
    <div className="grid gap-4" style={{ maxWidth: 560, gridTemplateColumns: "minmax(0,1fr)" }}>
      <Card title="Your record" note="This is what goes on the hours you enter.">
        <div style={{ fontSize: 14, lineHeight: 1.9 }}>
          <div><strong>{mechanic.name}</strong></div>
          <div style={{ fontFamily: FM, fontSize: 12.5, color: C.muted }}>{mechanic.email}</div>
        </div>
        {unlocked && (
          <div style={{ marginTop: 14 }}>
            <Btn tone="ghost" onClick={onLock}>Lock my timecard</Btn>
          </div>
        )}
      </Card>

      <Card title="Change your PIN" note="You need the current one.">
        <form onSubmit={submit}>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <Field label="Current">
              <input type="password" inputMode="numeric" maxLength={4} value={f.old}
                onChange={set("old")} style={{ ...inp, fontFamily: FM }} /></Field>
            <Field label="New">
              <input type="password" inputMode="numeric" maxLength={4} value={f.next}
                onChange={set("next")} style={{ ...inp, fontFamily: FM }} /></Field>
            <Field label="New again">
              <input type="password" inputMode="numeric" maxLength={4} value={f.again}
                onChange={set("again")} style={{ ...inp, fontFamily: FM }} /></Field>
          </div>
          {msg && <div style={{ fontSize: 13, color: C.pull, marginTop: 10, fontWeight: 600 }}>{msg}</div>}
          {good && <div style={{ fontSize: 13, color: C.good, marginTop: 10, fontWeight: 600 }}>{good}</div>}
          <div className="flex justify-end mt-3">
            <Btn disabled={f.old.length !== 4 || f.next.length !== 4 || f.again.length !== 4}>
              Change PIN
            </Btn>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* ── One line of the day ──────────────────────────────────────── */

function EntryDialog({ entry, vehicles, codes, busy, onClose, onSave }) {
  const [f, setF] = useState({
    vehId: entry.vehId || "",
    unitLabel: entry.vehId ? "" : (entry.unit || ""),
    where: entry.where || "shop",
    hours: entry.hours != null ? String(entry.hours) : "",
    costCode: entry.costCode || "",
    workOrder: entry.workOrder || "",
    note: entry.note || "",
    date: entry.date || todayISO(),
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const againstTruck = !!f.vehId;
  const hours = Number(f.hours);
  const ok = f.costCode && hours > 0 && hours <= 24
    && (againstTruck || f.unitLabel.trim());

  const grouped = useMemo(() => {
    const g = {};
    codes.forEach((c) => { (g[c.group] ||= []).push(c); });
    return g;
  }, [codes]);

  return (
    <Modal title={entry.id ? "Edit these hours" : "Add hours"}
      sub="Every hour needs a home and a cost code" onClose={onClose} width={580}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Truck">
          <select value={f.vehId} onChange={set("vehId")} style={inp}>
            <option value="">Not against a truck…</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.num} — {v.make} {v.model}</option>
            ))}
          </select>
        </Field>
        {againstTruck ? (
          <Field label="Where">
            <select value={f.where} onChange={set("where")} style={inp}>
              {WHERE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="What was it instead">
            <input value={f.unitLabel} onChange={set("unitLabel")}
              placeholder="Plant, parts run, safety meeting…" style={inp} />
          </Field>
        )}

        <Field label="Cost code">
          <select value={f.costCode} onChange={set("costCode")} style={inp}>
            <option value="">Choose a code…</option>
            {Object.entries(grouped).map(([group, list]) => (
              <optgroup key={group} label={group}>
                {list.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Hours">
          <input type="number" step="0.25" min="0.25" max="24" value={f.hours}
            onChange={set("hours")} style={{ ...inp, fontFamily: FM }} />
        </Field>

        <Field label="Work order">
          <input value={f.workOrder} onChange={set("workOrder")} placeholder="optional"
            style={{ ...inp, fontFamily: FM }} />
        </Field>
        <Field label="Date">
          <input type="date" value={f.date} onChange={set("date")} style={inp} />
        </Field>

        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="What you did">
            <input value={f.note} onChange={set("note")} style={inp} />
          </Field>
        </div>
      </div>

      {!f.costCode && (
        <p style={{ fontSize: 12.5, color: C.watch, marginTop: 12, lineHeight: 1.5, fontWeight: 600 }}>
          Payroll needs the cost code to charge these hours out.
        </p>
      )}

      <div className="flex justify-end mt-4" style={{ gap: 8 }}>
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy || !ok} onClick={() => onSave(f)}>
          {entry.id ? "Save changes" : "Add hours"}
        </Btn>
      </div>
    </Modal>
  );
}
