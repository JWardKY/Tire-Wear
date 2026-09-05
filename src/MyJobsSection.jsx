import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD } from "./theme.js";
import { fmtDate, Btn, Modal, SectionLabel, inp, th, td } from "./ui.jsx";
import { WorkOrderLines } from "./WorkSection.jsx";
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
export default function MyJobsSection({ me, onBusy, go }) {
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
          <button key={j.id} onClick={() => setOpenJob(j)}
            style={{ background: C.card, borderRadius: 6, padding: "11px 13px",
                     border: `1px solid ${j.priority === "now" ? C.pull : C.line}`,
                     font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer",
                     display: "block", width: "100%" }}>
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
            {/* A card that does something has to say so. Without this the
                whole block reads as a notice board. */}
            <div style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 700, marginTop: 7,
                          letterSpacing: "0.06em", textTransform: "uppercase", color: C.green700 }}>
              Open it →
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
        <JobDialog j={openJob} go={go} onClose={() => setOpenJob(null)} />
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

/* ── One job, in full ──────────────────────────────────────────────
   The card is a summary and a summary is not enough to work from: what
   is already on the order decides whether you are starting it or
   finishing somebody else's afternoon.

   The two buttons are the whole point of the card being tappable. A
   mechanic looking at their job wants to book the time against it or
   see the order itself, and both were four taps and a typed WO number
   away — which is where the wrong number gets typed. */
function JobDialog({ j, go, onClose }) {
  const jump = (fn) => { onClose(); fn(); };

  return (
    <Modal title={j.wo} sub={`${j.unit || "Shop job"} · ${j.title}`}
      onClose={onClose} width={560}>
      <div style={{ display: "grid", gap: 12, marginBottom: 4,
                    gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))" }}>
        <Detail label="Unit" value={j.unit || "No unit — shop job"} />
        <Detail label="Priority" value={PRIO_LABEL[j.priority]}
          colour={C[PRIO_COLOUR(j.priority)]} />
        <Detail label="State" value={j.state} />
        <Detail label="Opened" value={j.at ? fmtDate(j.at.slice(0, 10)) : "—"} />
      </div>

      {j.detail && (
        <p style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 14, marginBottom: 0 }}>
          {j.detail}
        </p>
      )}

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
        <SectionLabel>On this order</SectionLabel>
        <div style={{ marginTop: 8 }}><WorkOrderLines wo={j.wo} /></div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap",
                    justifyContent: "flex-end", marginTop: 20 }}>
        <Btn tone="ghost" onClick={onClose}>CLOSE</Btn>
        <Btn tone="ghost" disabled={!go}
          onClick={() => jump(() => go("work", "orders", { woId: j.id, wo: j.wo }))}>
          OPEN WORK ORDER
        </Btn>
        <Btn disabled={!go}
          onClick={() => jump(() => go("timecard", "today", {
            addHours: {
              vehId: j.vehId || "",
              unit: j.unit || "",
              workOrder: j.wo,
              note: j.title || "",
            },
          }))}>
          BOOK HOURS
        </Btn>
      </div>
    </Modal>
  );
}

function Detail({ label, value, colour }) {
  return (
    <div>
      <div style={{ fontFamily: FD, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
                    textTransform: "uppercase", color: C.muted }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: colour || C.ink }}>
        {value}
      </div>
    </div>
  );
}

const chip = (on) => ({
  fontFamily: FD, fontSize: 12.5, letterSpacing: "0.04em",
  textTransform: "uppercase", padding: "5px 10px", borderRadius: 4,
  cursor: "pointer", border: `1px solid ${on ? C.green700 : C.line}`,
  background: on ? C.green700 : "#fff", color: on ? "#fff" : C.ink,
});
