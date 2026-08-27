import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD, FM } from "./theme.js";
import { fmtDate, nf, toCSV, Btn, Field, SectionLabel, inp, th, td, tdNum } from "./ui.jsx";
import * as time from "./timeData.js";

/* ── The Hours section ────────────────────────────────────────────
   Where the hours went, for the office. Read only: hours are entered
   on a mechanic's own timecard behind their PIN, and nothing here
   edits them.

   Three ways of cutting the same range, because three different
   questions get asked of it: who worked, what got worked on, and what
   it charges to. */

function startOfWeek(d) {
  const x = new Date(d + "T00:00:00");
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}
const todayStr = () => new Date().toISOString().slice(0, 10);
function addDays(iso, n) {
  const x = new Date(iso + "T00:00:00");
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

const RANGES = [
  ["week", "This week"],
  ["last", "Last week"],
  ["month", "This month"],
];

function rangeFor(key) {
  const today = todayStr();
  if (key === "week") return [startOfWeek(today), today];
  if (key === "last") {
    const thisMon = startOfWeek(today);
    return [addDays(thisMon, -7), addDays(thisMon, -1)];
  }
  return [today.slice(0, 8) + "01", today];
}

export default function HoursSection({ who, tab, onBusy }) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [rangeKey, setRangeKey] = useState("week");
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  const [from, to] = useMemo(() => rangeFor(rangeKey), [rangeKey]);

  const load = useCallback(async () => {
    try {
      setRows(await time.listRange(from, to));
      setErr(null);
    } catch (e) {
      setErr(`Could not load hours — ${e.message || e}`);
    }
    setReady(true);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { onBusy?.(false); }, [onBusy]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      `${r.mechanic} ${r.unit} ${r.costCode} ${r.costCodeName} ${r.note}`.toLowerCase().includes(s));
  }, [rows, q]);

  const total = shown.reduce((a, r) => a + r.hours, 0);

  const group = useCallback((keyFn, labelFn) => {
    const m = new Map();
    shown.forEach((r) => {
      const k = keyFn(r);
      const g = m.get(k) || { key: k, label: labelFn(r), hours: 0, entries: 0 };
      g.hours += r.hours;
      g.entries++;
      m.set(k, g);
    });
    return [...m.values()].sort((a, b) => b.hours - a.hours);
  }, [shown]);

  const byMechanic = useMemo(() => group((r) => r.mechanicId, (r) => r.mechanic), [group]);
  const byUnit = useMemo(() => group((r) => r.unit, (r) => r.unit), [group]);
  const byCode = useMemo(
    () => group((r) => r.costCode, (r) => `${r.costCode} — ${r.costCodeName}`), [group]);

  function exportCsv() {
    const head = ["date", "mechanic", "unit", "where", "cost_code", "cost_code_name",
      "work_order", "hours", "note"];
    const body = shown.map((r) => [r.date, r.mechanic, r.unit, r.where, r.costCode,
      r.costCodeName, r.workOrder, r.hours, r.note]);
    const blob = new Blob([toCSV([head, ...body])], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `allen-hours-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!ready) return <div style={{ padding: 40, color: C.muted }}>Loading hours…</div>;

  return (
    <>
      {err && (
        <div style={{ background: "#FDECEA", color: C.pull, borderBottom: `1px solid ${C.pull}33`,
          padding: "10px 20px", fontSize: 13, fontWeight: 600 }}>{err}</div>
      )}
      <div className="mx-auto w-full" style={{ maxWidth: 1400, padding: "20px 16px 60px" }}>
        <div className="flex flex-wrap items-center justify-between gap-3"
          style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
            padding: "12px 16px", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900,
              lineHeight: 1.1 }}>
              {nf(total, 2)} hours · {shown.length} entr{shown.length === 1 ? "y" : "ies"}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
              {fmtDate(from)} to {fmtDate(to)}
            </div>
          </div>
          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value)}
              style={{ ...inp, width: 150 }}>
              {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Find a name, truck or code" style={{ ...inp, width: 220 }} />
            <Btn tone="ghost" onClick={exportCsv} disabled={!shown.length}>Export CSV</Btn>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 28 }}>
            <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900 }}>
              No hours in this range
            </div>
            <p style={{ fontSize: 14, color: C.muted, marginTop: 6, maxWidth: 620, lineHeight: 1.55 }}>
              Hours show up here as mechanics enter them on their own timecards. Nothing
              is entered from this screen — it only adds up what is already there.
            </p>
          </div>
        ) : tab === "detail" ? (
          <Detail rows={shown} />
        ) : (
          <div className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
            <Rollup title="By mechanic" rows={byMechanic} total={total} />
            <Rollup title="By unit" rows={byUnit} total={total} />
            <Rollup title="By cost code" rows={byCode} total={total} wide />
          </div>
        )}
      </div>
    </>
  );
}

function Rollup({ title, rows, total }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
      overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.lineSoft}` }}>
        <SectionLabel noMargin>{title}</SectionLabel>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {rows.map((r) => {
              const pct = total > 0 ? (r.hours / total) * 100 : 0;
              return (
                <tr key={r.key} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                  <td style={{ ...td, width: "100%" }}>
                    <div style={{ fontSize: 13.5 }}>{r.label}</div>
                    {/* the bar is the comparison; the number is the answer */}
                    <div style={{ height: 4, borderRadius: 2, background: C.lineSoft, marginTop: 5 }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2,
                        background: C.green600 }} />
                    </div>
                  </td>
                  <td style={{ ...td, ...tdNum, fontWeight: 600, verticalAlign: "top" }}>
                    {nf(r.hours, 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Detail({ rows }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
      overflow: "hidden" }}>
      <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.lineSoft}` }}>
        <SectionLabel noMargin>Every entry</SectionLabel>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              {["Date", "Mechanic", "Unit", "Where", "Cost code", "Work order", "What", "Hours"]
                .map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i === 7 ? "right" : "left" }}>{h}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td>
                <td style={td}>{r.mechanic}</td>
                <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{r.unit}</td>
                <td style={{ ...td, color: C.muted }}>{r.where}</td>
                <td style={td}>
                  <span style={{ fontFamily: FM }}>{r.costCode}</span>
                  <span style={{ color: C.muted }}> {r.costCodeName}</span>
                </td>
                <td style={{ ...td, fontFamily: FM, color: C.muted }}>{r.workOrder || "—"}</td>
                <td style={{ ...td, color: C.muted }}>{r.note || "—"}</td>
                <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{nf(r.hours, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
