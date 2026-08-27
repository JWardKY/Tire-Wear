import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD } from "./theme.js";
import { fmtDate, toCSV, Btn, Field, Modal, SectionLabel, inp, th, td, tdNum } from "./ui.jsx";
import * as buy from "./purchasingData.js";
import * as setup from "./setupData.js";

/* ── Work ─────────────────────────────────────────────────────────
   Two views over the same shop.

   Work orders turns every open defect into a numbered job somebody can
   be put on. Opening one is idempotent, so the board can ask for a
   number on every load without a truck collecting four of them for one
   fault.

   Work history is every event, from a view over the real tables rather
   than an audit log somebody has to remember to write to. A hand-kept
   audit trail drifts the first time a code path forgets it, and then it
   is worse than nothing because people trust it. */

const PRIORITY = { now: 0, today: 1, normal: 2 };
const PRIO_LABEL = { now: "Now", today: "Today", normal: "Normal" };
const KINDS = [
  ["all", "All work"], ["defect", "Defects"], ["hours", "Hours"],
  ["parts", "Parts"], ["pm", "Services"], ["tires", "Tires"], ["order", "Orders"],
];

export default function WorkSection({ who, tab, onBusy }) {
  const [err, setErr] = useState("");
  const run = useCallback(async (fn) => {
    onBusy?.(true); setErr("");
    try { await fn(); } catch (e) { setErr(e.message || String(e)); }
    finally { onBusy?.(false); }
  }, [onBusy]);

  return (
    <div>
      {err && <div style={{ background: C.pull, color: "#fff", padding: "8px 12px",
                            borderRadius: 4, marginBottom: 12, fontSize: 13 }}>{err}</div>}
      {tab === "history"
        ? <History />
        : <Orders who={who} run={run} setErr={setErr} />}
    </div>
  );
}

/* ── Work orders ───────────────────────────────────────────────── */

function Orders({ who, run, setErr }) {
  const [wos, setWos] = useState([]);
  const [roster, setRoster] = useState([]);
  const [filter, setFilter] = useState("live");
  const [closing, setClosing] = useState(null);
  const [synced, setSynced] = useState(null);

  const load = useCallback(async () => {
    const states = filter === "all" ? null
      : filter === "live" ? ["open", "in progress"] : [filter];
    const [w, r] = await Promise.all([
      buy.listWorkOrders(states), setup.listRoster(),
    ]);
    setWos(w); setRoster(r.filter((m) => m.active));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  /* Every open defect gets a number the first time this is opened.
     Idempotent, so running it again costs nothing and changes nothing. */
  const sync = () => run(async () => {
    const r = await buy.syncDefectWorkOrders(who);
    setSynced(r);
    await load();
  });

  const shown = useMemo(
    () => [...wos].sort((a, b) =>
      (PRIORITY[a.priority] ?? 9) - (PRIORITY[b.priority] ?? 9) ||
      b.wo.localeCompare(a.wo)), [wos]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <SectionLabel>Work orders · {shown.length}</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select style={{ ...inp, width: 160 }} value={filter}
                  onChange={(e) => setFilter(e.target.value)}>
            <option value="live">Open and in progress</option>
            <option value="open">Open only</option>
            <option value="in progress">In progress</option>
            <option value="done">Done</option>
            <option value="all">Everything</option>
          </select>
          <Btn tone="ghost" onClick={sync}>NUMBER THE OPEN DEFECTS</Btn>
        </div>
      </div>

      {synced && (
        <div style={{ background: C.good, color: "#fff", padding: "8px 12px",
                      borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
          {synced.opened} work order{synced.opened === 1 ? "" : "s"} opened
          {synced.linked ? `, ${synced.linked} defect${synced.linked === 1 ? "" : "s"} linked` : ""}.
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>WO</th><th style={th}>Unit</th><th style={th}>What</th>
            <th style={th}>Priority</th><th style={th}>Who is on it</th>
            <th style={th}>State</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {shown.map((w) => (
              <tr key={w.id}>
                <td style={{ ...td, fontFamily: "monospace" }}>{w.wo}</td>
                <td style={td}>{w.unit}</td>
                <td style={td}>
                  {w.title}
                  {w.detail && (
                    <div style={{ color: C.muted, fontSize: 12 }}>{w.detail}</div>
                  )}
                </td>
                <td style={td}>
                  <span style={{
                    color: w.priority === "now" ? C.pull
                         : w.priority === "today" ? C.watch : C.muted,
                    fontWeight: w.priority === "normal" ? 400 : 700,
                  }}>{PRIO_LABEL[w.priority]}</span>
                </td>
                <td style={td}>
                  <select style={{ ...inp, maxWidth: 180 }}
                    value={w.assignedTo || ""}
                    disabled={w.state === "done"}
                    onChange={(e) => run(async () => {
                      const m = roster.find((x) => x.id === e.target.value);
                      await buy.assignWorkOrder(w.id, m || null);
                      await load();
                    })}>
                    <option value="">— nobody —</option>
                    {roster.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </td>
                <td style={td}>{w.state}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  {w.state !== "done" && (
                    <Btn tone="ghost" onClick={() => setClosing(w)}>DONE</Btn>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={7}>
                No work orders. <b>Number the open defects</b> gives every
                outstanding fault a number somebody can be put on.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ color: C.muted, fontSize: 12, marginTop: 12, maxWidth: 640 }}>
        Nobody on the roster yet means nothing to assign to — add mechanics under
        Setup. Closing a work order here does not mark the defect repaired; that
        is done on the Defects tab, by whoever actually fixed it.
      </p>

      {closing && (
        <CloseDialog w={closing} onClose={() => setClosing(null)}
          onDone={(note) => run(async () => {
            await buy.closeWorkOrder(closing.id, note, who);
            setClosing(null); await load();
          })} />
      )}
    </>
  );
}

function CloseDialog({ w, onClose, onDone }) {
  const [note, setNote] = useState("");
  return (
    <Modal title={`Close ${w.wo}`} onClose={onClose}>
      <p style={{ fontSize: 13, color: C.muted, marginTop: 0 }}>
        {w.unit} · {w.title}
      </p>
      <Field label="What was done">
        <input style={inp} value={note} autoFocus
               onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p style={{ fontSize: 12, color: C.muted }}>
        This closes the work order. It does not mark the defect repaired —
        that belongs to whoever fixed it, on the Defects tab.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn tone="ghost" onClick={onClose}>CANCEL</Btn>
        <Btn onClick={() => onDone(note)}>CLOSE IT</Btn>
      </div>
    </Modal>
  );
}

/* ── Work history ──────────────────────────────────────────────── */

const iso = (d) => d.toISOString().slice(0, 10);

function History() {
  const [rows, setRows] = useState([]);
  const [kind, setKind] = useState("all");
  const [unit, setUnit] = useState("all");
  const [whoF, setWhoF] = useState("all");
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return iso(d);
  });
  const [to, setTo] = useState(() => iso(new Date()));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    buy.workHistory({ from, to })
      .then((r) => { if (live) { setRows(r); setLoading(false); } })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [from, to]);

  const units = useMemo(
    () => [...new Set(rows.map((r) => r.unit).filter(Boolean))].sort(), [rows]);
  const people = useMemo(
    () => [...new Set(rows.map((r) => r.who).filter(Boolean))].sort(), [rows]);

  const shown = useMemo(() => rows.filter((r) =>
    (kind === "all" || r.kind === kind) &&
    (unit === "all" || r.unit === unit) &&
    (whoF === "all" || r.who === whoF)), [rows, kind, unit, whoF]);

  /* The audit export is the whole record, timestamps and all, because
     the point of an audit is that somebody else can check it. */
  const exportCsv = () => {
    const csv = toCSV([
      ["Timestamp", "Date", "Type", "What", "Unit", "Summary", "Who", "Work order", "Hours"],
      ...shown.map((r) => [
        r.at, r.at.slice(0, 10), r.kind, r.what, r.unit, r.summary,
        r.who, r.workOrder, r.hours ?? "",
      ]),
    ]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `work-history_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sel = { ...inp, width: "auto", minWidth: 120 };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <SectionLabel>Work history · {shown.length}</SectionLabel>
        <Btn tone="ghost" disabled={!shown.length} onClick={exportCsv}>AUDIT EXPORT</Btn>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <input type="date" style={sel} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" style={sel} value={to} onChange={(e) => setTo(e.target.value)} />
        <select style={sel} value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select style={sel} value={whoF} onChange={(e) => setWhoF(e.target.value)}>
          <option value="all">Everyone</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select style={sel} value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="all">All units</option>
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ color: C.muted, padding: 20 }}>Reading the history…</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={th}>When</th><th style={th}>What</th><th style={th}>Unit</th>
              <th style={th}>Detail</th><th style={th}>Who</th><th style={th}>Hours</th>
            </tr></thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={`${r.id}-${i}`}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {fmtDate(r.at.slice(0, 10))}
                    <span style={{ color: C.muted }}>
                      {" "}{r.at.slice(11, 16)}
                    </span>
                  </td>
                  <td style={td}>{r.what}</td>
                  <td style={td}>{r.unit}</td>
                  <td style={td}>{r.summary}</td>
                  <td style={{ ...td, color: C.muted }}>{r.who}</td>
                  <td style={tdNum}>{r.hours ?? ""}</td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td style={{ ...td, color: C.muted }} colSpan={6}>
                  Nothing in that range.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
