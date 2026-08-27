import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { C, FD, FM } from "./theme.js";
import {
  todayISO, fmtDate, nf, Modal, Btn, Field, SectionLabel, Card,
  inp, th, td, tdNum, linkBtn,
} from "./ui.jsx";
import * as time from "./timeData.js";
import * as clock from "./nowData.js";
import * as setup from "./setupData.js";
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
        <PinSettings who={who} unlocked={unlocked}
          onChanged={() => setChangingPin(false)}
          onLock={() => { clearUnlock(); setUnlocked(null); }} />
      </Body>
    );
  }

  if (!unlocked) {
    return (
      <Body err={err}>
        <Gate who={who}
          onIn={(u) => { writeUnlock(u); setUnlocked(u); }} />
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

      <Punch mechanicId={unlocked.id} onBusy={onBusy} onErr={setErr} />

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

/* ── The PIN gate ─────────────────────────────────────────────────
   Built to match the timecard mockup: tap your name, then four digits
   on a number pad with pips rather than a text field.

   The pad is not decoration. This is used on a shared tablet in a shop,
   often with gloves on, and a phone keyboard over a password box is the
   wrong control for that — big targets, no keyboard sliding up over the
   thing you are looking at, and the pips show progress without ever
   showing the PIN.

   No email anywhere in this flow. Most of the shop does not have one,
   and one of them is on the roster as "D. Bradley". */

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clr", "0", "del"];

function Gate({ who, onIn }) {
  const [roster, setRoster] = useState(null);
  const [picked, setPicked] = useState(null);
  const [buf, setBuf] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [mode, setMode] = useState("verify"); // verify | create | confirm
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    setup.listRoster()
      .then((r) => setRoster(r.filter((m) => m.active)))
      .catch((e) => { setRoster([]); setMsg(e.message || String(e)); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    if (!roster) return [];
    const s = q.trim().toLowerCase();
    const list = s ? roster.filter((m) => m.name.toLowerCase().includes(s)) : roster;
    /* Whoever is signed in by email first, so the office is not hunting
       for itself in a list of mechanics. */
    return [...list].sort((x, y) =>
      (y.email && y.email === who ? 1 : 0) - (x.email && x.email === who ? 1 : 0) ||
      x.name.localeCompare(y.name));
  }, [roster, q, who]);

  const pick = (m) => {
    setPicked(m); setBuf(""); setFirstPin(""); setMsg("");
    setMode(m.pinSet ? "verify" : "create");
  };

  const back = () => { setPicked(null); setBuf(""); setFirstPin(""); setMsg(""); };

  /* Four digits is the whole input, so it submits itself rather than
     making somebody find a button after the last tap. */
  useEffect(() => {
    if (!picked || buf.length !== 4 || working) return;
    let live = true;
    (async () => {
      setWorking(true);
      try {
        if (mode === "create") {
          setFirstPin(buf); setBuf(""); setMode("confirm"); setMsg("");
          return;
        }
        if (mode === "confirm") {
          if (buf !== firstPin) {
            setMsg("Those did not match. Start again.");
            setBuf(""); setFirstPin(""); setMode("create");
            return;
          }
          const r = await setup.setPin(picked.id, buf);
          if (!r.ok) { setMsg(r.error); setBuf(""); setMode("create"); return; }
        }
        const v = await setup.checkPin(picked.id, mode === "confirm" ? firstPin : buf);
        if (!live) return;
        if (!v.ok) {
          setMsg(v.error); setBuf("");
          if (v.needs_pin) setMode("create");
          return;
        }
        onIn({ id: picked.id, name: v.name || picked.name,
               email: picked.email || who, role: v.role || picked.role });
      } catch (e) {
        if (live) { setMsg(e.message || String(e)); setBuf(""); }
      } finally {
        if (live) setWorking(false);
      }
    })();
    return () => { live = false; };
  }, [buf, mode, picked, firstPin, working, onIn, who]);

  const tap = (k) => {
    setMsg("");
    if (k === "clr") return setBuf("");
    if (k === "del") return setBuf((b) => b.slice(0, -1));
    setBuf((b) => (b.length >= 4 ? b : b + k));
  };

  if (roster === null) {
    return <div style={{ padding: 30, color: C.muted }}>Reading the roster…</div>;
  }

  if (!roster.length) {
    return (
      <div style={{ maxWidth: 460 }}>
        <Card title="Nobody on the roster yet"
          note="Mechanics are added under Setup. Once somebody is on the roster they tap their name here and choose a PIN." >
          <div />
        </Card>
      </div>
    );
  }

  if (!picked) {
    return (
      <div style={{ maxWidth: 640 }}>
        <Card title="Who's on the clock?"
          note="Tap your name, then your four-digit PIN.">
          {roster.length > 8 && (
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Start typing a name"
              style={{ ...inp, marginBottom: 10 }} />
          )}
          <div style={{ display: "grid", gap: 7,
                        gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,185px),1fr))" }}>
            {shown.map((m) => (
              <button key={m.id} type="button" onClick={() => pick(m)}
                style={{
                  textAlign: "left", padding: "12px 14px", borderRadius: 6,
                  border: `1px solid ${m.pinSet ? C.line : C.watch}`,
                  background: "#fff", cursor: "pointer",
                  fontFamily: FD, fontSize: 15.5, fontWeight: 600, color: C.ink,
                }}>
                {m.name}
                <div style={{ fontSize: 11, fontWeight: 400,
                              color: m.locked ? C.pull : m.pinSet ? C.muted : C.watch,
                              textTransform: "uppercase", letterSpacing: "0.05em",
                              marginTop: 2 }}>
                  {m.locked ? "Locked out"
                    : m.pinSet ? (m.empNo ? `#${m.empNo}` : "Sign in")
                    : "Set PIN"}
                </div>
              </button>
            ))}
            {!shown.length && (
              <div style={{ color: C.muted, fontSize: 13 }}>Nobody by that name.</div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const prompt = mode === "create" ? "Pick a 4-digit PIN"
    : mode === "confirm" ? "Enter it once more"
    : "Enter your PIN";

  return (
    <div style={{ maxWidth: 340 }}>
      <Card title={picked.name} note={prompt}>
        <div style={{ display: "flex", gap: 12, justifyContent: "center",
                      margin: "6px 0 18px" }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{
              width: 14, height: 14, borderRadius: "50%",
              border: `2px solid ${C.green700}`,
              background: i < buf.length ? C.green700 : "transparent",
            }} />
          ))}
        </div>

        <div style={{ display: "grid", gap: 8,
                      gridTemplateColumns: "repeat(3, 1fr)" }}>
          {PAD.map((k) => (
            <button key={k} type="button" disabled={working}
              onClick={() => tap(k)}
              style={{
                padding: "16px 0", fontFamily: FD,
                fontSize: k === "clr" || k === "del" ? 13 : 24,
                fontWeight: 600,
                color: k === "clr" || k === "del" ? C.muted : C.ink,
                background: "#fff", border: `1px solid ${C.line}`,
                borderRadius: 8, cursor: working ? "wait" : "pointer",
                textTransform: "uppercase", letterSpacing: k.length > 1 ? "0.05em" : 0,
              }}>
              {k === "clr" ? "Clear" : k === "del" ? "Delete" : k}
            </button>
          ))}
        </div>

        {msg && (
          <div style={{ fontSize: 13, color: C.pull, marginTop: 12,
                        fontWeight: 600, textAlign: "center" }}>{msg}</div>
        )}

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" onClick={back}
            style={{ background: "none", border: 0, color: C.muted,
                     fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
            Not me
          </button>
        </div>

        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 14, lineHeight: 1.5 }}>
          Five wrong tries locks it for fifteen minutes. The PIN is stored hashed —
          nobody, including this page, can read it back. Forgotten ones are reset
          under Setup.
        </p>
      </Card>
    </div>
  );
}

function PinSettings({ who, unlocked, onLock }) {
  const [f, setF] = useState({ old: "", next: "", again: "" });
  const [msg, setMsg] = useState("");
  const [good, setGood] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value.replace(/\D/g, "") }));

  async function submit(e) {
    e.preventDefault();
    setMsg(""); setGood("");
    if (f.next !== f.again) { setMsg("The two new PINs are different."); return; }
    try {
      const r = await setup.changePinById(unlocked.id, f.old, f.next);
      if (!r.ok) { setMsg(r.error); return; }
      setGood("PIN changed.");
      setF({ old: "", next: "", again: "" });
    } catch (e2) {
      setMsg(e2.message || String(e2));
    }
  }

  /* Keyed on the signed-in person, not on an email — most of the shop
     does not have one. */
  if (!unlocked) {
    return (
      <div style={{ maxWidth: 560 }}>
        <Card title="Not signed in"
          note="Open the Today tab and tap your name first — then you can change your PIN here." />
      </div>
    );
  }

  return (
    <div className="grid gap-4" style={{ maxWidth: 560, gridTemplateColumns: "minmax(0,1fr)" }}>
      <Card title="Your record" note="This is what goes on the hours you enter.">
        <div style={{ fontSize: 14, lineHeight: 1.9 }}>
          <div><strong>{unlocked.name}</strong></div>
          {unlocked.email && (
            <div style={{ fontFamily: FM, fontSize: 12.5, color: C.muted }}>{unlocked.email}</div>
          )}
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

/* ── Punching in and out ──────────────────────────────────────────
   The clock is not the timecard. This says a mechanic is in the shop;
   the entries below say what the work was and what it charges to. They
   are deliberately separate, because the Now board has to show somebody
   the moment they arrive, not once they have filled a form in. */

function Punch({ mechanicId, onBusy, onErr }) {
  const [open, setOpen] = React.useState(null);
  const [, tick] = React.useState(0);

  const load = React.useCallback(async () => {
    try { setOpen(await clock.openShift(mechanicId)); }
    catch (e) { onErr?.(e.message || String(e)); }
  }, [mechanicId, onErr]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const go = async (fn) => {
    onBusy?.(true);
    try {
      const r = await fn();
      if (r && r.ok === false) onErr?.(r.error);
      await load();
    } catch (e) { onErr?.(e.message || String(e)); }
    finally { onBusy?.(false); }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3"
      style={{ background: open ? C.green700 : C.card,
        color: open ? "#fff" : C.ink,
        border: `1px solid ${open ? C.green700 : C.line}`,
        borderRadius: 8, padding: "10px 16px", marginBottom: 16 }}>
      <div>
        <div style={{ fontFamily: FD, fontSize: 18, fontWeight: 700, lineHeight: 1.15 }}>
          {open
            ? `On the clock · ${clock.fmtHMS(clock.elapsedSec(open.started_at))}`
            : "Not on the clock"}
        </div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
          {open
            ? `In at ${new Date(open.started_at).toLocaleTimeString([], {
                hour: "numeric", minute: "2-digit" })}`
            : "Punching in shows you on the shop board. It does not book hours."}
        </div>
      </div>
      <Btn tone={open ? "ghost" : "solid"}
        onClick={() => go(() => open
          ? clock.punchOut(mechanicId)
          : clock.punchIn(mechanicId))}>
        {open ? "Punch out" : "Punch in"}
      </Btn>
    </div>
  );
}
