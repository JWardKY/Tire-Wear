import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { C, FD, FB, FM } from "./theme.js";
import {
  fmtDate, nf, toCSV, Btn, Field, SectionLabel, inp, th, td, tdNum, linkBtn,
} from "./ui.jsx";
import * as file from "./truckFile.js";
import { findUnits, rollUp } from "./truckRollup.js";
import { sayOffline } from "./dbError.js";

/* ── The truck file ───────────────────────────────────────────────
   Every other screen is organised around a job — the clock, the defect
   board, the parts shelf. This one is organised around a truck.

   The question it answers is the one people were opening five tabs to
   answer: what has been done to DT-881. Type a number, get the whole
   file — what is wrong with it now, who has had their hands on it and
   for how long, the tires on it and the tires it has eaten, the
   services, the parts, and everything that has happened in order.

   Nothing on this page writes. It is a report, and a report that can
   change what it is reporting on is a bad idea in a shop. */

const SECTIONS = [
  ["now", "Right now"],
  ["time", "Mechanic time"],
  ["tires", "Tires"],
  ["pm", "Services"],
  ["parts", "Parts"],
  ["history", "Everything"],
];

/* Some of what lands here is a date column and some is a timestamp, and
   fmtDate takes a date. Handing it "2026-09-11T08:00:00Z" produced
   "09/11T08:00:00Z/26" on the defect rows — wrong in a way that reads
   as a rendering glitch rather than a bug, which is how it survived
   being looked at. One helper, used for every date on the page. */
const day = (v) => fmtDate(String(v || "").slice(0, 10));

const KIND_LABEL = {
  defect: "Defect", hours: "Hours", parts: "Parts",
  pm: "Service", tires: "Tires", order: "Order",
};

export default function TruckFileSection({ onBusy }) {
  const [units, setUnits] = useState([]);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState(null);
  const [f, setF] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const box = useRef(null);

  useEffect(() => {
    file.listUnits()
      .then(setUnits)
      .catch((e) => setErr(sayOffline(e, "load")
        || `Could not load the fleet — ${e.message || e}`));
  }, []);

  const matches = useMemo(
    () => (picked ? [] : findUnits(units, typed)), [units, typed, picked]);

  const open = useCallback(async (u) => {
    setPicked(u);
    setTyped(u.num);
    setLoading(true);
    onBusy?.(true);
    try {
      setF(await file.truckFile(u));
      setErr("");
    } catch (e) {
      setF(null);
      setErr(sayOffline(e, "load") || `Could not pull that file — ${e.message || e}`);
    } finally {
      setLoading(false);
      onBusy?.(false);
    }
  }, [onBusy]);

  const clear = () => { setPicked(null); setF(null); setTyped(""); box.current?.focus(); };

  const roll = useMemo(
    () => (f ? rollUp(f, { from, to, dualMatch: f.settings?.dualMatch }) : null),
    [f, from, to]);

  const jump = (id) => document
    .getElementById(`truck-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1400, padding: "16px 16px 60px" }}>
      {err && (
        <div style={{ background: "#FDECEA", color: C.pull, border: `1px solid ${C.pull}33`,
          borderRadius: 6, padding: "10px 14px", fontSize: 13, fontWeight: 600,
          marginBottom: 14 }}>{err}</div>
      )}

      {/* ── The box you type a truck number into ─────────────────── */}
      <div className="no-print" style={{ background: C.card, border: `1px solid ${C.line}`,
        borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
        <SectionLabel noMargin>Which truck</SectionLabel>
        <div className="flex flex-wrap items-end" style={{ gap: 10, marginTop: 8 }}>
          <div style={{ position: "relative", minWidth: 260 }}>
            <input ref={box} value={typed} autoFocus
              onChange={(e) => { setTyped(e.target.value); setPicked(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches.length) open(matches[0]);
                if (e.key === "Escape") clear();
              }}
              placeholder="881, DT-881, HT 1119…"
              style={{ ...inp, width: "100%", fontFamily: FM, fontSize: 16 }} />

            {matches.length > 0 && (
              <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0,
                background: "#fff", border: `1px solid ${C.line}`, borderRadius: 6,
                marginTop: 3, maxHeight: 300, overflowY: "auto",
                boxShadow: "0 8px 22px rgba(16,32,47,0.14)" }}>
                {matches.map((u) => (
                  <button key={u.id} onClick={() => open(u)}
                    style={{ display: "block", width: "100%", textAlign: "left",
                      padding: "8px 11px", border: "none", background: "#fff",
                      borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer",
                      font: "inherit" }}>
                    <span style={{ fontFamily: FM, fontWeight: 600, color: C.green900 }}>
                      {u.num}
                    </span>
                    <span style={{ fontSize: 12.5, color: C.muted, marginLeft: 8 }}>
                      {[u.make, u.model, u.year].filter(Boolean).join(" ")}
                      {!u.active && " · off the roster"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {picked && <Btn tone="ghost" onClick={clear}>Another truck</Btn>}

          {f && (
            <>
              <Field label="From"><input type="date" value={from}
                onChange={(e) => setFrom(e.target.value)} style={{ ...inp, width: 150 }} /></Field>
              <Field label="To"><input type="date" value={to}
                onChange={(e) => setTo(e.target.value)} style={{ ...inp, width: 150 }} /></Field>
              {(from || to) && (
                <Btn tone="ghost" onClick={() => { setFrom(""); setTo(""); }}>All of it</Btn>
              )}
              <Btn tone="ghost" onClick={() => window.print()}>Print</Btn>
              <Btn tone="ghost" onClick={() => downloadFile(f, roll)}>CSV</Btn>
            </>
          )}
        </div>
        {!picked && (
          <p style={{ fontSize: 12.5, color: C.muted, margin: "8px 0 0", lineHeight: 1.5 }}>
            Type any part of the number. Everything the shop knows about that unit comes
            up on one page — nothing here changes anything.
          </p>
        )}
        {(from || to) && (
          <p style={{ fontSize: 12.5, color: C.watch, margin: "8px 0 0", fontWeight: 600 }}>
            Dates apply to the hours, parts, services and the timeline. What is on the
            truck now — tires, open defects, PM due — is always current.
          </p>
        )}
      </div>

      {loading && <div style={{ color: C.muted, padding: 20 }}>Pulling the file…</div>}

      {f && roll && (
        <>
          <Head f={f} roll={roll} />

          <div className="flex flex-wrap no-print" style={{ gap: 6, margin: "14px 0 2px" }}>
            {SECTIONS.map(([id, label]) => (
              <button key={id} onClick={() => jump(id)}
                style={{ fontFamily: FD, fontSize: 12.5, letterSpacing: "0.04em",
                  textTransform: "uppercase", padding: "5px 11px", borderRadius: 4,
                  cursor: "pointer", border: `1px solid ${C.line}`,
                  background: "#fff", color: C.ink }}>
                {label}
              </button>
            ))}
          </div>

          <RightNow f={f} roll={roll} />
          <MechanicTime f={f} roll={roll} from={from} to={to} />
          <Tires f={f} roll={roll} />
          <Services f={f} roll={roll} from={from} to={to} />
          <Parts f={f} from={from} to={to} />
          <Everything f={f} from={from} to={to} />
        </>
      )}
    </div>
  );
}

/* ── Header ───────────────────────────────────────────────────── */
function Head({ f, roll }) {
  const u = f.unit;
  const chips = [];
  if (roll.majorDefect) chips.push(["Major defect", C.pull]);
  if (roll.openDefects) chips.push([`${roll.openDefects} open defect${roll.openDefects === 1 ? "" : "s"}`, C.watch]);
  if (roll.openOrders) chips.push([`${roll.openOrders} job${roll.openOrders === 1 ? "" : "s"} open`, C.watch]);
  if (roll.pmOver) chips.push([`${roll.pmOver} service over`, C.pull]);
  if (roll.pmSoon) chips.push([`${roll.pmSoon} service due soon`, C.watch]);
  if (roll.mismatchedPairs.length)
    chips.push([`${roll.mismatchedPairs.length} mismatched dual${roll.mismatchedPairs.length === 1 ? "" : "s"}`, C.watch]);
  if (!u.active) chips.push(["Off the roster", C.muted]);
  if (!chips.length) chips.push(["Nothing outstanding", C.good]);

  return (
    <div style={{ background: C.green900, borderRadius: 8, padding: "16px 20px", color: "#fff" }}>
      <div className="flex flex-wrap items-baseline justify-between" style={{ gap: 12 }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 30, fontWeight: 700, lineHeight: 1.05,
            color: C.yellowHi }}>{u.num}</div>
          <div style={{ fontSize: 13.5, color: C.onDark, marginTop: 3 }}>
            {[u.make, u.model, u.year].filter(Boolean).join(" ") || "No make or model on the roster"}
            {u.div ? ` · ${u.div}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: FM, fontSize: 22, fontWeight: 600, color: "#fff" }}>
            {f.meter.odo != null ? `${nf(f.meter.odo)} mi` : "no mileage"}
          </div>
          <div style={{ fontSize: 11.5, color: C.onDarkSoft }}>
            {f.meter.date ? `read ${day(f.meter.date)}${f.meter.source ? ` · ${f.meter.source}` : ""}` : "nothing logged"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap" style={{ gap: 6, marginTop: 12 }}>
        {chips.map(([label, col]) => (
          <span key={label} style={{ fontFamily: FD, fontSize: 12, fontWeight: 600,
            letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 9px",
            borderRadius: 3, background: col, color: "#fff" }}>{label}</span>
        ))}
      </div>

      <div className="flex flex-wrap" style={{ gap: 24, marginTop: 14, paddingTop: 12,
        borderTop: `1px solid ${C.green800}` }}>
        <Fig label="Labour hours" value={nf(roll.labourHours, 2)} sub={`${roll.lines} entries`} />
        <Fig label="Mechanics on it" value={roll.mechanics.length} />
        <Fig label="Services done" value={roll.servicesDone} />
        <Fig label="Defects repaired" value={roll.repairedDefects} />
        <Fig label="Jobs completed" value={roll.doneOrders} />
        <Fig label="Parts issued" value={roll.partLines}
          sub={roll.partsCost ? `$${nf(roll.partsCost, 2)}` : undefined} />
        <Fig label="Tires on it" value={roll.tiresOn}
          sub={roll.tiresOff ? `${roll.tiresOff} pulled` : undefined} />
      </div>
    </div>
  );
}

function Fig({ label, value, sub }) {
  return (
    <div>
      <div style={{ fontFamily: FD, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em",
        textTransform: "uppercase", color: C.onDarkSoft }}>{label}</div>
      <div style={{ fontFamily: FM, fontSize: 19, fontWeight: 600, color: "#fff",
        lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontFamily: FM, fontSize: 10.5, color: C.onDarkSoft }}>{sub}</div>}
    </div>
  );
}

/* ── Cards ────────────────────────────────────────────────────── */
function Card({ id, title, note, children }) {
  return (
    <section id={`truck-${id}`} className="print-block"
      style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8,
        padding: "14px 16px", marginTop: 14 }}>
      <div className="flex flex-wrap items-baseline justify-between" style={{ gap: 10 }}>
        <h2 style={{ fontFamily: FD, fontSize: 18, fontWeight: 700, color: C.green900,
          margin: 0, lineHeight: 1.2 }}>{title}</h2>
        {note && <span style={{ fontSize: 12, color: C.muted }}>{note}</span>}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
}

const Empty = ({ children }) => (
  <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.55 }}>{children}</div>
);

function Table({ head, right = [], children, min = 620 }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: min }}>
        <thead><tr>
          {head.map((h, i) => (
            <th key={h} style={{ ...th, textAlign: right.includes(i) ? "right" : "left" }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const Row = ({ children }) => (
  <tr style={{ borderTop: `1px solid ${C.lineSoft}` }}>{children}</tr>
);

/* ── Right now ────────────────────────────────────────────────── */
function RightNow({ f, roll }) {
  const open = f.defects.filter((d) => d.state !== "repaired");
  const jobs = f.orders.filter((w) => w.state !== "done");
  const due = f.pmDue.filter((p) => p.level === "over" || p.level === "soon");
  const odd = roll.mismatchedPairs;

  return (
    <Card id="now" title="Right now"
      note="Current state, whatever dates are set above">
      {!open.length && !jobs.length && !due.length && !odd.length ? (
        <Empty>Nothing outstanding. No open defects, no open jobs, nothing due.</Empty>
      ) : (
        <>
          {open.length > 0 && (
            <>
              <SectionLabel>Open defects</SectionLabel>
              <Table head={["Reported", "What", "How it was written up", "By", "Times", "Job"]}
                right={[4]} min={680}>
                {open.map((d) => (
                  <Row key={d.id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{day(d.first)}</td>
                    <td style={td}>
                      <b>{d.category || "Defect"}</b>
                      {d.note && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{d.note}</div>}
                    </td>
                    <td style={td}>
                      {d.safety === "unsafe"
                        ? <b style={{ color: C.pull }}>Major</b>
                        : <span style={{ color: C.muted }}>Minor</span>}
                    </td>
                    <td style={{ ...td, color: C.muted }}>{d.driver || d.source || "—"}</td>
                    <td style={{ ...td, ...tdNum }}>{d.count || 1}</td>
                    <td style={{ ...td, fontFamily: FM, fontSize: 12.5 }}>{d.workOrder || "—"}</td>
                  </Row>
                ))}
              </Table>
            </>
          )}

          {jobs.length > 0 && (
            <>
              <SectionLabel>Open work orders</SectionLabel>
              <Table head={["Order", "What", "State", "Who has it", "Opened"]} min={620}>
                {jobs.map((w) => (
                  <Row key={w.id}>
                    <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{w.wo}</td>
                    <td style={td}>
                      <b>{w.title}</b>
                      {w.detail && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{w.detail}</div>}
                    </td>
                    <td style={td}>
                      {w.state}
                      {w.holdReason && (
                        <div style={{ fontSize: 12.5, color: C.watch, marginTop: 2 }}>
                          Waiting: {w.holdReason}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, color: C.muted }}>{w.assigned || "nobody yet"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: C.muted }}>{day(w.at)}</td>
                  </Row>
                ))}
              </Table>
            </>
          )}

          {odd.length > 0 && (
            <>
              <SectionLabel>Duals that do not match</SectionLabel>
              <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.7, marginBottom: 4 }}>
                {odd.map((m) => (
                  <div key={m.end}>
                    <span style={{ fontFamily: FM, fontWeight: 700 }}>{m.end}</span>
                    {" — "}
                    <span style={{ fontWeight: 700, color: C.pull }}>{m.diff}/32 apart</span>
                    <span style={{ color: C.muted }}>
                      {" · "}{m.shallower} at {m.shallowest}/32 beside{" "}
                      {m.deeper} at {m.deepest}/32
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: C.muted, margin: "0 0 4px", lineHeight: 1.5 }}>
                The deeper tire carries the load, runs hot and scrubs, and both come off early.
              </p>
            </>
          )}

          {due.length > 0 && (
            <>
              <SectionLabel>Service due</SectionLabel>
              <Table head={["Service", "When", "Miles left", "Last done", "By"]}
                right={[2]} min={560}>
                {due.map((p) => (
                  <Row key={p.programId}>
                    <td style={td}><b>{p.program}</b></td>
                    <td style={td}>
                      <span style={{ color: p.level === "over" ? C.pull : C.watch, fontWeight: 600 }}>
                        {p.level === "over" ? "Over" : "Due soon"}
                      </span>
                      {p.dueDate && <span style={{ color: C.muted }}> · {day(p.dueDate)}</span>}
                    </td>
                    <td style={{ ...td, ...tdNum }}>
                      {p.milesLeft == null ? "—" : nf(p.milesLeft)}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: C.muted }}>
                      {p.lastDate ? day(p.lastDate) : "never"}
                      {p.lastOdo != null && ` · ${nf(p.lastOdo)} mi`}
                    </td>
                    <td style={{ ...td, color: C.muted }}>{p.lastBy || "—"}</td>
                  </Row>
                ))}
              </Table>
            </>
          )}
        </>
      )}
    </Card>
  );
}

/* ── Mechanic time ────────────────────────────────────────────── */
function MechanicTime({ f, roll, from, to }) {
  const [all, setAll] = useState(false);
  const lines = f.hours
    .filter((h) => (!from || h.date >= from) && (!to || h.date <= to));
  const shown = all ? lines : lines.slice(0, 25);

  return (
    <Card id="time" title="Mechanic time"
      note={`${nf(roll.labourHours, 2)} hours over ${roll.lines} entr${roll.lines === 1 ? "y" : "ies"}`}>
      {!lines.length ? (
        <Empty>Nobody has booked an hour to this unit{from || to ? " in that range" : " yet"}.</Empty>
      ) : (
        <>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
            <div>
              <SectionLabel>Who has worked on it</SectionLabel>
              <Table head={["Mechanic", "Hours", "Days", "Last on it"]} right={[1, 2]} min={300}>
                {roll.mechanics.map((m) => (
                  <Row key={m.mechanic}>
                    <td style={td}>{m.mechanic}</td>
                    <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{nf(m.hours, 2)}</td>
                    <td style={{ ...td, ...tdNum, color: C.muted }}>{m.days}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: C.muted }}>{day(m.last)}</td>
                  </Row>
                ))}
              </Table>
            </div>
            <div>
              <SectionLabel>What it was charged to</SectionLabel>
              <Table head={["Code", "Name", "Hours"]} right={[2]} min={300}>
                {roll.codes.map((c) => (
                  <Row key={c.code}>
                    <td style={{ ...td, fontFamily: FM }}>{c.code}</td>
                    <td style={{ ...td, color: C.muted }}>{c.name || "—"}</td>
                    <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{nf(c.hours, 2)}</td>
                  </Row>
                ))}
              </Table>
            </div>
          </div>

          <SectionLabel>Every entry</SectionLabel>
          <Table head={["Date", "Mechanic", "Hours", "Code", "Where", "What was done", "Order"]}
            right={[2]} min={820}>
            {shown.map((h) => (
              <Row key={h.id}>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{day(h.date)}</td>
                <td style={td}>{h.mechanic || "—"}</td>
                <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{nf(h.hours, 2)}</td>
                <td style={{ ...td, fontFamily: FM, fontSize: 12.5 }}>
                  {h.code || "—"}
                  {h.codeName && <div style={{ fontFamily: FB, fontSize: 12, color: C.muted }}>{h.codeName}</div>}
                </td>
                <td style={{ ...td, color: C.muted }}>
                  {h.where === "road" ? "Road call" : h.where === "field" ? "Field"
                    : h.where === "plant" ? "Plant" : "Shop"}
                  {h.jobLocation && <div style={{ fontSize: 12 }}>{h.jobLocation}</div>}
                </td>
                <td style={{ ...td, maxWidth: 340 }}>
                  {h.performed || h.note || <span style={{ color: C.muted }}>—</span>}
                  {h.types?.length > 0 && (
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                      {h.types.join(" · ")}
                    </div>
                  )}
                </td>
                <td style={{ ...td, fontFamily: FM, fontSize: 12.5 }}>{h.workOrder || "—"}</td>
              </Row>
            ))}
          </Table>
          {lines.length > shown.length && (
            <button onClick={() => setAll(true)} style={{ ...linkBtn, marginTop: 8 }}>
              Show all {lines.length} entries
            </button>
          )}
        </>
      )}
    </Card>
  );
}

/* ── Tires ────────────────────────────────────────────────────── */
function Tires({ f, roll }) {
  const on = f.tires.filter((t) => t.on)
    .sort((a, b) => String(a.pos).localeCompare(String(b.pos)));
  const off = f.tires.filter((t) => !t.on);
  const oddAt = new Map();
  for (const m of roll.mismatchedPairs) {
    oddAt.set(m.inner, m);
    oddAt.set(m.outer, m);
  }

  return (
    <Card id="tires" title="Tires"
      note={roll.tireSpend ? `$${nf(roll.tireSpend, 2)} of rubber recorded` : undefined}>
      {!f.tires.length ? (
        <Empty>No tires entered for this unit. They go in under Tires → Fleet.</Empty>
      ) : (
        <>
          <SectionLabel>On it now ({on.length})</SectionLabel>
          {on.length === 0 ? (
            <Empty>Nothing mounted.</Empty>
          ) : (
            <Table head={["Pos", "Brand / model", "Size", "Type", "Tread", "Mounted", "At", "Note"]}
              right={[4, 6]} min={780}>
              {on.map((t) => (
                <Row key={t.id}>
                  <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{t.pos}</td>
                  <td style={td}>{[t.brand || "Unbranded", t.model].filter(Boolean).join(" ")}</td>
                  <td style={{ ...td, color: C.muted }}>{t.size || "—"}</td>
                  <td style={{ ...td, color: C.muted }}>{t.type === "retread" ? "Retread" : "Virgin"}</td>
                  <td style={{ ...td, ...tdNum, fontWeight: 600,
                    color: t.depth != null && t.pullAt != null && t.depth <= t.pullAt
                      ? C.pull : C.ink }}>
                    {t.depth == null ? "—" : `${t.depth}/32`}
                    {oddAt.has(String(t.pos).toUpperCase()) && (
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.watch,
                        whiteSpace: "nowrap" }}>
                        {oddAt.get(String(t.pos).toUpperCase()).diff}/32 off its pair
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{day(t.onDate)}</td>
                  <td style={{ ...td, ...tdNum, color: C.muted }}>{t.onOdo == null ? "—" : nf(t.onOdo)}</td>
                  <td style={{ ...td, fontSize: 12.5, color: C.watch }}>{t.notes || ""}</td>
                </Row>
              ))}
            </Table>
          )}

          {off.length > 0 && (
            <>
              <SectionLabel>Come off it ({off.length})</SectionLabel>
              <Table head={["Pos", "Brand", "Type", "On", "Off", "Miles run", "Why"]}
                right={[5]} min={700}>
                {off.map((t) => (
                  <Row key={t.id}>
                    <td style={{ ...td, fontFamily: FM, fontWeight: 600 }}>{t.pos}</td>
                    <td style={td}>{t.brand || "Unbranded"}</td>
                    <td style={{ ...td, color: C.muted }}>{t.type === "retread" ? "Retread" : "Virgin"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: C.muted }}>{day(t.onDate)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{day(t.offDate)}</td>
                    <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{t.miles == null ? "—" : nf(t.miles)}</td>
                    <td style={{ ...td, color: C.muted }}>{t.offReason || "—"}</td>
                  </Row>
                ))}
              </Table>
            </>
          )}
        </>
      )}
    </Card>
  );
}

/* ── Services ─────────────────────────────────────────────────── */
function Services({ f, roll, from, to }) {
  const done = f.services
    .filter((s) => (!from || s.date >= from) && (!to || s.date <= to));
  return (
    <Card id="pm" title="Services"
      note={`${done.length} recorded${from || to ? " in range" : ""}`}>
      {!done.length ? (
        <Empty>No services recorded against this unit{from || to ? " in that range" : ""}.</Empty>
      ) : (
        <Table head={["Date", "Service", "Odometer", "Engine hrs", "Labour", "By", "Note"]}
          right={[2, 3, 4]} min={720}>
          {done.map((s) => (
            <Row key={s.id}>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{day(s.date)}</td>
              <td style={td}>
                <b>{s.program}</b>
                {s.category && <div style={{ fontSize: 12, color: C.muted }}>{s.category}</div>}
              </td>
              <td style={{ ...td, ...tdNum }}>{s.odo == null ? "—" : nf(s.odo)}</td>
              <td style={{ ...td, ...tdNum, color: C.muted }}>{s.engineHours == null ? "—" : nf(s.engineHours, 1)}</td>
              <td style={{ ...td, ...tdNum }}>{s.hours == null ? "—" : nf(s.hours, 2)}</td>
              <td style={{ ...td, color: C.muted }}>{s.by || "—"}</td>
              <td style={{ ...td, fontSize: 12.5, maxWidth: 300 }}>{s.note || ""}</td>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}

/* ── Parts ────────────────────────────────────────────────────── */
function Parts({ f, from, to }) {
  const [all, setAll] = useState(false);
  const lines = f.parts.filter((p) => {
    const d = String(p.at || "").slice(0, 10);
    return p.kind === "issue" && (!from || d >= from) && (!to || d <= to);
  });
  const shown = all ? lines : lines.slice(0, 25);
  const spend = lines.reduce((a, p) => a + (p.cost || 0) * p.qty, 0);

  return (
    <Card id="parts" title="Parts"
      note={lines.length ? `${lines.length} lines${spend ? ` · $${nf(spend, 2)}` : ""}` : undefined}>
      {!lines.length ? (
        <Empty>No parts issued to this unit{from || to ? " in that range" : " yet"}.</Empty>
      ) : (
        <>
          <Table head={["Date", "Part", "Qty", "Each", "Line", "Who", "Order"]}
            right={[2, 3, 4]} min={700}>
            {shown.map((p) => (
              <Row key={p.id}>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{day(p.at)}</td>
                <td style={td}>
                  <span style={{ fontFamily: FM, fontWeight: 600 }}>{p.partNumber}</span>
                  {p.name && <div style={{ fontSize: 12.5, color: C.muted }}>{p.name}</div>}
                </td>
                <td style={{ ...td, ...tdNum, fontWeight: 600 }}>{nf(p.qty)}</td>
                <td style={{ ...td, ...tdNum, color: C.muted }}>{p.cost == null ? "—" : `$${nf(p.cost, 2)}`}</td>
                <td style={{ ...td, ...tdNum }}>{p.cost == null ? "—" : `$${nf(p.cost * p.qty, 2)}`}</td>
                <td style={{ ...td, color: C.muted }}>{p.who || "—"}</td>
                <td style={{ ...td, fontFamily: FM, fontSize: 12.5 }}>{p.workOrder || "—"}</td>
              </Row>
            ))}
          </Table>
          {lines.length > shown.length && (
            <button onClick={() => setAll(true)} style={{ ...linkBtn, marginTop: 8 }}>
              Show all {lines.length} lines
            </button>
          )}
        </>
      )}
    </Card>
  );
}

/* ── Everything, in order ─────────────────────────────────────── */
function Everything({ f, from, to }) {
  const [kind, setKind] = useState("all");
  const [all, setAll] = useState(false);

  const rows = f.history.filter((r) => {
    const d = String(r.at || "").slice(0, 10);
    return (kind === "all" || r.kind === kind)
      && (!from || d >= from) && (!to || d <= to);
  });
  const shown = all ? rows : rows.slice(0, 60);
  const kinds = [...new Set(f.history.map((r) => r.kind))];

  return (
    <Card id="history" title="Everything that has happened"
      note={`${rows.length} entries, newest first`}>
      <div className="flex flex-wrap no-print" style={{ gap: 5, marginBottom: 10 }}>
        {["all", ...kinds].map((k) => (
          <button key={k} onClick={() => { setKind(k); setAll(false); }}
            style={{ fontFamily: FD, fontSize: 12, letterSpacing: "0.05em",
              textTransform: "uppercase", padding: "4px 10px", borderRadius: 4,
              cursor: "pointer", border: `1px solid ${kind === k ? C.green700 : C.line}`,
              background: kind === k ? C.green700 : "#fff",
              color: kind === k ? "#fff" : C.ink }}>
            {k === "all" ? "All" : KIND_LABEL[k] || k}
          </button>
        ))}
      </div>

      {!rows.length ? (
        <Empty>Nothing recorded{from || to ? " in that range" : " yet"}.</Empty>
      ) : (
        <>
          <Table head={["When", "What", "Detail", "Who", "Hours", "Order"]}
            right={[4]} min={760}>
            {shown.map((r, i) => (
              <Row key={`${r.kind}-${r.id}-${i}`}>
                <td style={{ ...td, whiteSpace: "nowrap", fontFamily: FM, fontSize: 12.5 }}>
                  {day(r.at)}
                </td>
                <td style={{ ...td, whiteSpace: "nowrap" }}><b>{r.what}</b></td>
                <td style={{ ...td, maxWidth: 420 }}>{r.summary}</td>
                <td style={{ ...td, color: C.muted }}>{r.who || "—"}</td>
                <td style={{ ...td, ...tdNum }}>{r.hours == null ? "—" : nf(r.hours, 2)}</td>
                <td style={{ ...td, fontFamily: FM, fontSize: 12.5 }}>{r.workOrder || "—"}</td>
              </Row>
            ))}
          </Table>
          {rows.length > shown.length && (
            <button onClick={() => setAll(true)} style={{ ...linkBtn, marginTop: 8 }}>
              Show all {rows.length}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

/* ── The whole file as a spreadsheet ──────────────────────────────
   One file with every section stacked under its own heading, rather
   than seven downloads. Somebody sending a truck's history to a buyer
   or an insurer wants one attachment. */
function downloadFile(f, roll) {
  const rows = [];
  const head = (t) => { rows.push([]); rows.push([t]); };

  rows.push([`Truck file — ${f.unit.num}`]);
  rows.push([[f.unit.make, f.unit.model, f.unit.year].filter(Boolean).join(" "),
    f.unit.div || "", f.meter.odo != null ? `${f.meter.odo} mi` : "no mileage",
    f.meter.date || ""]);

  head("SUMMARY");
  rows.push(["Labour hours", roll.labourHours], ["Entries", roll.lines],
    ["Mechanics", roll.mechanics.length], ["Services done", roll.servicesDone],
    ["Defects repaired", roll.repairedDefects], ["Jobs completed", roll.doneOrders],
    ["Parts lines", roll.partLines], ["Parts cost", roll.partsCost],
    ["Tires on it", roll.tiresOn], ["Tires pulled", roll.tiresOff],
    ["Open defects", roll.openDefects], ["Open jobs", roll.openOrders]);

  head("MECHANIC TIME");
  rows.push(["mechanic", "hours", "days", "last_on_it"]);
  roll.mechanics.forEach((m) => rows.push([m.mechanic, m.hours, m.days, m.last]));

  head("HOURS, EVERY ENTRY");
  rows.push(["date", "mechanic", "hours", "cost_code", "cost_code_name", "where",
    "job_location", "work_order", "what_was_done"]);
  f.hours.forEach((h) => rows.push([h.date, h.mechanic, h.hours, h.code, h.codeName,
    h.where, h.jobLocation, h.workOrder, h.performed || h.note]));

  head("TIRES");
  rows.push(["position", "on_now", "brand", "model", "size", "type", "mounted",
    "mounted_odo", "new_32nds", "removed", "removed_odo", "miles_run", "why", "cost"]);
  f.tires.forEach((t) => rows.push([t.pos, t.on ? "yes" : "no", t.brand, t.model, t.size,
    t.type, t.onDate, t.onOdo, t.newDepth, t.offDate, t.offOdo, t.miles, t.offReason, t.cost]));

  head("SERVICES");
  rows.push(["date", "service", "category", "odometer", "engine_hours", "labour_hours", "by", "note"]);
  f.services.forEach((s) => rows.push([s.date, s.program, s.category, s.odo,
    s.engineHours, s.hours, s.by, s.note]));

  head("DEFECTS");
  rows.push(["first_reported", "category", "note", "safety", "state", "times",
    "repaired_at", "repaired_by", "repair_note", "repair_hours", "work_order"]);
  f.defects.forEach((d) => rows.push([d.first, d.category, d.note, d.safety, d.state,
    d.count, d.repairedAt, d.repairedBy, d.repairNote, d.repairHours, d.workOrder]));

  head("WORK ORDERS");
  rows.push(["order", "title", "detail", "state", "priority", "opened", "completed",
    "completed_by", "note"]);
  f.orders.forEach((w) => rows.push([w.wo, w.title, w.detail, w.state, w.priority,
    w.at, w.completedAt, w.completedBy, w.note]));

  head("PARTS");
  rows.push(["at", "part_number", "name", "qty", "unit_cost", "who", "work_order"]);
  f.parts.filter((p) => p.kind === "issue").forEach((p) => rows.push([p.at, p.partNumber,
    p.name, p.qty, p.cost, p.who, p.workOrder]));

  head("MILEAGE");
  rows.push(["date", "odometer", "source", "by"]);
  f.odos.forEach((o) => rows.push([o.date, o.odo, o.source, o.by]));

  head("EVERYTHING");
  rows.push(["at", "kind", "what", "detail", "who", "hours", "work_order"]);
  f.history.forEach((r) => rows.push([r.at, r.kind, r.what, r.summary, r.who,
    r.hours, r.workOrder]));

  const blob = new Blob([toCSV(rows)], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `truck-file-${f.unit.num}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
