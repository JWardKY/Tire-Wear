/* ── The Driving tab ──────────────────────────────────────────────
   A mechanic's day is not all spent in the shop. Trucks get shuttled
   between Clays Ferry and Clover Bottom, somebody runs to the dealer
   for a part, somebody drives out to a quarry for a road call. That
   time was going on whatever job was nearest to hand, or nowhere.

   Every line here is an ordinary time entry with "Driving" on it, so
   the hours land in the card total, go through approval and reach
   payroll without anything downstream needing to know this tab exists.
   src/driveLine.js holds the rules. */
import React, { useState, useMemo } from "react";
import { C, FD, FM } from "./theme.js";
import { Btn, Field, SectionLabel, inp, th, td, tdNum, linkBtn, nf } from "./ui.jsx";
import { drivingOnly, drivenHours, whyNotReady, sayTrip, reverseOf,
  entryFrom, COMMON_PLACES } from "./driveLine.js";

const blank = (date) => ({
  date, vehId: "", unitLabel: "", from: "", to: "",
  hours: "", costCode: "", workOrder: "", note: "",
});

export default function DrivingTab({ date, entries, vehicles, codes, busy,
                                     onAdd, onUpdate, onDelete }) {
  const [f, setF] = useState(() => blank(date));
  const [editingId, setEditingId] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const lines = useMemo(() => drivingOnly(entries), [entries]);
  const hours = useMemo(() => drivenHours(entries), [entries]);
  const why = whyNotReady(f);

  const start = (e) => {
    setEditingId(e.id);
    setF({
      date, vehId: e.vehId || "", unitLabel: e.vehId ? "" : (e.unit || ""),
      from: e.droveFrom || "", to: e.droveTo || "",
      hours: String(e.hours), costCode: e.costCode || "",
      workOrder: e.workOrder || "", note: e.note || "",
      workTypes: e.workTypes || [],
    });
  };

  /* Saved, but the form keeps the unit, the two ends and the cost
     code. A mechanic who drove a truck down is usually about to log
     the trip back, and the second most likely thing is the same run
     again — neither should mean typing it all out twice. Only the
     hours and the note clear, because those belong to the one trip. */
  const save = async () => {
    const entry = entryFrom(f, date);
    if (editingId) await onUpdate(editingId, entry);
    else await onAdd(entry);
    setF((p) => ({ ...p, hours: "", note: "", workOrder: "", workTypes: undefined }));
    setEditingId(null);
  };

  /* The return leg, without typing the same two places backwards. */
  const andBack = () => { setF((p) => ({ ...reverseOf(p), hours: "" })); setEditingId(null); };

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

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
        padding: "14px 16px" }}>
        <SectionLabel noMargin>{editingId ? "Change this trip" : "Add a trip"}</SectionLabel>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 10 }}>
          <Field label="Which unit">
            <select value={f.vehId} onChange={set("vehId")} style={inp}>
              <option value="">Not one of ours…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.number}{v.make ? ` — ${v.make}` : ""}</option>
              ))}
            </select>
          </Field>
          {!f.vehId && (
            <Field label="What was driven">
              <input value={f.unitLabel} onChange={set("unitLabel")}
                placeholder="Company pickup, hired truck…" style={inp} /></Field>
          )}
          {/* Both ends, always. "Drove 2 hours" cannot be checked
              against anything and means nothing in a year. */}
          <Field label="From">
            <input value={f.from} onChange={set("from")} list="tw-places"
              placeholder="Clays Ferry Shop" style={inp} /></Field>
          <Field label="To">
            <input value={f.to} onChange={set("to")} list="tw-places"
              placeholder="Clover Bottom Shop" style={inp} /></Field>
          <datalist id="tw-places">
            {COMMON_PLACES.map((p) => <option key={p} value={p} />)}
          </datalist>
          <Field label="Hours">
            <input value={f.hours} inputMode="decimal"
              onChange={(e) => setF((p) => ({ ...p, hours: e.target.value.replace(/[^0-9.]/g, "") }))}
              onFocus={(e) => e.target.select()}
              placeholder="1.5" style={{ ...inp, fontFamily: FM }} /></Field>
          <Field label="Charge it to">
            <select value={f.costCode} onChange={set("costCode")} style={inp}>
              <option value="">Choose a cost code…</option>
              {codes.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Work order (optional)">
            <input value={f.workOrder} onChange={set("workOrder")} style={inp} /></Field>
          <Field label="What for (optional)">
            <input value={f.note} onChange={set("note")}
              placeholder="Took it down for the alignment" style={inp} /></Field>
        </div>

        {why && (
          <p style={{ fontSize: 12.5, color: C.watch, fontWeight: 600, margin: "10px 0 0" }}>
            {why}
          </p>
        )}

        <div className="flex flex-wrap justify-between items-center mt-3" style={{ gap: 8 }}>
          <button onClick={andBack} disabled={!f.from && !f.to}
            style={{ ...linkBtn, fontSize: 12.5 }}>
            Turn it round — same trip the other way
          </button>
          <div className="flex" style={{ gap: 8 }}>
            {editingId && (
              <Btn tone="ghost" onClick={() => { setF(blank(date)); setEditingId(null); }}>
                Never mind
              </Btn>
            )}
            <Btn disabled={busy || !!why} onClick={save}>
              {editingId ? "SAVE THE TRIP" : "ADD IT TO THE CARD"}
            </Btn>
          </div>
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
        overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr>
              {["Unit", "Trip", "What for", "Charged to", "Hours", ""].map((h, i) => (
                <th key={h || i} style={{ ...th, textAlign: i >= 4 ? "right" : "left" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lines.map((e) => (
                <tr key={e.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                  <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{e.unit || "—"}</td>
                  <td style={td}>{sayTrip(e) || <span style={{ color: C.muted }}>—</span>}</td>
                  <td style={{ ...td, color: C.muted }}>{e.note || "—"}</td>
                  <td style={{ ...td, fontFamily: FM }}>{e.costCode}</td>
                  <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{nf(e.hours, 2)}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => start(e)} style={{ ...linkBtn, fontSize: 12.5 }}>Edit</button>
                    {" · "}
                    <button onClick={() => onDelete(e.id)}
                      style={{ ...linkBtn, fontSize: 12.5, color: C.pull }}>Remove</button>
                  </td>
                </tr>
              ))}
              {!lines.length && (
                <tr><td colSpan={6} style={{ ...td, color: C.muted, padding: 22 }}>
                  No driving on today's card yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.lineSoft}`,
          fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>
          These hours are on your timecard like any other line — they count towards the day
          and go to payroll with it. Charge a trip to the job it was for, not to the shop,
          wherever you can.
        </div>
      </div>
    </div>
  );
}
