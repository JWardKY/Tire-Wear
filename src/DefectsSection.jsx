import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD, FM } from "./theme.js";
import {
  todayISO, fmtDate, nf, Modal, Btn, Field, SectionLabel,
  inp, th, td, linkBtn,
} from "./ui.jsx";
import * as shop from "./shopData.js";

/* ── The Defects section ──────────────────────────────────────────
   A defect is something wrong with a truck: today entered by hand,
   later mirrored from Motive DVIR by the sync in step 5. The shop's
   job is the three-step loop — see it, claim it, mark it repaired.

   Ordering is the point of the Open list. Out of service comes before
   everything, then major, then oldest first: a truck that cannot legally
   roll outranks a truck with a broken mirror, however long the mirror
   has been broken. */

const SEVERITY = [
  ["minor", "Minor"],
  ["major", "Major"],
];

const CATEGORIES = [
  "Brakes", "Tires & wheels", "Lights", "Steering", "Suspension",
  "Engine", "Transmission", "Air system", "Body & glass", "Coupling",
  "Exhaust", "Cab & interior", "Fluid leak", "Other",
];

function rank(d) {
  return [
    d.safety === "unsafe" ? 0 : 1,
    d.severity === "major" ? 0 : 1,
    d.firstReported || "9999-99-99",
  ];
}

const byUrgency = (a, b) => {
  const ra = rank(a), rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] < rb[i]) return -1;
    if (ra[i] > rb[i]) return 1;
  }
  return 0;
};

const daysOld = (iso) => {
  if (!iso) return null;
  const then = new Date(iso + "T00:00:00");
  return Math.max(0, Math.round((Date.now() - then.getTime()) / 86400000));
};

export default function DefectsSection({ who, tab, onBusy }) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [defects, setDefects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [adding, setAdding] = useState(false);
  const [repairing, setRepairing] = useState(null);
  const [q, setQ] = useState("");

  const reload = useCallback(async () => {
    const [d, v] = await Promise.all([shop.listDefects(), shop.listVehicles()]);
    setDefects(d);
    setVehicles(v);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await reload();
      } catch (e) {
        setErr(`Could not load the defect list — ${e.message || e}`);
      }
      setReady(true);
    })();
  }, [reload]);

  useEffect(() => {
    onBusy?.(busy);
    return () => onBusy?.(false);
  }, [busy, onBusy]);

  const run = useCallback(async (fn) => {
    setBusy(true);
    try {
      await fn();
      await reload();
      setErr(null);
    } catch (e) {
      setErr(`That did not save — ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const wantRepaired = tab === "repaired";
    const wantClosed = tab === "closed";
    return defects
      .filter((d) => (wantClosed
        ? d.state === "closed"
        : d.state !== "closed" && (d.state === "repaired") === wantRepaired))
      .filter((d) => !s || `${d.unit} ${d.category} ${d.note} ${d.driver}`.toLowerCase().includes(s))
      .sort(wantRepaired
        /* Oldest repair first, not newest: the one that has sat longest
           waiting for somebody to close it in Motive is the problem. */
        ? (a, b) => String(a.repairedAt || "").localeCompare(String(b.repairedAt || ""))
        : wantClosed
        ? (a, b) => String(b.closedAt || "").localeCompare(String(a.closedAt || ""))
        : byUrgency);
  }, [defects, tab, q]);

  const live = defects.filter((d) => d.state !== "closed");
  const openCount = live.filter((d) => d.state !== "repaired").length;
  const unsafeCount = live.filter((d) => d.state !== "repaired" && d.safety === "unsafe").length;

  if (!ready) return <div style={{ padding: 40, color: C.muted }}>Loading defects…</div>;

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
              {tab === "closed"
                ? `${shown.length} closed in Motive`
                : tab === "repaired"
                  ? `${shown.length} repaired — waiting to be closed in Motive`
                  : `${openCount} open defect${openCount === 1 ? "" : "s"}`}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
              {tab === "closed"
                ? "Closed by a Motive sync, most recent first. Nothing here can reopen one."
                : tab === "repaired"
                ? "Longest wait first. Nothing here closes a DVIR."
                : unsafeCount
                  ? `${unsafeCount} of them put a truck out of service.`
                  : "Out of service first, then major, then oldest."}
            </div>
          </div>
          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Find a truck or a fault"
              style={{ ...inp, width: 220 }} />
            <Btn onClick={() => setAdding(true)}>Log a defect</Btn>
          </div>
        </div>

        {tab === "repaired" && shown.length > 0 && <AwaitingClose rows={shown} />}
        {tab === "closed" && shown.length > 0 && <ClosedNote />}

        {shown.length === 0 ? (
          <Empty tab={tab} q={q} />
        ) : (
          <div className="grid gap-2">
            {shown.map((d) => (
              <DefectRow key={d.id} d={d} who={who} busy={busy}
                onClaim={() => run(() => shop.claimDefect(d.id, who))}
                onRelease={() => run(() => shop.releaseDefect(d.id))}
                onRepair={() => setRepairing(d)}
                onReopen={() => run(() => shop.reopenDefect(d.id))}
                onPriority={(p) => run(() => shop.setDefectPriority(d.id, p))} />
            ))}
          </div>
        )}
      </div>

      {adding && (
        <AddDefectDialog vehicles={vehicles} busy={busy}
          onClose={() => setAdding(false)}
          onSave={async (d) => { await run(() => shop.addDefect(d, who)); setAdding(false); }} />
      )}
      {repairing && (
        <RepairDialog d={repairing} busy={busy}
          onClose={() => setRepairing(null)}
          onSave={async (r) => {
            await run(() => shop.repairDefect(repairing.id, r, who));
            setRepairing(null);
          }} />
      )}
    </>
  );
}

function Empty({ tab, q }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 28 }}>
      <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900 }}>
        {q ? "Nothing matches that"
          : tab === "closed" ? "Nothing closed yet"
          : tab === "repaired" ? "Nothing repaired yet" : "No open defects"}
      </div>
      <p style={{ fontSize: 14, color: C.muted, marginTop: 6, maxWidth: 620, lineHeight: 1.55 }}>
        {q
          ? "Try a truck number, or part of what is wrong with it."
          : tab === "closed"
            ? "A defect lands here when a Motive sync stops reporting it. Nothing in this app closes a DVIR."
          : tab === "repaired"
            ? "Defects show up here once someone marks them repaired, with who did it and how long it took."
            : "Log one with the button above. Once the Motive sync is wired up, open DVIR faults from the drivers' inspections will land here on their own."}
      </p>
    </div>
  );
}

function Badge({ tone, children }) {
  const c = tone === "bad" ? C.pull : tone === "warn" ? C.watch : C.muted;
  return (
    <span style={{ display: "inline-block", fontFamily: FD, fontSize: 11.5, fontWeight: 600,
      letterSpacing: "0.07em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 3,
      background: c + "1A", color: c, border: `1px solid ${c}44`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function DefectRow({ d, who, busy, onClaim, onRelease, onRepair, onReopen, onPriority }) {
  const age = daysOld(d.firstReported);
  const mine = d.claimedBy && who && d.claimedBy.toLowerCase() === who.toLowerCase();
  const repaired = d.state === "repaired";

  return (
    <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px",
      border: `1px solid ${d.safety === "unsafe" && !repaired ? C.pull + "66" : C.line}`,
      borderLeft: `4px solid ${repaired ? C.good
        : d.safety === "unsafe" ? C.pull
        : d.severity === "major" ? C.watch : C.line}` }}>
      <div className="flex flex-wrap items-start justify-between" style={{ gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            <span style={{ fontFamily: FM, fontWeight: 600, fontSize: 15, color: C.green900 }}>
              {d.unit}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
              {d.category || "Uncategorised"}
            </span>
            {d.safety === "unsafe" && !repaired && <Badge tone="bad">Out of service</Badge>}
            {d.severity === "major" && !repaired && <Badge tone="warn">Major</Badge>}
            {d.priority === "high" && !repaired && <Badge tone="warn">Priority</Badge>}
            {d.source === "motive" && <Badge>DVIR</Badge>}
            {d.count > 1 && <Badge>Reported {d.count}×</Badge>}
          </div>

          {d.note && (
            <div style={{ fontSize: 13.5, color: C.ink, marginTop: 5, lineHeight: 1.5 }}>
              {d.note}
            </div>
          )}

          <div style={{ fontFamily: FM, fontSize: 11, color: C.muted, marginTop: 5 }}>
            {repaired ? (
              <>
                repaired {fmtDate(String(d.repairedAt || "").slice(0, 10))} by {d.repairedBy}
                {daysWaiting(d) != null && (
                  <span style={{ color: daysWaiting(d) >= 7 ? C.pull : C.muted,
                                 fontWeight: daysWaiting(d) >= 7 ? 700 : 400 }}>
                    {" · "}
                    {daysWaiting(d) === 0 ? "today"
                      : `${daysWaiting(d)} day${daysWaiting(d) === 1 ? "" : "s"} waiting on Motive`}
                  </span>
                )}
                {d.repairHours != null ? ` · ${nf(d.repairHours, 1)} h` : ""}
                {d.workOrder ? ` · ${d.workOrder}` : ""}
              </>
            ) : (
              <>
                reported {fmtDate(d.firstReported)}
                {age != null ? ` · ${age} day${age === 1 ? "" : "s"} old` : ""}
                {d.driver ? ` · ${d.driver}` : ""}
                {d.state === "claimed" ? ` · claimed by ${d.claimedBy}` : ""}
              </>
            )}
          </div>

          {repaired && d.repairNote && (
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              {d.repairNote}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          {repaired ? (
            <Btn tone="ghost" disabled={busy} onClick={onReopen}>Reopen</Btn>
          ) : (
            <>
              {d.state === "open" && (
                <>
                  <button onClick={() => onPriority(d.priority === "high" ? "" : "high")}
                    disabled={busy} style={{ ...linkBtn, fontSize: 12.5, color: C.muted }}>
                    {d.priority === "high" ? "Clear priority" : "Flag priority"}
                  </button>
                  <Btn tone="ghost" disabled={busy} onClick={onClaim}>Claim</Btn>
                </>
              )}
              {d.state === "claimed" && !mine && (
                <span style={{ fontFamily: FM, fontSize: 11, color: C.muted }}>
                  with {d.claimedBy}
                </span>
              )}
              {d.state === "claimed" && (
                <Btn tone="ghost" disabled={busy} onClick={onRelease}>Release</Btn>
              )}
              <Btn disabled={busy} onClick={onRepair}>Mark repaired</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AddDefectDialog({ vehicles, busy, onClose, onSave }) {
  const [f, setF] = useState({
    unit: "", category: "", note: "", driver: "", location: "",
    severity: "minor", safety: "safe", date: todayISO(),
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const veh = vehicles.find((v) => v.num === f.unit);
  const ok = f.unit && f.category && f.note.trim();

  return (
    <Modal title="Log a defect" sub="Something wrong with a truck" onClose={onClose} width={560}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Truck">
          <select value={f.unit} onChange={set("unit")} style={inp}>
            <option value="">Choose a truck…</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.num}>{v.num} — {v.make} {v.model}</option>
            ))}
          </select>
        </Field>
        <Field label="What is wrong">
          <select value={f.category} onChange={set("category")} style={inp}>
            <option value="">Choose…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Describe it">
            <textarea value={f.note} onChange={set("note")} rows={3}
              placeholder="What you saw, and where on the truck"
              style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
          </Field>
        </div>
        <Field label="Severity">
          <select value={f.severity} onChange={set("severity")} style={inp}>
            {SEVERITY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Can it run?">
          <select value={f.safety} onChange={set("safety")} style={inp}>
            <option value="safe">Yes — safe to run</option>
            <option value="unsafe">No — out of service</option>
          </select>
        </Field>
        <Field label="Reported by">
          <input value={f.driver} onChange={set("driver")} placeholder="Driver or mechanic"
            style={inp} />
        </Field>
        <Field label="Date">
          <input type="date" value={f.date} onChange={set("date")} style={inp} />
        </Field>
      </div>

      {f.safety === "unsafe" && (
        <p style={{ fontSize: 12.5, color: C.pull, marginTop: 12, lineHeight: 1.5, fontWeight: 600 }}>
          Marked out of service, this goes to the top of the list ahead of everything else.
        </p>
      )}

      <div className="flex justify-end mt-4" style={{ gap: 8 }}>
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy || !ok}
          onClick={() => onSave({ ...f, note: f.note.trim(), vehId: veh ? veh.id : null })}>
          Log defect
        </Btn>
      </div>
    </Modal>
  );
}

function RepairDialog({ d, busy, onClose, onSave }) {
  const [f, setF] = useState({ note: "", hours: "", workOrder: d.workOrder || "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Modal title="Mark repaired" sub={`${d.unit} · ${d.category || "Uncategorised"}`}
      onClose={onClose} width={520}>
      {d.note && (
        <div style={{ background: C.paper, border: `1px solid ${C.lineSoft}`, borderRadius: 6,
          padding: "10px 12px", fontSize: 13.5, color: C.ink, lineHeight: 1.5, marginBottom: 14 }}>
          {d.note}
        </div>
      )}
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="What was done">
            <textarea value={f.note} onChange={set("note")} rows={3} autoFocus
              placeholder="The fix, and any parts used"
              style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
          </Field>
        </div>
        <Field label="Hours">
          <input type="number" step="0.25" min="0" value={f.hours} onChange={set("hours")}
            placeholder="optional" style={{ ...inp, fontFamily: FM }} />
        </Field>
        <Field label="Work order">
          <input value={f.workOrder} onChange={set("workOrder")} placeholder="optional"
            style={{ ...inp, fontFamily: FM }} />
        </Field>
      </div>
      <div className="flex justify-end mt-4" style={{ gap: 8 }}>
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy} onClick={() => onSave(f)}>Mark repaired</Btn>
      </div>
    </Modal>
  );
}

/* ── Repaired, waiting to be closed in Motive ─────────────────────
   Jason's rule 1, and the one place this system deliberately does not
   act. Motive is the DOT record. A mechanic marking a defect repaired
   takes it off his queue and does not close the DVIR — only Motive can
   do that, and nothing here writes back to Motive.

   So these rows are not finished work, they are a list of things
   somebody still has to close in Motive. Left alone they sit forever,
   which is why the count and the oldest wait are stated plainly rather
   than left for somebody to notice. */

export function daysWaiting(d) {
  if (!d.repairedAt) return null;
  const then = new Date(d.repairedAt);
  if (isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / 86400000));
}

function AwaitingClose({ rows }) {
  const waits = rows.map(daysWaiting).filter((n) => n != null);
  const oldest = waits.length ? Math.max(...waits) : 0;
  const stale = waits.filter((n) => n >= 7).length;

  return (
    <div style={{ background: C.card, border: `1px solid ${stale ? C.watch : C.line}`,
      borderLeft: `4px solid ${stale ? C.watch : C.line}`,
      borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
      <div className="flex flex-wrap items-baseline" style={{ gap: 14 }}>
        <span style={{ fontFamily: FD, fontSize: 15, fontWeight: 700, color: C.green900 }}>
          {rows.length} repaired, still open in Motive
        </span>
        {oldest > 0 && (
          <span style={{ fontFamily: FM, fontSize: 13,
            color: oldest >= 7 ? C.pull : C.muted, fontWeight: oldest >= 7 ? 700 : 400 }}>
            oldest {oldest} day{oldest === 1 ? "" : "s"}
          </span>
        )}
        {stale > 0 && (
          <span style={{ fontSize: 13, color: C.pull, fontWeight: 600 }}>
            {stale} over a week
          </span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: C.muted, margin: "6px 0 0", maxWidth: 760,
        lineHeight: 1.55 }}>
        Marking a defect repaired takes it off the mechanic's list. It does not close
        the DVIR — Motive is the DOT record and nothing here writes back to it. These
        drop off the list once a sync stops seeing them, so somebody has to close them
        in Motive.
      </p>
    </div>
  );
}

/* Closed by Motive, and only by Motive. Kept visible rather than hidden
   because "what happened to that fault" is a question an auditor asks,
   and because a defect vanishing without trace is how people stop
   trusting a board. */
function ClosedNote() {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`,
      borderLeft: `4px solid ${C.good}`, borderRadius: 8,
      padding: "12px 16px", marginBottom: 12 }}>
      <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 700, color: C.green900 }}>
        Closed in Motive
      </div>
      <p style={{ fontSize: 12.5, color: C.muted, margin: "6px 0 0", maxWidth: 760,
        lineHeight: 1.55 }}>
        These dropped off because a sync stopped seeing them, which is the only way a
        defect closes here — nothing in this app writes back to Motive. Who repaired
        it and what they wrote is kept. If the same fault comes back it arrives as a
        new defect with its own number rather than reopening this one, so the record
        of the first repair stays intact.
      </p>
    </div>
  );
}
