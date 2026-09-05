import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD } from "./theme.js";
import { fmtDate, nf, toCSV, Btn, Field, Modal, SectionLabel, inp, th, td, tdNum } from "./ui.jsx";
import * as buy from "./purchasingData.js";
import * as setup from "./setupData.js";
import * as parts from "./partsData.js";

/* ── Work ─────────────────────────────────────────────────────────
   Two views over the same shop.

   Work orders turns every open defect into a numbered job somebody can
   be put on. Opening one is idempotent, so the board can ask for a
   number on every load without a truck collecting four of them for one
   fault.

   A job does not have to come from a defect. Plenty of shop work never
   gets written up on a DVIR — a scheduled swap, something a foreman
   decided on, work on a truck that is not even ours. NEW WORK ORDER
   opens one directly, and from there it is the same numbered job as any
   other: assign it, issue parts to it, book hours against it.

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

export default function WorkSection({ who, tab, onBusy, focus, onClearFocus }) {
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
        : <Orders who={who} run={run} setErr={setErr}
            focusWo={focus?.wo || null} onClearFocus={onClearFocus} />}
    </div>
  );
}

/* ── Work orders ───────────────────────────────────────────────── */

function Orders({ who, run, setErr, focusWo, onClearFocus }) {
  const [wos, setWos] = useState([]);
  const [roster, setRoster] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [filter, setFilter] = useState("live");
  const [closing, setClosing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [issuing, setIssuing] = useState(null);
  const [open, setOpen] = useState(null);
  /* Bumped after a part is issued. Lines is keyed on it, so a row that
     was already expanded refetches instead of showing the shelf as it
     was a moment ago. */
  const [linesNonce, setLinesNonce] = useState(0);
  const [synced, setSynced] = useState(null);

  const load = useCallback(async () => {
    const states = filter === "all" ? null
      : filter === "live" ? ["open", "in progress"] : [filter];
    const [w, r, v] = await Promise.all([
      buy.listWorkOrders(states), setup.listRoster(), setup.listVehicles(),
    ]);
    setWos(w); setRoster(r.filter((m) => m.active));
    setVehicles(v.filter((x) => x.active));
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

  /* Arrived from somebody tapping a job on their own worklist. The row
     opens itself rather than leaving them to find one number in sixty,
     and the filter widens if the order is not in the current one — a
     job somebody was sent to and cannot see reads as a bug. */
  useEffect(() => {
    if (!focusWo || !wos.length) return;
    const hit = wos.find((w) => w.wo === focusWo);
    if (hit) { setOpen(hit.id); onClearFocus?.(); }
    else if (filter !== "all") setFilter("all");
    /* Widened as far as it goes and still not there. Clearing rather
       than retrying every render: a focus that cannot be satisfied is
       finished, not pending. */
    else onClearFocus?.();
  }, [focusWo, wos, filter, onClearFocus]);

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
          <Btn onClick={() => setCreating(true)}>NEW WORK ORDER</Btn>
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
              <React.Fragment key={w.id}>
              <tr>
                <td style={{ ...td, fontFamily: "monospace" }}>
                  <button onClick={() => setOpen(open === w.id ? null : w.id)}
                    title="Parts and hours on this order"
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer",
                             font: "inherit", color: C.green700, textDecoration: "underline" }}>
                    {w.wo}
                  </button>
                </td>
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
                <td style={td}>
                  {w.state}
                  {w.holdReason && (
                    <div style={{ color: C.watch, fontSize: 12, fontWeight: 600 }}>
                      {w.holdReason}
                    </div>
                  )}
                </td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {w.state !== "done" && (
                    <>
                      <Btn tone="ghost" onClick={() => setIssuing(w)}>PARTS</Btn>
                      {" "}
                      <Btn tone="ghost" onClick={() => setClosing(w)}>DONE</Btn>
                    </>
                  )}
                </td>
              </tr>
              {open === w.id && (
                <tr><td colSpan={7} style={{ ...td, background: C.paper }}>
                  <Lines key={`${w.id}:${linesNonce}`} wo={w.wo} />
                </td></tr>
              )}
              </React.Fragment>
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

      <p style={{ color: C.muted, fontSize: 12, marginTop: 12, maxWidth: 680 }}>
        Nobody on the roster yet means nothing to assign to — add mechanics under
        Setup. Tap a WO number to see the parts and hours on it. Closing a work
        order here does not mark a defect repaired; that is done on the Defects
        tab, by whoever actually fixed it.
      </p>

      {creating && (
        <NewOrderDialog vehicles={vehicles} roster={roster}
          onClose={() => setCreating(false)}
          onSave={(info) => run(async () => {
            await buy.createWorkOrder(info, who);
            setCreating(false); await load();
          })} />
      )}

      {issuing && (
        <IssuePartsDialog w={issuing} who={who}
          onClose={() => setIssuing(null)}
          onDone={() => {
            setOpen(issuing.id);
            setLinesNonce((n) => n + 1);
            setIssuing(null);
          }} />
      )}

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

/* ── A job somebody decided on ─────────────────────────────────── */

/* The unit is a dropdown over the equipment list rather than a typed
   number, so a work order lands on the same truck the tires, services
   and hours do. Anything not in Motive — a rental, a customer's truck —
   gets added under Setup → Equipment first and then appears here.

   Blank is allowed and means it. Not every job is a truck: a shelving
   build or a yard tidy is real work somebody should be able to number
   and book hours against. */
function NewOrderDialog({ vehicles, roster, onClose, onSave }) {
  const [f, setF] = useState({
    vehId: "", title: "", detail: "", priority: "normal", assignTo: "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const veh = vehicles.find((v) => v.id === f.vehId);
  const ready = f.title.trim().length > 0;

  return (
    <Modal title="New work order" onClose={onClose} width={560}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Unit">
          <select style={inp} value={f.vehId} onChange={set("vehId")}>
            <option value="">No unit — shop job</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.num}{v.manual ? " (not in Motive)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select style={inp} value={f.priority} onChange={set("priority")}>
            <option value="normal">Normal</option>
            <option value="today">Today</option>
            <option value="now">Now</option>
          </select>
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="What needs doing">
            <input style={inp} value={f.title} autoFocus onChange={set("title")}
              placeholder="Replace the drive-side mirror" />
          </Field>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Detail">
            <input style={inp} value={f.detail} onChange={set("detail")}
              placeholder="optional" />
          </Field>
        </div>
        <Field label="Put someone on it">
          <select style={inp} value={f.assignTo} onChange={set("assignTo")}>
            <option value="">— nobody yet —</option>
            {roster.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      </div>

      <p style={{ fontSize: 12.5, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
        This gets its own number off the same run as every other work order. It is
        not tied to a defect, so no sync will ever renumber it or close it — only
        somebody here can.
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <Btn tone="ghost" onClick={onClose}>CANCEL</Btn>
        <Btn disabled={!ready} onClick={() => onSave({
          vehId: f.vehId || null,
          unit: veh ? veh.num : null,
          title: f.title.trim(),
          detail: f.detail.trim() || null,
          priority: f.priority,
          assignTo: f.assignTo ? roster.find((m) => m.id === f.assignTo) : null,
        })}>OPEN IT</Btn>
      </div>
    </Modal>
  );
}

/* ── Parts onto a work order ───────────────────────────────────── */

/* This issues stock the same way the Inventory screen does — same
   function, same ledger, same trigger moving on_hand. The only thing it
   adds is filling in the work order number and the truck for you,
   instead of somebody typing WO-1043 into a box and getting a digit
   wrong. */
function IssuePartsDialog({ w, who, onClose, onDone }) {
  const [all, setAll] = useState(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(null);
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    parts.listParts()
      .then((rows) => setAll(rows.filter((p) => p.active !== false)))
      .catch((e) => setErr(e.message || String(e)));
  }, []);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!all || !s) return [];
    return all.filter((p) =>
      `${p.num} ${p.name}`.toLowerCase().includes(s)).slice(0, 12);
  }, [all, q]);

  const n = Number(qty);
  const save = async () => {
    setBusy(true); setErr("");
    try {
      await parts.move(pick.id, "issue", n,
        { vehId: w.vehId || null, workOrder: w.wo, note: note || null }, who);
      onDone();
    } catch (e) {
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`Issue parts to ${w.wo}`}
      sub={`${w.unit || "shop job"} · ${w.title}`} onClose={onClose} width={560}>
      {err && <div style={{ background: C.pull, color: "#fff", padding: "8px 12px",
                            borderRadius: 4, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      <Field label="Find a part">
        <input style={inp} value={q} autoFocus onChange={(e) => { setQ(e.target.value); setPick(null); }}
          placeholder={all ? "part number or description" : "loading the shelf…"} />
      </Field>

      {!pick && hits.map((p) => (
        <button key={p.id} onClick={() => { setPick(p); setQ(`${p.num} — ${p.name}`); }}
          style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                   background: C.card, border: `1px solid ${C.line}`, borderRadius: 6,
                   padding: "7px 10px", marginBottom: 4, font: "inherit", fontSize: 13 }}>
          <b style={{ fontFamily: "monospace" }}>{p.num}</b> {p.name}
          <span style={{ color: C.muted }}>
            {" · "}{nf(p.available)} on the shelf{p.shop ? ` · ${p.shop}` : ""}
          </span>
        </button>
      ))}

      {pick && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 4 }}>
          <Field label={`How many (${pick.uom || "each"})`}>
            <input type="number" min="1" step="1" style={inp} value={qty}
              onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="On hand after">
            <div style={{ padding: "8px 0", fontWeight: 600,
              color: pick.onHand - n < 0 ? C.pull : C.ink }}>
              {nf(pick.onHand)} → {nf(pick.onHand - n)}
            </div>
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Note">
              <input style={inp} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="optional" />
            </Field>
          </div>
        </div>
      )}

      {pick && n > pick.available && (
        <p style={{ fontSize: 12.5, color: C.watch, fontWeight: 600, lineHeight: 1.5 }}>
          That is more than the {nf(pick.available)} available. It will still go
          through — the shelf is the truth and the count should follow it — but
          check the bin.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn tone="ghost" onClick={onClose}>CANCEL</Btn>
        <Btn disabled={!pick || !(n > 0) || busy} onClick={save}>ISSUE</Btn>
      </div>
    </Modal>
  );
}

/* ── What has gone onto an order ───────────────────────────────── */

/* Parts and hours found by the order's number, which is how they were
   already being recorded — a part issued against WO-1043 by somebody
   typing the number counts here exactly the same as one issued from the
   button above. */
function Lines({ wo }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    buy.workOrderLines(wo)
      .then((r) => { if (live) setD(r); })
      .catch((e) => { if (live) setErr(e.message || String(e)); });
    return () => { live = false; };
  }, [wo]);

  if (err) return <span style={{ color: C.pull, fontSize: 12.5 }}>{err}</span>;
  if (!d) return <span style={{ color: C.muted, fontSize: 12.5 }}>loading…</span>;
  if (!d.parts.length && !d.hours.length)
    return (
      <span style={{ color: C.muted, fontSize: 12.5 }}>
        Nothing on this order yet. <b>PARTS</b> issues stock to it, and hours
        booked against {wo} on the Hours tab land here too.
      </span>
    );

  return (
    <div style={{ display: "flex", gap: 32, flexWrap: "wrap", fontSize: 12.5 }}>
      {d.parts.length > 0 && (
        <div>
          <div style={{ fontFamily: FD, fontWeight: 700, color: C.green900, marginBottom: 4 }}>
            Parts
          </div>
          {d.parts.map((p) => (
            <div key={p.id} style={{ color: C.muted, lineHeight: 1.7 }}>
              <span style={{ fontFamily: "monospace", color: C.ink }}>{nf(p.qty)} × {p.num}</span>
              {p.name ? ` ${p.name}` : ""}
              {p.cost != null ? ` · $${nf(p.cost, 2)}` : ""}
              {p.who ? ` · ${p.who}` : ""}
            </div>
          ))}
          <div style={{ marginTop: 4, fontWeight: 700, color: C.ink }}>
            ${nf(d.partsCost, 2)}
            {d.partsWithoutCost > 0 && (
              <span style={{ color: C.muted, fontWeight: 400 }}>
                {" "}· {d.partsWithoutCost} with no cost on file, not counted
              </span>
            )}
          </div>
        </div>
      )}
      {d.hours.length > 0 && (
        <div>
          <div style={{ fontFamily: FD, fontWeight: 700, color: C.green900, marginBottom: 4 }}>
            Hours
          </div>
          {d.hours.map((h) => (
            <div key={h.id} style={{ color: C.muted, lineHeight: 1.7 }}>
              <span style={{ color: C.ink }}>{nf(h.hours, 2)} h</span>
              {h.who ? ` · ${h.who}` : ""}{h.costCode ? ` · ${h.costCode}` : ""}
            </div>
          ))}
          <div style={{ marginTop: 4, fontWeight: 700, color: C.ink }}>
            {nf(d.hoursTotal, 2)} h
          </div>
        </div>
      )}
    </div>
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
