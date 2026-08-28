import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD, FM } from "./theme.js";
import { fmtDate, nf, toCSV, Btn, Field, SectionLabel, inp, th, td, tdNum, linkBtn, Modal }
  from "./ui.jsx";
import * as time from "./timeData.js";
import * as wlog from "./logData.js";
import * as clock from "./nowData.js";
import { todayISO } from "./day.js";

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
/* The shop's day. This was `new Date().toISOString()`, which is the UTC
   date and puts the week boundary in the wrong place for an evening
   shift — the same trap day.js exists to close. */
const todayStr = todayISO;
function addDays(iso, n) {
  const x = new Date(iso + "T00:00:00");
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

const RANGES = [
  ["week", "This week"],
  ["last", "Last week"],
  ["month", "This month"],
  ["prevmonth", "Last month"],
  ["custom", "Custom…"],
];

function rangeFor(key) {
  const today = todayStr();
  if (key === "week") return [startOfWeek(today), today];
  if (key === "last") {
    const thisMon = startOfWeek(today);
    return [addDays(thisMon, -7), addDays(thisMon, -1)];
  }
  if (key === "prevmonth") {
    const firstOfThis = today.slice(0, 8) + "01";
    const lastOfPrev = addDays(firstOfThis, -1);
    return [lastOfPrev.slice(0, 8) + "01", lastOfPrev];
  }
  return [today.slice(0, 8) + "01", today];
}

export default function HoursSection({ who, tab, onBusy, supervisor }) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  /* A preset writes the dates; typing a date switches the preset to
     Custom. Payroll runs on pay periods, and a pay period does not line
     up with "this week" — the presets are a shortcut, not the range. */
  const [rangeKey, setRangeKey] = useState("week");
  const [from, setFrom] = useState(() => rangeFor("week")[0]);
  const [to, setTo] = useState(() => rangeFor("week")[1]);
  const pickRange = (k) => {
    setRangeKey(k);
    if (k === "custom") return;
    const [f, t] = rangeFor(k);
    setFrom(f);
    setTo(t);
  };
  const setEnd = (which) => (e) => {
    const v = e.target.value;
    if (!v) return;
    setRangeKey("custom");
    (which === "from" ? setFrom : setTo)(v);
  };
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

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

  /* The payroll export is Jason's seventeen columns, read straight from
     tw_payroll_lines rather than rebuilt out of what happens to be on
     this screen. The search box narrows the tables; payroll gets the
     whole range, because a filtered payroll run is a wrong one. */
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      const lines = await time.payrollLines(from, to);
      const rows = [time.PAYROLL_COLUMNS, ...lines.map(time.payrollRow)];
      const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `allen-payroll-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      setErr(null);
    } catch (e) {
      setErr(`Could not build the payroll export — ${e.message || e}`);
    } finally {
      setExporting(false);
    }
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
            <select value={rangeKey} onChange={(e) => pickRange(e.target.value)}
              style={{ ...inp, width: 140 }}>
              {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input type="date" value={from} max={to} onChange={setEnd("from")}
              aria-label="From" style={{ ...inp, width: 150 }} />
            <input type="date" value={to} min={from} onChange={setEnd("to")}
              aria-label="To" style={{ ...inp, width: 150 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Find a name, truck or code" style={{ ...inp, width: 200 }} />
            <Btn tone="ghost" onClick={exportCsv} disabled={exporting || !rows.length}>
              {exporting ? "Building…" : "Payroll CSV"}
            </Btn>
          </div>
        </div>

        {tab === "cards" ? (
          <Cards from={from} to={to} q={q} who={supervisor?.name || who} onErr={setErr} />
        ) : tab === "log" ? (
          <WorkLog from={from} to={to} q={q} onErr={setErr} />
        ) : rows.length === 0 ? (
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
          <>
            <div className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
              <Rollup title="Hours by mechanic" rows={byMechanic} total={total} />
              <Rollup title="Wrench hours by unit" rows={byUnit} total={total} />
              <Rollup title="By cost code" rows={byCode} total={total} wide />
            </div>
            <WhereTheTimeWent rows={shown} />
          </>
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

/* ── Where the time went ──────────────────────────────────────────
   Shop against outside service calls against indirect time, as one
   bar. Jason's dashboard reads it at a glance and so should this: the
   question is not how many hours, it is what shape the week was.

   Field and plant fold into the two ends they belong to — field work
   is a call, plant work is indirect — so the bar has three parts and
   not five. A five-colour bar answers nothing faster than a table. */

const SPLIT = [
  ["shop", "Shop", C.green700, ["shop"]],
  ["call", "Outside service call", C.watch, ["road", "field"]],
  ["indirect", "Shop & indirect", C.muted, ["plant"]],
];

function WhereTheTimeWent({ rows }) {
  const parts = useMemo(() => {
    const total = rows.reduce((a, r) => a + r.hours, 0);
    return {
      total,
      bands: SPLIT.map(([key, label, colour, wheres]) => {
        const hours = rows
          .filter((r) => wheres.includes(r.where))
          .reduce((a, r) => a + r.hours, 0);
        return { key, label, colour, hours, pct: total ? (hours / total) * 100 : 0 };
      }),
    };
  }, [rows]);

  if (!parts.total) return null;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
      overflow: "hidden", marginTop: 16 }}>
      <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.lineSoft}` }}>
        <SectionLabel noMargin>Where the time went</SectionLabel>
      </div>
      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ display: "flex", height: 20, borderRadius: 4, overflow: "hidden",
          background: C.paper, border: `1px solid ${C.line}` }}>
          {parts.bands.filter((b) => b.hours > 0).map((b) => (
            <div key={b.key} title={`${b.label} — ${nf(b.hours, 2)} hr`}
              style={{ width: `${b.pct}%`, background: b.colour }} />
          ))}
        </div>
        <div className="flex flex-wrap" style={{ gap: 18, marginTop: 11 }}>
          {parts.bands.map((b) => (
            <div key={b.key} className="flex items-center" style={{ gap: 7 }}>
              <span style={{ width: 11, height: 11, borderRadius: 2, background: b.colour,
                display: "inline-block" }} />
              <span style={{ fontSize: 13 }}>{b.label}</span>
              <span style={{ fontFamily: FM, fontSize: 13, fontWeight: 600 }}>
                {nf(b.hours, 2)}
              </span>
              <span style={{ fontSize: 12, color: C.muted }}>
                {parts.total ? Math.round(b.pct) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Timecards ────────────────────────────────────────────────────
   One row per mechanic per day: hours on the clock against hours
   booked to a unit and a code. Jason's rule 5 says those two numbers
   will not always agree and both must be kept, so the gap is the
   column that matters and the board sorts nothing above it.

   Deleting a card needs a reason, and the reason plus the whole card
   goes to the work log before a single row is removed. */

function Cards({ from, to, q, who, onErr }) {
  const [all, setAll] = useState(null);
  const [open, setOpen] = useState(null);   // the day being looked at
  const [busy, setBusy] = useState(false);
  const [mech, setMech] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try { setAll(await time.timecardDays(from, to)); }
    catch (e) { onErr?.(`Could not load timecards — ${e.message || e}`); }
  }, [from, to, onErr]);

  useEffect(() => { load(); }, [load]);

  /* Only mechanics who actually have a card in this range. A dropdown
     of the whole roster is mostly names with nothing behind them. */
  const roster = useMemo(() => {
    const m = new Map();
    (all || []).forEach((d) => m.set(d.mechanicId, d.mechanic));
    return [...m].map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all]);

  const days = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (all || []).filter((d) =>
      (!mech || d.mechanicId === mech)
      && (!s || `${d.mechanic} ${d.empNo}`.toLowerCase().includes(s)));
  }, [all, mech, q]);

  /* The numbers a supervisor is actually chasing, before they open
     anything: what the shop clocked, what it booked, and the gap. */
  const kpi = useMemo(() => {
    const clocked = days.reduce((a, d) => a + d.clockHours, 0);
    const booked = days.reduce((a, d) => a + d.bookedHours, 0);
    return {
      cards: days.length,
      clocked, booked,
      gap: clocked - booked,
      offBalance: days.filter((d) => !d.stillOpen && Math.abs(d.difference) >= 0.25).length,
      running: days.filter((d) => d.stillOpen).length,
    };
  }, [days]);

  /* The short export: one row per mechanic per cost code. The payroll
     CSV is the full seventeen columns; this is the one you read. */
  async function summaryCsv() {
    setExporting(true);
    try {
      const lines = await time.payrollLines(from, to);
      const keep = lines.filter((r) =>
        (!mech || r.mechanicId === mech)
        && (!q.trim() || `${r.mechanic} ${r.empNo}`.toLowerCase()
              .includes(q.trim().toLowerCase())));
      const m = new Map();
      keep.forEach((r) => {
        const k = `${r.mechanicId}|${r.costCode}`;
        const g = m.get(k) || {
          mechanic: r.mechanic, empNo: r.empNo,
          costCode: r.costCode, costCodeName: r.costCodeName, hours: 0, lines: 0,
        };
        g.hours = Math.round((g.hours + r.hours) * 100) / 100;
        g.lines += 1;
        m.set(k, g);
      });
      const body = [...m.values()]
        .sort((a, b) => a.mechanic.localeCompare(b.mechanic)
          || String(a.costCode).localeCompare(String(b.costCode)))
        .map((g) => [g.mechanic, g.empNo, g.costCode, g.costCodeName, g.hours, g.lines]);
      const head = ["Mechanic", "Employee #", "Cost code", "Cost code name", "Hours", "Lines"];
      const blob = new Blob([toCSV([head, ...body])], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `allen-hours-summary-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      onErr?.(`Could not build the summary — ${e.message || e}`);
    } finally {
      setExporting(false);
    }
  }

  if (!all) return <div style={{ padding: 30, color: C.muted }}>Loading timecards…</div>;

  if (!all.length) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 28 }}>
        <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900 }}>
          No timecards in this range
        </div>
        <p style={{ fontSize: 14, color: C.muted, marginTop: 6, maxWidth: 620, lineHeight: 1.55 }}>
          A card appears here as soon as somebody punches in or books an hour.
        </p>
      </div>
    );
  }

  const tone = (d) => {
    if (d.stillOpen) return C.muted;
    if (Math.abs(d.difference) < 0.01) return C.good;
    return Math.abs(d.difference) >= 1 ? C.pull : C.watch;
  };

  return (
    <>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
        overflow: "hidden" }}>
        <div className="flex flex-wrap items-center justify-between"
          style={{ gap: 8, padding: "11px 16px", borderBottom: `1px solid ${C.lineSoft}` }}>
          <SectionLabel noMargin>
            Timecards · {days.length}{days.length !== all.length ? ` of ${all.length}` : ""}
          </SectionLabel>
          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            <select value={mech} onChange={(e) => setMech(e.target.value)}
              style={{ ...inp, width: 200 }}>
              <option value="">All mechanics</option>
              {roster.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <Btn tone="ghost" disabled={exporting || !days.length} onClick={summaryCsv}>
              {exporting ? "Building…" : "Summary CSV"}
            </Btn>
          </div>
        </div>

        <Kpi items={[
          ["Cards", nf(kpi.cards)],
          ["On the clock", nf(kpi.clocked, 2)],
          ["Booked", nf(kpi.booked, 2)],
          ["Gap", `${kpi.gap > 0 ? "+" : ""}${nf(kpi.gap, 2)}`,
            Math.abs(kpi.gap) >= 1 ? C.pull : Math.abs(kpi.gap) >= 0.01 ? C.watch : C.good],
          ["Out of balance", nf(kpi.offBalance), kpi.offBalance ? C.watch : C.muted],
          ["Still clocked in", nf(kpi.running), kpi.running ? C.green700 : C.muted],
        ]} />

        {days.length === 0 && (
          <div style={{ padding: 22, fontSize: 14, color: C.muted, lineHeight: 1.55 }}>
            Nothing matches that. {all.length} card{all.length === 1 ? "" : "s"} in the range.
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
            <thead>
              <tr>
                {["Date", "Mechanic", "Emp #", "On the clock", "Booked", "True", "Gap", "Lines", ""]
                  .map((h, i) => (
                    <th key={h || i}
                      style={{ ...th, textAlign: i >= 3 && i <= 7 ? "right" : "left" }}>{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={`${d.mechanicId}-${d.date}`} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(d.date)}</td>
                  <td style={td}>{d.mechanic}</td>
                  <td style={{ ...td, fontFamily: FM, color: C.muted }}>{d.empNo || "—"}</td>
                  <td style={{ ...td, ...tdNum }}>
                    {d.stillOpen ? <span style={{ color: C.muted }}>on the clock</span>
                      : nf(d.clockHours, 2)}
                  </td>
                  <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{nf(d.bookedHours, 2)}</td>
                  <td style={{ ...td, ...tdNum, color: C.muted }}>{nf(d.trueHours, 2)}</td>
                  <td style={{ ...td, ...tdNum, fontWeight: 700, color: tone(d) }}>
                    {d.stillOpen ? "—"
                      : `${d.difference > 0 ? "+" : ""}${nf(d.difference, 2)}`}
                  </td>
                  <td style={{ ...td, ...tdNum }}>
                    {d.lines}
                    {d.uncodedLines > 0 && (
                      <span style={{ color: C.pull, fontWeight: 700 }}> · {d.uncodedLines} uncoded</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <button onClick={() => setOpen(d)} style={{ ...linkBtn, fontSize: 12.5 }}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.lineSoft}`,
          fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>
          The gap is hours on the clock less hours booked to a unit and a cost code.
          A positive number is time nobody can charge out yet.
        </div>
      </div>

      {open && (
        <CardDialog day={open} who={who} busy={busy} setBusy={setBusy}
          onClose={() => setOpen(null)}
          onErr={onErr}
          onDeleted={async () => { setOpen(null); await load(); }} />
      )}
    </>
  );
}

function CardDialog({ day, who, busy, setBusy, onClose, onErr, onDeleted }) {
  const [entries, setEntries] = useState(null);
  const [shifts, setShifts] = useState(null);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      time.listDay(day.mechanicId, day.date),
      /* The punches, not just the total. "Clocked 9, booked 6" invites
         the question "when did they clock in and out", and a dialog
         that cannot answer it sends somebody to another screen. */
      clock.shiftsForDay(day.mechanicId, day.date),
    ])
      .then(([e, sh]) => { if (live) { setEntries(e); setShifts(sh); } })
      .catch((e) => onErr?.(e.message || String(e)));
    return () => { live = false; };
  }, [day, onErr]);

  const hm = (iso) => (iso
    ? new Date(iso).toLocaleTimeString("en-US",
        { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })
    : "—");

  const remove = async () => {
    setBusy(true);
    try {
      await time.deleteCard(day.mechanicId, day.date, reason, who);
      await onDeleted();
    } catch (e) {
      onErr?.(`The card was not deleted — ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${day.mechanic} — ${fmtDate(day.date)}`}
      sub={`${nf(day.clockHours, 2)} on the clock · ${nf(day.bookedHours, 2)} booked`}
      onClose={onClose} width={720}>
      {shifts && (
        <div style={{ marginBottom: 14, paddingBottom: 12,
          borderBottom: `1px solid ${C.lineSoft}` }}>
          <div style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 600,
            letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted,
            marginBottom: 6 }}>
            Punches
          </div>
          {shifts.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted }}>
              Never clocked in on this day — the hours below were entered by hand.
            </div>
          ) : (
            <div className="flex flex-wrap" style={{ gap: 16 }}>
              {shifts.map((sh) => (
                <div key={sh.id} style={{ fontSize: 13 }}>
                  <span style={{ fontFamily: FM, fontWeight: 600 }}>
                    {hm(sh.startedAt)} – {sh.open
                      ? <span style={{ color: C.green700 }}>still on</span>
                      : hm(sh.endedAt)}
                  </span>
                  <span style={{ color: C.muted }}>
                    {sh.lunch ? ` · ${sh.lunch} min lunch` : " · no lunch"}
                    {!sh.open && ` · ${nf(sh.clockHours, 2)} hr`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!entries ? (
        <div style={{ color: C.muted }}>Loading the card…</div>
      ) : entries.length === 0 ? (
        <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55 }}>
          Nothing booked on this day — the mechanic punched in but has not entered
          any hours yet.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr>
                {["Unit", "Cost code", "Type of work", "Work order", "Hours"].map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i === 4 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                  <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{e.unit}</td>
                  <td style={td}>
                    {e.costCode
                      ? <><span style={{ fontFamily: FM }}>{e.costCode}</span>
                          <span style={{ color: C.muted }}> {e.costCodeName}</span></>
                      : <span style={{ color: C.pull, fontWeight: 600 }}>no cost code</span>}
                  </td>
                  <td style={{ ...td, color: C.muted }}>
                    {e.workTypes?.length ? e.workTypes.join(" · ") : "—"}
                  </td>
                  <td style={{ ...td, fontFamily: FM, color: C.muted }}>{e.workOrder || "—"}</td>
                  <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{nf(e.hours, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries?.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              style={{ ...linkBtn, fontSize: 13, color: C.pull }}>
              Delete this card
            </button>
          ) : (
            <>
              <Field label="Why is this card being deleted?">
                <input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Entered on the wrong day, duplicate, …" style={inp} autoFocus />
              </Field>
              <p style={{ fontSize: 12.5, color: C.muted, margin: "8px 0 0", lineHeight: 1.55 }}>
                The whole card and this reason go to the work log first, and that log
                cannot be edited or deleted by anyone. If the log will not take it,
                the card is not removed.
              </p>
              <div className="flex justify-end mt-3" style={{ gap: 8 }}>
                <Btn tone="ghost" onClick={() => { setConfirming(false); setReason(""); }}>
                  Keep it
                </Btn>
                <Btn tone="danger" disabled={busy || reason.trim().length < 4} onClick={remove}>
                  {busy ? "Deleting…" : `Delete ${entries.length} line${entries.length === 1 ? "" : "s"}`}
                </Btn>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ── The work log ─────────────────────────────────────────────────
   Append only, and shown as such. There is no edit here and there is
   no delete, because there is none in the database either. */

function WorkLog({ from, to, q, onErr }) {
  const [all, setAll] = useState(null);
  const [type, setType] = useState("");
  const [who, setWho] = useState("");
  const [unit, setUnit] = useState("");

  useEffect(() => {
    let live = true;
    /* The type filter goes to the database because it is indexed and
       cuts the most; who and unit are narrowed here, so switching them
       does not cost a round trip on a log that is already loaded. */
    wlog.listLog({ from, to, type: type || undefined })
      .then((r) => { if (live) setAll(r); })
      .catch((e) => onErr?.(`Could not load the work log — ${e.message || e}`));
    return () => { live = false; };
  }, [from, to, type, onErr]);

  const people = useMemo(
    () => [...new Set((all || []).map((r) => r.actor).filter(Boolean))].sort(),
    [all]);
  const units = useMemo(
    () => [...new Set((all || []).map((r) => r.unit).filter(Boolean))].sort(),
    [all]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (all || []).filter((r) =>
      (!who || r.actor === who)
      && (!unit || r.unit === unit)
      && (!s || `${r.summary} ${r.actor} ${r.unit} ${r.label}`.toLowerCase().includes(s)));
  }, [all, who, unit, q]);

  function exportCsv() {
    const head = ["Timestamp", "Type", "Unit", "Summary", "Recorded by", "Detail (JSON)"];
    const body = (rows || []).map((r) =>
      [r.at, r.label, r.unit, r.summary, r.actor, JSON.stringify(r.detail)]);
    const blob = new Blob([toCSV([head, ...body])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `allen-work-log-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!all) return <div style={{ padding: 30, color: C.muted }}>Loading the work log…</div>;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
      overflow: "hidden" }}>
      <div className="flex flex-wrap items-center justify-between"
        style={{ gap: 8, padding: "11px 16px", borderBottom: `1px solid ${C.lineSoft}` }}>
        <SectionLabel noMargin>
          Work log · {rows.length}{rows.length !== all.length ? ` of ${all.length}` : ""} entries
        </SectionLabel>
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <select value={type} onChange={(e) => setType(e.target.value)}
            style={{ ...inp, width: 190 }}>
            <option value="">All work</option>
            {Object.entries(wlog.EVENT_LABEL).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <select value={who} onChange={(e) => setWho(e.target.value)}
            style={{ ...inp, width: 180 }}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}
            style={{ ...inp, width: 150 }}>
            <option value="">All units</option>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <Btn tone="ghost" onClick={exportCsv} disabled={!rows.length}>Audit export</Btn>
        </div>
      </div>

      <Kpi items={[
        ["Entries", nf(rows.length)],
        ["People", nf(people.length)],
        ["Units touched", nf(units.length)],
        ["Deletions", nf(rows.filter((r) => r.type === "timecard_deleted").length),
          rows.some((r) => r.type === "timecard_deleted") ? C.pull : C.muted],
      ]} />

      {rows.length === 0 ? (
        <div style={{ padding: 26, fontSize: 14, color: C.muted, lineHeight: 1.55 }}>
          {all.length
            ? `Nothing matches that. ${all.length} entr${all.length === 1 ? "y" : "ies"} in the range.`
            : "Nothing logged in this range yet."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr>
                {["When", "What", "Unit", "What happened", "Who"].map((h) => (
                  <th key={h} style={{ ...th, textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                  <td style={{ ...td, fontFamily: FM, fontSize: 12, whiteSpace: "nowrap",
                    color: C.muted }}>
                    {new Date(r.at).toLocaleString("en-US",
                      { month: "2-digit", day: "2-digit", year: "2-digit",
                        hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap",
                    color: r.type === "timecard_deleted" ? C.pull : C.ink,
                    fontWeight: r.type === "timecard_deleted" ? 700 : 400 }}>
                    {r.label}
                  </td>
                  <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{r.unit || "—"}</td>
                  <td style={{ ...td, color: C.muted }}>{r.summary}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{r.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.lineSoft}`,
        fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>
        This log is append only. Nothing here can be edited or removed — not from
        this screen, and not from the database either. A deleted timecard keeps its
        whole contents and the reason it was deleted.
      </div>
    </div>
  );
}

/* A strip of numbers across the top of a panel. Jason's dashboard leads
   every board with one, and it is the right instinct: the question a
   supervisor opens this with is usually answered before they read a
   single row. */
function Kpi({ items }) {
  return (
    <div className="flex flex-wrap"
      style={{ gap: 0, borderBottom: `1px solid ${C.lineSoft}`, background: C.paper }}>
      {items.map(([label, value, colour]) => (
        <div key={label}
          style={{ padding: "9px 16px", borderRight: `1px solid ${C.lineSoft}`,
                   minWidth: 118, flex: "0 1 auto" }}>
          <div style={{ fontFamily: FD, fontSize: 10.5, fontWeight: 600,
                        letterSpacing: "0.1em", textTransform: "uppercase",
                        color: C.muted }}>
            {label}
          </div>
          <div style={{ fontFamily: FM, fontSize: 17, fontWeight: 600, lineHeight: 1.2,
                        color: colour || C.green900 }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
