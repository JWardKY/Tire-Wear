/* ── The Driving tab ──────────────────────────────────────────────
   Pick the truck, start, stop. The same clock the equipment card has,
   because that is the control this shop already knows.

   The first version asked for eight things before it would take a
   trip. Jason's answer was that it asks way too much, and he was
   right: a mechanic with keys in one hand and a phone in the other is
   not filling in a form. The cost code is the one thing payroll
   cannot do without, so it is guessed from what they have already
   charged today and left on the saved line to be changed.

   src/driveLine.js holds the rules. */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD, FM } from "./theme.js";
import { Btn, Field, SectionLabel, inp, th, td, tdNum, linkBtn, nf } from "./ui.jsx";
import UnitPicker from "./UnitPicker.jsx";
import { drivingOnly, drivenHours, hms, liveSeconds, quarters,
  suggestCode, entryFrom } from "./driveLine.js";

/* A phone throws a backgrounded tab away whenever it likes, and a
   mechanic who starts the clock and puts the phone in their pocket is
   the ordinary case. So the running clock is mirrored to localStorage,
   per mechanic and per day, and read back on the way in. */
const key = (mechanicId, date) => `tirewear:driving:${mechanicId}:${date}`;

function readDraft(mechanicId, date) {
  try {
    const raw = localStorage.getItem(key(mechanicId, date));
    const d = raw ? JSON.parse(raw) : null;
    return d && typeof d === "object" ? d : null;
  } catch { return null; }
}

const empty = { vehId: "", seconds: 0, stints: [], runningAt: null };

export default function DrivingTab({ date, mechanicId, entries, vehicles, codes,
                                     busy, onAdd, onSetCode, onDelete }) {
  const [d, setD] = useState(() => readDraft(mechanicId, date) || empty);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    try { localStorage.setItem(key(mechanicId, date), JSON.stringify(d)); } catch { /* a full disk is not worth losing the clock over */ }
  }, [d, mechanicId, date]);

  useEffect(() => {
    if (!d.runningAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [d.runningAt]);

  /* A clock left running when the tab closes is somebody's pay. */
  useEffect(() => {
    if (!d.runningAt) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [d.runningAt]);

  const lines = useMemo(() => drivingOnly(entries), [entries]);
  const hours = useMemo(() => drivenHours(entries), [entries]);
  const secs = liveSeconds(d, now);
  const veh = vehicles.find((v) => v.id === d.vehId) || null;

  /* Stopping puts the trip on the card. There is no Save: "start and
     stop driving" is the whole of what this tab was asked to do, and a
     trip nobody saved would be a trip that did not get paid. */
  const stop = useCallback(async () => {
    const stoppedAt = Date.now();
    const trip = {
      ...d,
      runningAt: null,
      seconds: liveSeconds(d, stoppedAt),
      stints: [...(d.stints || []), { start: d.runningAt, stop: new Date(stoppedAt).toISOString() }],
      costCode: suggestCode(codes, entries),
      stoppedAt,
    };
    await onAdd(entryFrom(trip, date));
    /* The truck stays picked: the next thing a mechanic does is
       usually drive it back. */
    setD({ ...empty, vehId: d.vehId });
  }, [d, codes, entries, onAdd, date]);

  const startStop = () => {
    if (d.runningAt) { stop(); return; }
    setD((p) => ({ ...p, runningAt: new Date().toISOString() }));
    setNow(Date.now());
  };

  const running = !!d.runningAt;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3"
        style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
          padding: "12px 16px" }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900,
            lineHeight: 1.1 }}>
            {nf(hours, 2)} hour{hours === 1 ? "" : "s"} driving
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
            {lines.length
              ? `${lines.length} trip${lines.length === 1 ? "" : "s"} on today's card`
              : "Shuttling a truck, a parts run, driving out to a breakdown"}
          </div>
        </div>
      </div>

      {/* The whole tab: which truck, and a button. */}
      <div style={{ background: C.card, borderRadius: 8, padding: "16px 18px",
        border: `2px solid ${running ? C.green700 : C.line}` }}>
        {/* The same box the equipment card uses: type the number. A
            dropdown of 276 units is a spinning wheel on a phone with no
            way to jump to one, which is why that control exists.

            It stays editable while the clock runs, as it does there.
            Somebody who started on the wrong truck should be able to
            put it right without losing the time they have driven —
            locking it would mean stop, fix, start again, and the
            minutes in between would go nowhere. */}
        <Field label="Which truck are you driving">
          <UnitPicker value={d.vehId} vehicles={vehicles}
            placeholder="Type the unit number…"
            onPick={(v) => setD((p) => ({ ...p, vehId: v || "" }))} />
        </Field>

        <div className="flex flex-wrap items-center justify-between" style={{ gap: 14, marginTop: 14 }}>
          <div>
            <div style={{ fontFamily: FM, fontSize: 38, fontWeight: 600, lineHeight: 1,
              color: running ? C.green700 : C.green900 }}>
              {hms(secs)}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
              {running ? `Driving ${veh ? veh.num : ""} — the clock is running`
                : secs > 0 ? `${nf(quarters(secs), 2)} hours, ready to go on the card`
                : "Pick the truck, then press Start"}
            </div>
          </div>
          <button onClick={startStop} disabled={busy || (!d.vehId && !running)}
            style={{
              fontFamily: FD, fontSize: 20, fontWeight: 700, letterSpacing: "0.06em",
              padding: "18px 42px", borderRadius: 8, cursor: "pointer", minWidth: 190,
              border: "none", color: "#fff",
              background: !d.vehId && !running ? C.muted : running ? C.pull : C.green700,
            }}>
            {running ? "STOP" : "START"}
          </button>
        </div>

        {running && (
          <p style={{ fontSize: 12.5, color: C.muted, margin: "12px 0 0", lineHeight: 1.5 }}>
            Stopping puts the trip on your timecard. You do not have to save it.
          </p>
        )}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
        overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead><tr>
              {["Truck", "Charged to", "Hours", ""].map((h, i) => (
                <th key={h || i} style={{ ...th, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lines.map((e) => (
                <tr key={e.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                  <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{e.unit || "—"}</td>
                  {/* Changed here rather than asked for before the clock. */}
                  <td style={td}>
                    <select value={e.costCode} disabled={busy}
                      onChange={(ev) => onSetCode(e, ev.target.value)}
                      style={{ ...inp, fontFamily: FM, padding: "5px 8px", fontSize: 12.5 }}>
                      {codes.map((c) => (
                        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{nf(e.hours, 2)}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => onDelete(e.id)}
                      style={{ ...linkBtn, fontSize: 12.5, color: C.pull }}>Remove</button>
                  </td>
                </tr>
              ))}
              {!lines.length && (
                <tr><td colSpan={4} style={{ ...td, color: C.muted, padding: 22 }}>
                  No driving on today's card yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.lineSoft}`,
          fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>
          These hours are on your timecard like any other line. The cost code is filled in
          from what you have already charged today — change it here if the trip belongs to
          a different job.
        </div>
      </div>
    </div>
  );
}
