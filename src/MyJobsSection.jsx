import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD, FM } from "./theme.js";
import { fmtDate, nf, Btn, Modal, SectionLabel, th, td } from "./ui.jsx";
import * as buy from "./purchasingData.js";
import * as shop from "./shopData.js";
import * as setup from "./setupData.js";

/* ── My jobs ──────────────────────────────────────────────────────
   A mechanic's own worklist, from the timecard mockup: what is
   assigned to me, the open DVIR defects, and what PM is due.

   Everything here already exists somewhere else in the app. The point
   is the scoping — a mechanic standing at a truck wants their own
   three jobs, not the shop's sixty. The Defects tab shows every fault
   on the fleet, which is the right view for a foreman and the wrong
   one for the person holding the wrench. */

const DEFECT_FILTERS = [
  ["all", "All"],
  ["unsafe", "Out of service"],
  ["major", "Major"],
  ["mine", "Mine"],
];

const PRIO_LABEL = { now: "Now", today: "Today", normal: "Normal" };
const PRIO_COLOUR = (p) => (p === "now" ? "pull" : p === "today" ? "watch" : "muted");

/* Handed the signed-in mechanic rather than sniffing it out of
   localStorage: this lives inside the timecard now, behind the PIN,
   which is where somebody's own work belongs. */
export default function MyJobsSection({ me, onBusy, onBookHours, onStartJob, go }) {
  const [jobs, setJobs] = useState([]);
  const [defects, setDefects] = useState([]);
  const [pm, setPm] = useState([]);
  const [dFilter, setDFilter] = useState("all");
  const [pmOverdueOnly, setPmOverdueOnly] = useState(false);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [openJob, setOpenJob] = useState(null);

  const load = useCallback(async () => {
    try {
      const [d, p, j] = await Promise.all([
        shop.listDefects(),
        shop.listPmDue(["over", "soon"]),
        me?.id ? buy.myWork(me.id) : Promise.resolve([]),
      ]);
      setDefects(d.filter((x) => x.state !== "repaired"));
      setPm(p);
      setJobs(j);
      setErr("");
    } catch (e) { setErr(e.message || String(e)); }
    setReady(true);
  }, [me]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    onBusy?.(true);
    try { await fn(); await load(); }
    catch (e) { setErr(e.message || String(e)); }
    finally { onBusy?.(false); }
  };

  const shownDefects = useMemo(() => defects.filter((d) => {
    if (dFilter === "unsafe") return d.safety === "unsafe";
    if (dFilter === "major") return d.severity === "major";
    if (dFilter === "mine") return me && d.claimedBy &&
      (d.claimedBy === me.email || d.claimedBy === me.name);
    return true;
  }), [defects, dFilter, me]);

  const shownPm = useMemo(
    () => (pmOverdueOnly ? pm.filter((x) => x.level === "over") : pm), [pm, pmOverdueOnly]);

  if (!ready) return <div style={{ padding: 40, color: C.muted }}>Loading…</div>;

  return (
    <div>
      {err && <div style={{ background: C.pull, color: "#fff", padding: "8px 12px",
                            borderRadius: 4, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {/* ── Assigned to me ── */}
      <SectionLabel>Assigned to me{me ? ` · ${jobs.length}` : ""}</SectionLabel>
      <div style={{ display: "grid", gap: 7, margin: "8px 0 26px",
                    gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,260px),1fr))" }}>
        {jobs.map((j) => (
          /* The whole card is the target, not a link buried in it: this
             is read on a tablet with gloves on, and a mechanic wanting
             to know what a job actually is should not have to find a
             six-pixel chevron. */
          <button key={j.id} onClick={() => setOpenJob(j)}
            title="What is on this job"
            style={{ background: C.card, borderRadius: 6, padding: "11px 13px", width: "100%",
                     textAlign: "left", cursor: "pointer", font: "inherit", color: C.ink,
                     border: `1px solid ${j.priority === "now" ? C.pull : C.line}` }}>
            <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: C.muted }}>{j.wo}</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                             letterSpacing: "0.05em", color: C[PRIO_COLOUR(j.priority)] }}>
                {PRIO_LABEL[j.priority]}
              </span>
            </div>
            <div style={{ fontFamily: FD, fontSize: 16, fontWeight: 700, marginTop: 2 }}>
              {j.unit}
            </div>
            <div style={{ fontSize: 13 }}>{j.title}</div>
            {j.detail && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{j.detail}</div>
            )}
            {j.holdReason && (
              <div style={{ fontSize: 11.5, color: C.watch, fontWeight: 700, marginTop: 5 }}>
                {j.holdReason}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: C.green600, marginTop: 6 }}>
              {j.state === "in progress" && j.startedAt ? "started · " : ""}tap for what is on it
            </div>
          </button>
        ))}
        {me && !jobs.length && (
          <div style={{ color: C.muted, fontSize: 13.5 }}>
            Nothing assigned to you. Work is put on people from the Work orders tab.
          </div>
        )}
      </div>

      {openJob && (
        <JobDialog j={openJob} me={me} go={go}
          onClose={() => setOpenJob(null)}
          onStart={() => run(async () => {
            await buy.startWork(openJob.id);
            const j = openJob;
            setOpenJob(null);
            /* Straight to a running clock on the timecard. Pressing
               Start and being left on the same list, with nothing
               visibly counting, reads as the button not having worked. */
            onStartJob?.(j);
          })}
          onBookHours={() => { setOpenJob(null); onBookHours?.(openJob); }} />
      )}

      {/* ── Open DVIR defects ── */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 8, marginBottom: 8 }}>
        <SectionLabel>Open DVIR defects · {shownDefects.length}</SectionLabel>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {DEFECT_FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setDFilter(k)}
              style={chip(dFilter === k)}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto", marginBottom: 26 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>Unit</th><th style={th}>What</th>
            <th style={th}>Since</th><th style={th}>State</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {shownDefects.slice(0, 60).map((d) => (
              <tr key={d.id}>
                <td style={{ ...td, fontWeight: 600 }}>{d.unit}</td>
                <td style={td}>
                  {d.category || "Defect"}
                  {d.safety === "unsafe" && (
                    <span style={{ color: C.pull, fontWeight: 700, fontSize: 11,
                                   marginLeft: 6, textTransform: "uppercase" }}>
                      out of service
                    </span>
                  )}
                  {d.note && <div style={{ color: C.muted, fontSize: 12 }}>{d.note}</div>}
                </td>
                <td style={td}>{fmtDate(d.firstReported)}</td>
                <td style={td}>{d.state}{d.claimedBy ? ` · ${d.claimedBy}` : ""}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  {d.state === "open" && me && (
                    <Btn tone="ghost" onClick={() => run(
                      () => shop.claimDefect(d.id, me.email || me.name))}>
                      I'LL TAKE IT
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
            {!shownDefects.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={5}>
                Nothing open under that filter.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── PM due ── */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 8, marginBottom: 8 }}>
        <SectionLabel>PM due · {shownPm.length}</SectionLabel>
        <button onClick={() => setPmOverdueOnly((v) => !v)} style={chip(pmOverdueOnly)}>
          {pmOverdueOnly ? "Overdue only" : "Due & overdue"}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>Unit</th><th style={th}>Service</th>
            <th style={th}>Due</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {shownPm.slice(0, 60).map((p) => (
              <tr key={`${p.vehId}-${p.programId}`}>
                <td style={{ ...td, fontWeight: 600 }}>{p.truck}</td>
                <td style={td}>{p.program}</td>
                <td style={{ ...td, color: p.level === "over" ? C.pull : C.watch }}>
                  {p.level === "over" ? "Overdue" : "Due soon"}
                  {p.milesLeft != null && (
                    <span style={{ color: C.muted }}>
                      {" "}· {Math.abs(p.milesLeft).toLocaleString()} mi
                      {p.milesLeft < 0 ? " over" : " to go"}
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: "right", color: C.muted, fontSize: 12 }}>
                  record it on the PM tab
                </td>
              </tr>
            ))}
            {!shownPm.length && (
              <tr><td style={{ ...td, color: C.muted }} colSpan={4}>
                Nothing due. PM needs a first service recorded against a truck before
                it can work anything out.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── One job, opened ───────────────────────────────────────────────
   What the card could not hold: where the job came from, what has
   already gone onto it, and the two things a mechanic standing at the
   truck actually wants to do next — start the clock on it, or look at
   the order itself.

   Nothing here is new information. It is the same work order the
   foreman's board shows and the same parts and hours ledger; the point
   is that somebody holding a wrench should not have to leave their own
   worklist and go hunting through sixty rows to read it. */
function JobDialog({ j, me, go, onClose, onStart, onBookHours }) {
  const [lines, setLines] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    buy.workOrderLines(j.wo)
      .then((r) => { if (live) setLines(r); })
      .catch((e) => { if (live) setErr(e.message || String(e)); });
    return () => { live = false; };
  }, [j.wo]);

  const fromDefect = j.kind === "defect";

  return (
    <Modal title={j.wo} sub={`${j.unit || "shop job"} · ${j.title}`}
      onClose={onClose} width={620}>

      <div className="flex flex-wrap" style={{ gap: 10, marginBottom: 12 }}>
        <Tag tone={PRIO_COLOUR(j.priority)}>{PRIO_LABEL[j.priority]}</Tag>
        <Tag tone="muted">{j.state}</Tag>
        <Tag tone="muted">
          {fromDefect ? "from a DVIR defect"
            : j.kind === "pm" ? "from a service interval" : "opened by hand"}
        </Tag>
        {j.holdReason && <Tag tone="watch">{j.holdReason}</Tag>}
      </div>

      {j.detail && (
        <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: "0 0 12px" }}>{j.detail}</p>
      )}

      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.7, marginBottom: 14 }}>
        <div>Opened {fmtDate(String(j.at || "").slice(0, 10))}</div>
        {j.assignedAt && <div>Put on you {fmtDate(String(j.assignedAt).slice(0, 10))}</div>}
        <div>
          {j.startedAt
            ? `Started ${fmtDate(String(j.startedAt).slice(0, 10))}`
            : "Not started"}
        </div>
        {j.holdSince && (
          <div style={{ color: C.watch }}>
            Left {fmtDate(String(j.holdSince).slice(0, 10))} — {j.holdReason}
          </div>
        )}
      </div>

      {/* What has gone onto it. */}
      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, marginBottom: 14 }}>
        {err ? <span style={{ color: C.pull, fontSize: 12.5 }}>{err}</span>
         : !lines ? <span style={{ color: C.muted, fontSize: 12.5 }}>loading…</span>
         : !lines.parts.length && !lines.hours.length ? (
            <span style={{ color: C.muted, fontSize: 12.5 }}>
              Nothing on this job yet — no parts issued to it and no hours booked
              against it.
            </span>
          ) : (
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", fontSize: 12.5 }}>
            {lines.parts.length > 0 && (
              <div>
                <div style={{ fontFamily: FD, fontWeight: 700, color: C.green900 }}>Parts</div>
                {lines.parts.map((p) => (
                  <div key={p.id} style={{ color: C.muted, lineHeight: 1.7 }}>
                    <span style={{ fontFamily: FM, color: C.ink }}>{nf(p.qty)} × {p.num}</span>
                    {p.name ? ` ${p.name}` : ""}
                    {p.cost != null ? ` · $${nf(p.cost, 2)}` : ""}
                  </div>
                ))}
                <div style={{ marginTop: 4, fontWeight: 700 }}>
                  ${nf(lines.partsCost, 2)}
                  {lines.partsWithoutCost > 0 && (
                    <span style={{ color: C.muted, fontWeight: 400 }}>
                      {" "}· {lines.partsWithoutCost} with no cost on file
                    </span>
                  )}
                </div>
              </div>
            )}
            {lines.hours.length > 0 && (
              <div>
                <div style={{ fontFamily: FD, fontWeight: 700, color: C.green900 }}>Hours</div>
                {lines.hours.map((h) => (
                  <div key={h.id} style={{ color: C.muted, lineHeight: 1.7 }}>
                    <span style={{ color: C.ink }}>{nf(h.hours, 2)} h</span>
                    {h.who ? ` · ${h.who}` : ""}{h.costCode ? ` · ${h.costCode}` : ""}
                  </div>
                ))}
                <div style={{ marginTop: 4, fontWeight: 700 }}>{nf(lines.hoursTotal, 2)} h</div>
              </div>
            )}
          </div>
        )}
      </div>

      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, margin: "0 0 12px" }}>
        {j.startedAt ? "Back on it" : "Start it"} puts a running clock on your timecard
        with this truck and {j.wo} on it. When you stop, it asks whether the job is
        finished — either answer saves your hours and lets you clock out.
        Booking hours instead just opens an entry with the same details, for time you
        have already spent.
        {fromDefect && " Marking the truck repaired is still done on the Defects tab, by whoever fixed it."}
      </p>

      <div className="flex flex-wrap justify-end" style={{ gap: 8 }}>
        <Btn tone="ghost" onClick={onClose}>CLOSE</Btn>
        {go && (
          <Btn tone="ghost" onClick={() => { onClose(); go("work", "orders", { wo: j.wo }); }}>
            OPEN THE WORK ORDER
          </Btn>
        )}
        <Btn tone="ghost" onClick={onBookHours}>BOOK HOURS</Btn>
        <Btn onClick={onStart}>{j.startedAt ? "BACK ON IT" : "START IT"}</Btn>
      </div>
    </Modal>
  );
}

function Tag({ tone, children }) {
  return (
    <span style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em",
      textTransform: "uppercase", padding: "3px 8px", borderRadius: 4,
      border: `1px solid ${C[tone] || C.muted}`, color: C[tone] || C.muted }}>
      {children}
    </span>
  );
}

const chip = (on) => ({
  fontFamily: FD, fontSize: 12.5, letterSpacing: "0.04em",
  textTransform: "uppercase", padding: "5px 10px", borderRadius: 4,
  cursor: "pointer", border: `1px solid ${on ? C.green700 : C.line}`,
  background: on ? C.green700 : "#fff", color: on ? "#fff" : C.ink,
});
