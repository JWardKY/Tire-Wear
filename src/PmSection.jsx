import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD, FM } from "./theme.js";
import {
  todayISO, fmtDate, nf, Modal, Btn, Field, SectionLabel, Card,
  inp, th, td, tdNum, linkBtn,
} from "./ui.jsx";
import * as shop from "./shopData.js";

/* ── The PM section ───────────────────────────────────────────────
   A program is a service and how often it is due, by miles or by
   months or both. tw_pm_due works out what is due against the same
   odometer log the tire screens use, so the two can never disagree
   about how far a truck has run.

   A program with no service ever recorded against a truck has no
   baseline, and reports as such rather than as overdue — the same
   rule as a tire with only its mount reading. Recording the last
   service once starts the clock. */

const LEVEL_COLOR = {
  over: C.pull,
  soon: C.watch,
  ok: C.good,
  nobaseline: C.muted,
};

const LEVEL_LABEL = {
  over: "Overdue",
  soon: "Due soon",
  ok: "In service",
  nobaseline: "No baseline",
};

function LevelPill({ level }) {
  const c = LEVEL_COLOR[level] || C.muted;
  return (
    <span style={{ display: "inline-block", fontFamily: FD, fontSize: 11.5, fontWeight: 600,
      letterSpacing: "0.07em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 3,
      background: c + "1A", color: c, border: `1px solid ${c}44`, whiteSpace: "nowrap" }}>
      {LEVEL_LABEL[level] || level}
    </span>
  );
}

/* What is actually driving this row: whichever trigger fires first. */
function trigger(r) {
  const parts = [];
  if (r.milesLeft != null) {
    parts.push(r.milesLeft <= 0
      ? `${nf(Math.abs(r.milesLeft))} mi over`
      : `${nf(r.milesLeft)} mi to go`);
  }
  if (r.daysLeft != null) {
    parts.push(r.daysLeft <= 0
      ? `${nf(Math.abs(r.daysLeft))} day${Math.abs(r.daysLeft) === 1 ? "" : "s"} over`
      : `${nf(r.daysLeft)} day${r.daysLeft === 1 ? "" : "s"} to go`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

const LEVEL_RANK = { over: 0, soon: 1, ok: 2, nobaseline: 3 };

function byUrgency(a, b) {
  const d = (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9);
  if (d) return d;
  const av = a.milesLeft ?? (a.daysLeft != null ? a.daysLeft * 100 : 1e9);
  const bv = b.milesLeft ?? (b.daysLeft != null ? b.daysLeft * 100 : 1e9);
  return av - bv;
}

export default function PmSection({ who, tab, onBusy }) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [due, setDue] = useState([]);
  const [counts, setCounts] = useState({});
  const [programs, setPrograms] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [recording, setRecording] = useState(null);
  const [editingProgram, setEditingProgram] = useState(null);
  const [q, setQ] = useState("");

  const reload = useCallback(async () => {
    const [d, c, p, v] = await Promise.all([
      shop.listPmDue(["over", "soon"]),
      shop.pmLevelCounts(),
      shop.listPrograms(),
      shop.listVehicles(),
    ]);
    setDue(d);
    setCounts(c);
    setPrograms(p);
    setVehicles(v);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await reload();
      } catch (e) {
        setErr(`Could not load the PM board — ${e.message || e}`);
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
    return due
      .filter((r) => !s || `${r.truck} ${r.program} ${r.category}`.toLowerCase().includes(s))
      .sort(byUrgency);
  }, [due, q]);

  if (!ready) return <div style={{ padding: 40, color: C.muted }}>Loading the PM board…</div>;

  return (
    <>
      {err && (
        <div style={{ background: "#FDECEA", color: C.pull, borderBottom: `1px solid ${C.pull}33`,
          padding: "10px 20px", fontSize: 13, fontWeight: 600 }}>{err}</div>
      )}

      <div className="mx-auto w-full" style={{ maxWidth: 1400, padding: "20px 16px 60px" }}>
        {tab === "programs"
          ? <Programs programs={programs} busy={busy}
              onToggle={(p) => run(() => shop.setProgramActive(p.id, !p.active))}
              onNew={() => setEditingProgram({})}
              onEdit={(p) => setEditingProgram(p)} />
          : <Board {...{ shown, counts, q, setQ, busy, setRecording }} />}
      </div>

      {editingProgram && (
        <ProgramDialog p={editingProgram} busy={busy}
          onClose={() => setEditingProgram(null)}
          onSave={async (v) => {
            await run(() => (editingProgram.id
              ? shop.updateProgram(editingProgram.id, v)
              : shop.addProgram(v)));
            setEditingProgram(null);
          }} />
      )}

      {recording && (
        <RecordServiceDialog row={recording} programs={programs} vehicles={vehicles} busy={busy}
          onClose={() => setRecording(null)}
          onSave={async (s) => { await run(() => shop.recordService(s, who)); setRecording(null); }} />
      )}
    </>
  );
}

function Board({ shown, counts, q, setQ, busy, setRecording }) {
  const over = counts.over || 0;
  const soon = counts.soon || 0;
  const none = counts.nobaseline || 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3"
        style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
          padding: "12px 16px", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900,
            lineHeight: 1.1 }}>
            {over} overdue · {soon} due soon
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
            Worked out against each truck's latest odometer reading.
          </div>
        </div>
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Find a truck or a service" style={{ ...inp, width: 220 }} />
          <Btn onClick={() => setRecording({})}>Record a service</Btn>
        </div>
      </div>

      {none > 0 && (
        <div style={{ background: "#FBF7E8", border: `1px solid ${C.watch}44`, borderRadius: 8,
          padding: "11px 14px", marginBottom: 16, fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
          <strong>{nf(none)} truck-and-service pairs have no baseline yet.</strong> Nothing can be
          due until someone records when a service was last done, the same way a tire needs its
          mount reading before it has a wear rate. Record the last one you know about and the
          clock starts. The services themselves live on the <strong>Programs</strong> tab, where
          you can add one or turn one off.
        </div>
      )}

      {shown.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 28 }}>
          <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.green900 }}>
            {q ? "Nothing matches that" : "Nothing is due"}
          </div>
          <p style={{ fontSize: 14, color: C.muted, marginTop: 6, maxWidth: 620, lineHeight: 1.55 }}>
            {q
              ? "Try a truck number or the name of a service."
              : "No truck is inside the warning window on any program that has a baseline."}
          </p>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
          overflow: "hidden" }}>
          <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.lineSoft}` }}>
            <SectionLabel noMargin>Due now</SectionLabel>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr>
                  {["Truck", "Service", "Category", "Last done", "Odometer", "Due", "Status", ""]
                    .map((h, i) => (
                      <th key={h || i} style={{ ...th, textAlign: i === 4 ? "right" : "left" }}>{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`${r.vehId}|${r.programId}`} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                    <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{r.truck}</td>
                    <td style={td}>{r.program}</td>
                    <td style={{ ...td, color: C.muted }}>{r.category}</td>
                    <td style={{ ...td, color: C.muted, whiteSpace: "nowrap" }}>
                      {r.lastDate ? fmtDate(r.lastDate) : "—"}
                      {r.lastOdo != null && (
                        <span style={{ fontFamily: FM, fontSize: 11 }}> · {nf(r.lastOdo)}</span>
                      )}
                    </td>
                    <td style={{ ...td, ...tdNum, color: C.muted }}>
                      {r.odo != null ? nf(r.odo) : "—"}
                    </td>
                    <td style={{ ...td, fontFamily: FM, fontSize: 12.5,
                      color: r.level === "over" ? C.pull : C.ink, whiteSpace: "nowrap" }}>
                      {trigger(r)}
                    </td>
                    <td style={td}><LevelPill level={r.level} /></td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button disabled={busy} onClick={() => setRecording(r)}
                        style={{ ...linkBtn, fontSize: 12.5 }}>
                        Record
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function Programs({ programs, busy, onToggle, onNew, onEdit }) {
  return (
    /* minmax(0,1fr) because a grid item will not shrink below its content's
       min-content width, and the table inside is 680px wide — without it the
       whole page gets dragged sideways on a phone instead of the table
       scrolling inside its own box. */
    <div className="grid gap-4" style={{ maxWidth: 900, gridTemplateColumns: "minmax(0,1fr)" }}>
      <Card title="Services and how often"
        note="Turning one off takes it off every truck's board. It does not delete anything already recorded.">
        <div className="flex justify-end" style={{ marginBottom: 10 }}>
          <Btn onClick={onNew}>NEW SERVICE</Btn>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead>
              <tr>
                {["Service", "Category", "Every", "Warn from", "Est. hours", "Applies to", ""]
                  .map((h, i) => (
                    <th key={h || i} style={{ ...th, textAlign: i === 4 ? "right" : "left" }}>{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${C.lineSoft}`,
                  opacity: p.active ? 1 : 0.5 }}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.name}</td>
                  <td style={{ ...td, color: C.muted }}>{p.category}</td>
                  <td style={{ ...td, fontFamily: FM, fontSize: 12.5, whiteSpace: "nowrap" }}>
                    {[p.miles ? `${nf(p.miles)} mi` : null,
                      p.months ? `${p.months} mo` : null].filter(Boolean).join(" or ")}
                  </td>
                  <td style={{ ...td, fontFamily: FM, fontSize: 12.5, color: C.muted,
                    whiteSpace: "nowrap" }}>
                    {[p.leadMiles ? `${nf(p.leadMiles)} mi` : null,
                      p.leadDays ? `${p.leadDays} d` : null].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td style={{ ...td, ...tdNum }}>{p.estHours != null ? nf(p.estHours, 1) : "—"}</td>
                  <td style={{ ...td, color: C.muted }}>{p.appliesTo || "Every unit"}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button disabled={busy} onClick={() => onEdit(p)}
                      style={{ ...linkBtn, fontSize: 12.5, marginRight: 12 }}>
                      Edit
                    </button>
                    <button disabled={busy} onClick={() => onToggle(p)}
                      style={{ ...linkBtn, fontSize: 12.5, color: p.active ? C.pull : C.good }}>
                      {p.active ? "Turn off" : "Turn on"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── A service the shop tracks ─────────────────────────────────────
   Adding one here puts it on every truck it applies to at once — 135
   trucks and a new service is 135 rows on the board — so the two fields
   that decide scope, the interval and who it applies to, are the ones
   this dialog is careful about.

   It does not make anything due. A truck has no clock on a service until
   somebody records when it was last done, which is the same rule as a
   tire needing its mount reading before it has a wear rate. */
function ProgramDialog({ p, busy, onClose, onSave }) {
  const editing = !!p.id;
  const [f, setF] = useState({
    name: p.name || "",
    category: p.category || "",
    miles: p.miles ?? "",
    months: p.months ?? "",
    leadMiles: p.leadMiles ?? "",
    leadDays: p.leadDays ?? "",
    estHours: p.estHours ?? "",
    appliesTo: p.appliesTo || "",
  });
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  const miles = Number(f.miles), months = Number(f.months);
  const badMiles = f.miles !== "" && !(miles > 0);
  const badMonths = f.months !== "" && !(months > 0);
  /* The same rule the database keeps in tw_pm_needs_an_interval. Said
     here too so somebody finds out before they press Save, not after. */
  const noInterval = f.miles === "" && f.months === "";
  const ready = f.name.trim() && !noInterval && !badMiles && !badMonths;

  return (
    <Modal title={editing ? `Edit ${p.name}` : "New service"}
      sub="How often it comes round, and which trucks it lands on"
      onClose={onClose} width={620}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Service">
            <input style={inp} value={f.name} autoFocus onChange={set("name")}
              placeholder="Engine oil and filter" />
          </Field>
        </div>
        <Field label="Category">
          <input style={inp} value={f.category} onChange={set("category")}
            placeholder="Engine, Brakes, Chassis…" />
        </Field>
        <Field label="Applies to">
          <select style={inp} value={f.appliesTo} onChange={set("appliesTo")}>
            <option value="">Every unit</option>
            <option value="DT">DT only</option>
            <option value="HT">HT only</option>
            <option value="OT">OT only</option>
          </select>
        </Field>

        <Field label="Every — miles">
          <input type="number" min="1" step="1" style={{ ...inp, fontFamily: FM }}
            value={f.miles} onChange={set("miles")} placeholder="25000" />
        </Field>
        <Field label="Every — months">
          <input type="number" min="1" step="1" style={{ ...inp, fontFamily: FM }}
            value={f.months} onChange={set("months")} placeholder="6" />
        </Field>
        <Field label="Warn from — miles before">
          <input type="number" min="0" step="1" style={{ ...inp, fontFamily: FM }}
            value={f.leadMiles} onChange={set("leadMiles")} placeholder="a tenth of the interval" />
        </Field>
        <Field label="Warn from — days before">
          <input type="number" min="0" step="1" style={{ ...inp, fontFamily: FM }}
            value={f.leadDays} onChange={set("leadDays")} placeholder="30" />
        </Field>
        <Field label="Estimated hours">
          <input type="number" min="0" step="0.5" style={{ ...inp, fontFamily: FM }}
            value={f.estHours} onChange={set("estHours")} placeholder="optional" />
        </Field>
      </div>

      <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, margin: "12px 0 0" }}>
        Fill in miles, months, or both — both means whichever comes first. Leave the
        warn-from boxes empty and it uses a tenth of the interval and thirty days.
      </p>
      {noInterval && (
        <p style={{ fontSize: 12.5, color: C.watch, fontWeight: 600, margin: "6px 0 0" }}>
          Put a mileage or a number of months on it, or nothing can ever come due.
        </p>
      )}
      {(badMiles || badMonths) && (
        <p style={{ fontSize: 12.5, color: C.pull, fontWeight: 600, margin: "6px 0 0" }}>
          An interval has to be more than zero.
        </p>
      )}
      {!editing && (
        <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
          Nothing is due the moment you save this. Each truck gets its clock the first
          time somebody records the service against it — <b>Record a service</b> on the
          Due tab.
        </p>
      )}

      <div className="flex justify-end" style={{ gap: 8, marginTop: 14 }}>
        <Btn tone="ghost" onClick={onClose}>CANCEL</Btn>
        <Btn disabled={!ready || busy} onClick={() => onSave(f)}>
          {editing ? "SAVE" : "ADD IT"}
        </Btn>
      </div>
    </Modal>
  );
}

function RecordServiceDialog({ row, programs, vehicles, busy, onClose, onSave }) {
  const preset = row && row.vehId;
  const [f, setF] = useState({
    vehId: row?.vehId || "",
    programId: row?.programId || "",
    date: todayISO(),
    odo: row?.odo != null ? String(row.odo) : "",
    hours: row?.estHours != null ? String(row.estHours) : "",
    note: "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const ok = f.vehId && f.programId && f.date;
  const prog = programs.find((p) => p.id === f.programId);

  return (
    <Modal title="Record a service"
      sub={preset ? `${row.truck} · ${row.program}` : "Log a completed PM service"}
      onClose={onClose} width={560}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Truck">
          <select value={f.vehId} onChange={set("vehId")} style={inp} disabled={!!preset}>
            <option value="">Choose a truck…</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.num} — {v.make} {v.model}</option>
            ))}
          </select>
        </Field>
        <Field label="Service">
          <select value={f.programId} onChange={set("programId")} style={inp} disabled={!!preset}>
            <option value="">Choose a service…</option>
            {programs.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Date done">
          <input type="date" value={f.date} onChange={set("date")} style={inp} />
        </Field>
        <Field label="Odometer">
          <input type="number" min="0" value={f.odo} onChange={set("odo")}
            placeholder={prog?.miles ? "needed for mileage services" : "optional"}
            style={{ ...inp, fontFamily: FM }} />
        </Field>
        <Field label="Hours">
          <input type="number" step="0.25" min="0" value={f.hours} onChange={set("hours")}
            placeholder="optional" style={{ ...inp, fontFamily: FM }} />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Note">
            <input value={f.note} onChange={set("note")} placeholder="optional" style={inp} />
          </Field>
        </div>
      </div>

      {prog?.miles && !f.odo && (
        <p style={{ fontSize: 12.5, color: C.watch, marginTop: 12, lineHeight: 1.5, fontWeight: 600 }}>
          {prog.name} comes due every {nf(prog.miles)} miles. Without an odometer reading this
          service will have no mileage baseline, so it can only ever come due by date.
        </p>
      )}

      <p style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
        This becomes the baseline the next one counts from. Recording an older service you know
        about is the way to start the clock on a truck that has never been logged.
      </p>

      <div className="flex justify-end mt-4" style={{ gap: 8 }}>
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy || !ok} onClick={() => onSave(f)}>Record service</Btn>
      </div>
    </Modal>
  );
}
