import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { C, FD, FM } from "./theme.js";
import {
  todayISO, fmtDate, nf, toCSV, Modal, Btn, Field, SectionLabel, Card,
  inp, th, td, tdNum, linkBtn,
} from "./ui.jsx";
import * as time from "./timeData.js";
import * as clock from "./nowData.js";
import * as setup from "./setupData.js";
import * as buy from "./purchasingData.js";
import MyJobs from "./MyJobsSection.jsx";
import * as shop from "./shopData.js";
import * as partsData from "./partsData.js";
import EquipmentWorked from "./EquipmentWorked.jsx";

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

export default function TimecardSection({ who, tab, onBusy, go, focus, onClearFocus }) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mechanic, setMechanic] = useState(null);
  const [unlocked, setUnlocked] = useState(() => readUnlock(who));
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [codes, setCodes] = useState([]);
  const [parts, setParts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [changingPin, setChangingPin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [m, v, cc, pp] = await Promise.all([
          time.findMechanic(who), shop.listVehicles(), time.listCostCodes(),
          partsData.listParts(),
        ]);
        setMechanic(m);
        setVehicles(v);
        setCodes(cc);
        setParts(pp);
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

  /* Arrived from My jobs → BOOK HOURS. The order already knows its truck
     and its number, so the entry opens with both filled in rather than
     asking a mechanic to retype a WO number they were just looking at.

     It waits for the PIN. Landing on the gate would otherwise burn the
     hand-off — focus cleared, dialog never shown — and the tap would
     look like it did nothing. */
  useEffect(() => {
    if (!focus?.addHours || tab !== "today" || !unlocked) return;
    const a = focus.addHours;
    setEditing({
      vehId: a.vehId || "",
      unit: a.unit || "",
      workOrder: a.workOrder || "",
      note: a.note || "",
      date,
    });
    onClearFocus?.();
  }, [focus, tab, unlocked, date, onClearFocus]);

  if (!ready) return <div style={{ padding: 40, color: C.muted }}>Loading your timecard…</div>;

  /* My jobs sits behind the PIN with the rest of the personal tabs. It
     is one mechanic's own work, so it should not be readable by whoever
     happens to be standing at the tablet. */
  if (tab === "myjobs") {
    if (!unlocked) {
      return (
        <Body err={err}>
          <Gate who={who} onIn={(u) => { writeUnlock(u); setUnlocked(u); }} />
        </Body>
      );
    }
    return (
      <Body err={err}>
        <MyJobs me={unlocked} onBusy={onBusy} go={go} />
      </Body>
    );
  }

  if (tab === "history") {
    return (
      <Body err={err}>
        <MyHistory unlocked={unlocked} />
      </Body>
    );
  }

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

      <Shift mechanicId={unlocked.id} date={date} entries={entries}
        onBusy={onBusy} onErr={setErr} />

      <EquipmentWorked mechanic={unlocked} date={date}
        vehicles={vehicles} codes={codes} parts={parts}
        onErr={setErr}
        onSaved={async () => {
          await loadDay().catch((e) => setErr(e.message));
          /* Parts came off the shelf, so the catalog counts moved. */
          partsData.listParts().then(setParts).catch(() => {});
        }} />

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
                    <td style={{ ...td, color: C.muted }}>
                      {e.workTypes?.length > 0 && (
                        <span style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 600,
                                       letterSpacing: "0.06em", textTransform: "uppercase",
                                       color: C.green700, marginRight: 6 }}>
                          {e.workTypes.join(" · ")}
                        </span>
                      )}
                      {e.workPerformed || e.note || (e.workTypes?.length ? "" : "—")}
                    </td>
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
     making somebody find a button after the last tap.

     The in-flight guard is a ref, not state, and `working` is NOT a
     dependency. It was both, once: setting it re-ran this effect, whose
     cleanup marked the running attempt stale, so the code that clears
     it never ran and the pad stayed disabled for good. Nobody could
     sign in. State that the effect both sets and depends on is a loop
     waiting to happen. */
  const busy = useRef(false);
  useEffect(() => {
    if (!picked || buf.length !== 4 || busy.current) return;
    let live = true;
    busy.current = true;
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
        busy.current = false;
        setWorking(false);
      }
    })();
    return () => { live = false; };
  }, [buf, mode, picked, firstPin, onIn, who]);

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
          note="Mechanics are added under Supervisor → Mechanics. Once somebody is on the roster they tap their name here and choose a PIN." >
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
          under Supervisor → Mechanics.
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
    /* A code filed under nothing would head an optgroup with a blank
       label, which renders as an unnamed gap. Setup asks for a group, so
       this is only a backstop. */
    codes.forEach((c) => { (g[c.group || "Other"] ||= []).push(c); });
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

/* ── The shift card ───────────────────────────────────────────────
   The clock is not the timecard. This says a mechanic is in the shop;
   the entries below say what the work was and what it charges to.

   Both times are editable and there is a lunch deduction, straight from
   the mockup — "the clock fills these in, type over them if you forgot
   to punch". A punch clock nobody can correct is one they stop using
   the first morning they forget it.

   Underneath, the bar reconciles the two: hours on the clock against
   hours booked to a truck and a code. The gap is the whole point. It
   catches somebody who clocked nine and booked six, on their own
   screen, while they can still remember why. */

const LUNCH = [0, 15, 30, 45, 60];

function Shift({ mechanicId, date, entries, onBusy, onErr }) {
  const [sh, setSh] = React.useState(null);
  const [, tick] = React.useState(0);

  const load = React.useCallback(async () => {
    try { setSh(await clock.shiftForDay(mechanicId, date)); }
    catch (e) { onErr?.(e.message || String(e)); }
  }, [mechanicId, date, onErr]);

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

  const edit = (patch) => go(async () => {
    if (!sh) return;
    await clock.editShift(sh.id, sh.date, patch);
  });

  const running = sh?.open;
  const acc = clock.accountedFor(sh?.clockHours || 0, entries);
  const segColour = { shop: C.green700, call: C.watch, idle: C.muted };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`,
                  borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 700,
                        color: running ? C.green700 : C.ink, lineHeight: 1.15 }}>
            {running
              ? clock.fmtHMS(clock.elapsedSec(sh.startedAt))
              : sh ? `${nf(sh.clockHours, 2)} hours on the clock` : "Not clocked in"}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {running ? "On the clock now"
              : "Punching in shows you on the shop board. It does not book hours."}
          </div>
        </div>
        <Btn tone={running ? "ghost" : "solid"}
          onClick={() => go(() => running
            ? clock.punchOut(mechanicId)
            : clock.punchIn(mechanicId))}>
          {running ? "Clock out" : "Clock in"}
        </Btn>
      </div>

      {sh && (
        <>
          <div className="flex flex-wrap" style={{ gap: 10, marginTop: 12 }}>
            <Field label="Clocked in">
              <input type="time" value={clock.hm(sh.startedAt)}
                onChange={(e) => edit({ start: e.target.value })}
                style={{ ...inp, width: 130 }} />
            </Field>
            <Field label="Clocked out">
              <input type="time" value={clock.hm(sh.endedAt)}
                onChange={(e) => edit({ stop: e.target.value })}
                style={{ ...inp, width: 130 }} />
            </Field>
            <Field label="Lunch / breaks">
              <select value={sh.lunch} onChange={(e) => edit({ lunch: e.target.value })}
                style={{ ...inp, width: 130 }}>
                {LUNCH.map((m) => (
                  <option key={m} value={m}>{m ? `${m} min` : "None"}</option>
                ))}
              </select>
            </Field>
          </div>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "2px 0 0" }}>
            The clock fills these in. Type over them if you forgot to punch.
          </p>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
            <div className="flex flex-wrap items-baseline justify-between" style={{ gap: 8 }}>
              <span style={{ fontFamily: FD, fontSize: 12.5, letterSpacing: "0.06em",
                             textTransform: "uppercase", color: C.muted }}>
                Time accounted for
              </span>
              <span style={{ fontFamily: FD, fontSize: 14 }}>
                {nf(acc.booked, 2)} of {nf(acc.total, 2)} hrs
              </span>
            </div>

            <div style={{ display: "flex", height: 12, borderRadius: 3,
                          overflow: "hidden", background: C.paper,
                          border: `1px solid ${C.line}`, margin: "7px 0 6px" }}>
              {acc.segments.map((g, i) => (
                <div key={i} title={`${g.label} — ${g.hours} hr`}
                  style={{ width: `${g.pct}%`, background: segColour[g.kind] }} />
              ))}
            </div>

            <div style={{ fontSize: 12.5, fontWeight: 600,
                          color: acc.tone === "warn" ? C.pull
                               : acc.tone === "ok" ? C.good : C.muted }}>
              {acc.note}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


/* ── My history ───────────────────────────────────────────────────
   Everything one person has worked on, and the shifts they have
   closed. The same rows the office sees, narrowed to them.

   The note about permanence is the mockup's and it stays: entries are
   added, never edited or removed. It is a record of what happened, and
   a record you can quietly rewrite is not one. */

function MyHistory({ unlocked }) {
  const [rows, setRows] = React.useState(null);
  const [cards, setCards] = React.useState([]);
  const [kind, setKind] = React.useState("all");

  React.useEffect(() => {
    if (!unlocked) return;
    const name = unlocked.name;
    Promise.all([
      buy.myHistory(name).catch(() => []),
      buy.myShifts(unlocked.id).catch(() => []),
    ]).then(([h, c]) => { setRows(h); setCards(c); });
  }, [unlocked]);

  const kinds = React.useMemo(
    () => ["all", ...new Set((rows || []).map((r) => r.kind))], [rows]);
  const shown = React.useMemo(
    () => (rows || []).filter((r) => kind === "all" || r.kind === kind), [rows, kind]);

  const exportCsv = (name, header, lines) => {
    const csv = toCSV([header, ...lines]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };

  if (!unlocked) {
    return (
      <div style={{ maxWidth: 560 }}>
        <Card title="Not signed in"
          note="Open the Today tab and tap your name to see what you have worked on." />
      </div>
    );
  }
  if (rows === null) return <div style={{ padding: 30, color: C.muted }}>Reading…</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 8, marginBottom: 8 }}>
        <SectionLabel>Everything I've worked on · {shown.length}</SectionLabel>
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)}
            style={{ ...inp, width: "auto" }}>
            {kinds.map((k) => (
              <option key={k} value={k}>{k === "all" ? "All work" : k}</option>
            ))}
          </select>
          <Btn tone="ghost" disabled={!shown.length}
            onClick={() => exportCsv(`my-work_${unlocked.name.replace(/\W+/g, "-")}.csv`,
              ["Timestamp", "What", "Unit", "Detail", "Work order", "Hours"],
              shown.map((r) => [r.at, r.what, r.unit, r.summary, r.workOrder, r.hours ?? ""]))}>
            EXPORT
          </Btn>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>When</th><th style={th}>What</th>
            <th style={th}>Unit</th><th style={th}>Detail</th><th style={th}>Hours</th>
          </tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.id}-${i}`}>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  {fmtDate(r.at.slice(0, 10))}
                  <span style={{ color: C.muted }}> {r.at.slice(11, 16)}</span>
                </td>
                <td style={td}>{r.what}</td>
                <td style={td}>{r.unit}</td>
                <td style={td}>{r.summary}</td>
                <td style={tdNum}>{r.hours ?? ""}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={5}>
                Nothing recorded against your name yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 26px", maxWidth: 620 }}>
        This record is permanent — entries are added, never edited or removed. If
        something needs correcting, do the work and it gets recorded as a new entry.
      </p>

      <div className="flex flex-wrap items-center justify-between" style={{ gap: 8, marginBottom: 8 }}>
        <SectionLabel>My saved timecards · {cards.length}</SectionLabel>
        <Btn tone="ghost" disabled={!cards.length}
          onClick={() => exportCsv(`my-timecards_${unlocked.name.replace(/\W+/g, "-")}.csv`,
            ["Date", "Clocked in", "Clocked out", "Lunch (min)", "Hours"],
            cards.map((c) => [c.date, clock.hm(c.startedAt), clock.hm(c.endedAt),
                              c.lunch, c.hours]))}>
          EXPORT CSV
        </Btn>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>Date</th><th style={th}>In</th><th style={th}>Out</th>
            <th style={th}>Lunch</th><th style={th}>Hours</th>
          </tr></thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id}>
                <td style={td}>{fmtDate(c.date)}</td>
                <td style={td}>{clock.hm(c.startedAt)}</td>
                <td style={td}>{clock.hm(c.endedAt)}</td>
                <td style={td}>{c.lunch ? `${c.lunch} min` : "—"}</td>
                <td style={tdNum}>{nf(c.hours, 2)}</td>
              </tr>
            ))}
            {!cards.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={5}>
                No closed shifts yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
