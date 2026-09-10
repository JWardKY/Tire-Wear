import React, { useState, useEffect, useMemo, useCallback } from "react";
import { C, FD, FM } from "./theme.js";
import { fmtDate, nf, Btn, Modal, SectionLabel, linkBtn, th, td } from "./ui.jsx";
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

/* Both spellings, because a claim made before the name went on them
   recorded an email. New ones are the mechanic's name. */
const claimedByMe = (me, d) => !!(me && d.claimedBy
  && (d.claimedBy === me.name || d.claimedBy === me.email));
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
  /* The work order behind a claimed defect, when it has one. Starting a
     clock on it needs the id, not the number, so the job can be closed
     out at the end. */
  const [defectWos, setDefectWos] = useState(new Map());

  const load = useCallback(async () => {
    try {
      const [d, p, j] = await Promise.all([
        shop.listDefects(),
        shop.listPmDue(["over", "soon"]),
        me?.id ? buy.myWork(me.id) : Promise.resolve([]),
      ]);
      const live = d.filter((x) => x.state !== "repaired");
      setDefects(live);
      setPm(p);
      setJobs(j);
      /* Only for the ones that will actually show as cards. */
      const mineWithWo = live
        .filter((x) => x.state === "claimed" && claimedByMe(me, x) && x.workOrder)
        .map((x) => x.workOrder);
      setDefectWos(await buy.workOrdersByNumber(mineWithWo).catch(() => new Map()));
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

  /* Both spellings, because a claim made before the name went on them
     recorded an email. New ones are the mechanic's name. */
  const isMine = useCallback((d) => claimedByMe(me, d), [me]);

  /* Tapping a card starts the clock. That is the common act at a truck,
     and making it the second tap behind a dialog meant somebody pressed
     the card, read a page, and still had not started working.

     What is on the job did not go away — it moved to the small link in
     the corner, which is the rarer question. */
  /* Not through run(): that reloads this page afterwards, and by then
     the timecard has taken over the screen. Start the job, hand it
     across, done. */
  const startJob = useCallback(async (j) => {
    onBusy?.(true);
    try {
      if (j.id) await buy.startWork(j.id);
      onStartJob?.(j);
    } catch (e) {
      setErr(e.message || String(e));
    } finally { onBusy?.(false); }
  }, [onStartJob, onBusy]);

  const startDefect = useCallback((d) => {
    const w = defectWos.get(d.workOrder);
    startJob({
      id: w?.id || null,
      wo: d.workOrder || "",
      vehId: d.vehId,
      unit: d.unit,
      /* The fault is what the mechanic is about to work on, so it is
         what the timecard's "what was done" starts as. */
      title: [d.category, d.note].filter(Boolean).join(" — ") || "Defect",
    });
  }, [defectWos, startJob]);

  const shownDefects = useMemo(() => defects.filter((d) => {
    if (dFilter === "unsafe") return d.safety === "unsafe";
    if (dFilter === "major") return d.severity === "major";
    if (dFilter === "mine") return isMine(d);
    return true;
  }), [defects, dFilter, isMine]);

  /* Claiming a defect is somebody putting their name on a job, so it
     belongs in the same place as a job somebody else put their name on.
     It used to land only in the MINE filter further down the page,
     which is not where anybody looked for it.

     A defect that already has a work order assigned to me is skipped —
     it is one job and it is on the list once, as the work order. */
  const myDefects = useMemo(() => {
    const onWo = new Set(jobs.map((j) => j.wo));
    return defects.filter((d) => d.state === "claimed" && isMine(d)
      && !(d.workOrder && onWo.has(d.workOrder)));
  }, [defects, jobs, isMine]);

  const shownPm = useMemo(
    () => (pmOverdueOnly ? pm.filter((x) => x.level === "over") : pm), [pm, pmOverdueOnly]);

  if (!ready) return <div style={{ padding: 40, color: C.muted }}>Loading…</div>;

  return (
    <div>
      {err && <div style={{ background: C.pull, color: "#fff", padding: "8px 12px",
                            borderRadius: 4, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {/* ── Assigned to me ── */}
      <SectionLabel>
        Assigned to me{me ? ` · ${jobs.length + myDefects.length}` : ""}
      </SectionLabel>
      <div style={{ display: "grid", gap: 7, margin: "8px 0 26px",
                    gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,260px),1fr))" }}>
        {jobs.map((j) => (
          /* The whole card starts the clock — that is what somebody
             standing at a truck came here to do, and it is one tap with
             gloves on. What is on the job is the smaller question and
             sits on the link at the bottom. */
          <Tappable key={j.id} onTap={() => startJob(j)}
            hint={j.startedAt ? "Tap to get back on it" : "Tap to start the clock"}
            edge={j.priority === "now" ? C.pull : C.line}>
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
            {(j.crew || []).length > 1 && (
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5 }}>
                with {j.crew.filter((c) => c.mechanicId !== me?.id)
                        .map((c) => c.name).join(", ")}
              </div>
            )}
            <div className="flex items-baseline justify-between"
              style={{ gap: 8, marginTop: 7 }}>
              <span style={{ fontSize: 12, color: C.green700, fontWeight: 700 }}>
                {j.startedAt ? "TAP TO GET BACK ON IT" : "TAP TO START"}
              </span>
              <button onClick={(e) => { e.stopPropagation(); setOpenJob(j); }}
                style={{ ...linkBtn, fontSize: 11.5 }}>
                what is on it
              </button>
            </div>
          </Tappable>
        ))}
        {myDefects.map((d) => (
          <Tappable key={d.id} onTap={() => startDefect(d)}
            hint="Tap to start the clock on it"
            edge={d.safety === "unsafe" ? C.pull : C.line}>
            <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: C.muted }}>
                {d.workOrder || "defect"}
              </span>
              {d.safety === "unsafe" && (
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                               letterSpacing: "0.05em", color: C.pull }}>
                  Out of service
                </span>
              )}
            </div>
            <div style={{ fontFamily: FD, fontSize: 16, fontWeight: 700, marginTop: 2 }}>
              {d.unit}
            </div>
            <div style={{ fontSize: 13 }}>{d.category || "Defect"}</div>
            {d.note && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{d.note}</div>
            )}
            <div className="flex items-baseline justify-between"
              style={{ gap: 8, marginTop: 7 }}>
              <span style={{ fontSize: 12, color: C.green700, fontWeight: 700 }}>
                TAP TO START
              </span>
              <button onClick={(e) => { e.stopPropagation(); go?.("defects", "open", "mine"); }}
                style={{ ...linkBtn, fontSize: 11.5 }}>
                open the defect
              </button>
            </div>
          </Tappable>
        ))}
        {me && !jobs.length && !myDefects.length && (
          <div style={{ color: C.muted, fontSize: 13.5 }}>
            Nothing assigned to you. Work is put on people from the Work orders tab,
            and anything you claim on the Defects tab shows up here too.
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

/* A card that is one big target with a small link inside it.

   A <button> inside a <button> is not valid HTML and browsers disagree
   about what to do with the click, so the outer one is a div that
   behaves like a button — the keyboard handlers are what make that
   honest rather than just look right. */
function Tappable({ onTap, hint, edge, children }) {
  return (
    <div role="button" tabIndex={0} title={hint} onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); }
      }}
      style={{ background: C.card, borderRadius: 6, padding: "11px 13px",
               textAlign: "left", cursor: "pointer", color: C.ink,
               border: `1px solid ${edge}` }}>
      {children}
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

      {/* Who else is on it. Worth saying plainly: a mechanic walking up to
          a job somebody else has already had apart needs to know to go and
          find them first, not start over. */}
      {(j.crew || []).length > 1 && (
        <p style={{ fontSize: 13, margin: "0 0 12px" }}>
          <b>Working it with you:</b>{" "}
          {j.crew.filter((c) => c.mechanicId !== me?.id).map((c) => c.name).join(", ")}
        </p>
      )}

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
