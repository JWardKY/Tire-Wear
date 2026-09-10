import React, { useState, useEffect, useCallback, useRef } from "react";
import { C, FD } from "./theme.js";
import { Btn, SectionLabel, Modal, nf } from "./ui.jsx";
import * as now from "./nowData.js";
import { todayISO } from "./day.js";

/* ── Now ──────────────────────────────────────────────────────────
   What the shop looks like at this moment: who is on the clock, and
   the handful of numbers worth a glance from the doorway.

   The elapsed time is recomputed from each shift's start timestamp on
   every tick rather than counted up in the browser, so a screen left
   on overnight shows the truth instead of however long the tab has
   been open. */

const RANGES = [
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
];

const iso = (d) => d.toISOString().slice(0, 10);
function rangeFor(key) {
  const t = new Date();
  const today = iso(t);
  if (key === "today") return [today, today];
  if (key === "week") {
    const d = new Date(t);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return [iso(d), today];
  }
  return [today.slice(0, 8) + "01", today];
}

export default function NowSection({ who, tab, onBusy, supervisor, go }) {
  const [clock, setClock] = useState([]);
  const [nums, setNums] = useState(null);
  const [err, setErr] = useState("");
  const [range, setRange] = useState("today");
  const [closing, setClosing] = useState(null);
  const [detail, setDetail] = useState(new Map());
  const [open, setOpen] = useState(null);   // the person being looked at
  const [, forceTick] = useState(0);
  const timer = useRef(null);
  const clockCard = useRef(null);

  const load = useCallback(async () => {
    try {
      const [from, to] = rangeFor(range);
      const [c, n] = await Promise.all([
        now.listOnClock(), now.boardNumbers(from, to),
      ]);
      setClock(c); setNums(n); setErr("");
      /* After the board, not with it: who is here is the headline and
         should not wait on what they are doing. */
      setDetail(await now.onClockDetail(c, todayISO()));
    } catch (e) { setErr(e.message || String(e)); }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  /* One second for the running clocks; the data itself every half
     minute, which is often enough for a board on a wall and gentle
     enough on a shop's connection. */
  useEffect(() => {
    timer.current = setInterval(() => forceTick((n) => n + 1), 1000);
    const slow = setInterval(load, 30000);
    return () => { clearInterval(timer.current); clearInterval(slow); };
  }, [load]);

  return (
    <div>
      {err && <div style={{ background: C.pull, color: "#fff", padding: "8px 12px",
                            borderRadius: 4, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {/* Tapping "on the clock" on the board scrolls here rather than
          navigating: the answer is already on this screen, just above
          the fold on a phone. */}
      <div ref={clockCard}
        style={{ display: "flex", justifyContent: "space-between",
                 alignItems: "baseline", marginBottom: 10, gap: 12,
                 flexWrap: "wrap", scrollMarginTop: 12 }}>
        <SectionLabel>On the clock now</SectionLabel>
        <span style={{ fontFamily: FD, fontSize: 13, color: C.muted }}>
          {clock.length ? `${clock.length} punched in` : "nobody punched in"}
        </span>
      </div>

      {clock.length === 0 ? (
        <div style={{ padding: "18px 14px", background: C.card,
                      border: `1px solid ${C.line}`, borderRadius: 6,
                      color: C.muted, fontSize: 14, marginBottom: 26 }}>
          Shop is clear. Nobody is currently on the clock.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginBottom: 26,
                      gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,240px),1fr))" }}>
          {clock.map((s) => (
            /* The whole card opens the person. A foreman wanting to know
               what somebody is on should not have to find a link. */
            <div key={s.id} role="button" tabIndex={0}
              title={`What ${s.mechanic} is on`}
              onClick={() => setOpen(s)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(s); }
              }}
              style={{
                background: C.card, borderRadius: 6, padding: "12px 14px",
                cursor: "pointer",
                border: `1px solid ${s.stale ? C.watch : C.line}`,
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7,
                            fontWeight: 600, fontSize: 15 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%",
                               background: s.stale ? C.watch : C.good,
                               flexShrink: 0 }} />
                {s.mechanic}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 22,
                            margin: "6px 0 2px" }}>
                {now.fmtHMS(now.elapsedSec(s.startedAt))}
              </div>
              <div style={{ fontSize: 12, color: s.stale ? C.watch : C.muted }}>
                {s.stale
                  ? `Left open since ${s.startedOn}`
                  : `In at ${new Date(s.startedAt).toLocaleTimeString([], {
                      hour: "numeric", minute: "2-digit" })}`}
              </div>
              <OnWhat d={detail.get(s.mechanicId)} />

              {s.stale && (
                <div style={{ marginTop: 8 }}>
                  <Btn tone="ghost"
                    onClick={(e) => { e.stopPropagation(); setClosing(s); }}>CLOSE IT</Btn>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", marginBottom: 10, gap: 12,
                    flexWrap: "wrap" }}>
        <SectionLabel>The shop at a glance</SectionLabel>
        <div style={{ display: "flex", gap: 4 }}>
          {RANGES.map(([k, label]) => (
            <button key={k} onClick={() => setRange(k)}
              style={{
                fontFamily: FD, fontSize: 12.5, letterSpacing: "0.04em",
                textTransform: "uppercase", padding: "5px 10px", borderRadius: 4,
                cursor: "pointer",
                border: `1px solid ${range === k ? C.green700 : C.line}`,
                background: range === k ? C.green700 : "#fff",
                color: range === k ? "#fff" : C.ink,
              }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8,
                    gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,150px),1fr))" }}>
        {nums && [
          /* Each number is a question, so each tile is a way of asking
             it. The fourth item is what to do about it; a tile with
             nothing behind it stays a plain number rather than
             pretending to be a link.

             The four hours tiles land in Supervisor, which is gated. If
             nobody has unlocked it they are left unclickable on purpose
             — sending a mechanic into a PIN prompt they cannot answer is
             the surprise this nav was rearranged to stop. */
          ["On the clock", nums.onClock, false,
            clock.length ? () => clockCard.current?.scrollIntoView(
              { behavior: "smooth", block: "start" }) : null,
            clock.length ? "See who" : null],
          ["Open defects", nums.openDefects, nums.openDefects > 0,
            nums.openDefects ? () => go?.("defects", "open") : null, "Open the list"],
          ["Units out of service", nums.outOfService, nums.outOfService > 0,
            nums.outOfService ? () => go?.("defects", "open", "unsafe") : null,
            "Just these"],
          ["Open over a week", nums.openOverAWeek, nums.openOverAWeek > 0,
            nums.openOverAWeek ? () => go?.("defects", "open", "stale") : null,
            "Just these"],
          ["Hours in range", nums.hours, false,
            supervisor ? () => go?.("supervisor", "rollup") : null, "Where they went"],
          ["Entries booked", nums.entries, false,
            supervisor ? () => go?.("supervisor", "detail") : null, "Every entry"],
          ["Units touched", nums.unitsTouched, false,
            supervisor ? () => go?.("supervisor", "rollup") : null, "By unit"],
          ["On road calls", `${nums.roadPct}%`, false,
            supervisor ? () => go?.("supervisor", "rollup") : null, "The split"],
        ].map(([label, val, warn, onClick, hint]) => {
          const body = (
            <>
              <div style={{ fontFamily: FD, fontSize: 26, fontWeight: 700,
                            color: warn ? C.pull : C.ink, lineHeight: 1.1 }}>{val}</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3,
                            textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {label}
              </div>
              {onClick && (
                <div style={{ fontSize: 11, color: C.green600, marginTop: 5,
                              fontWeight: 600 }}>
                  {hint} →
                </div>
              )}
            </>
          );
          const box = {
            background: C.card, borderRadius: 6, padding: "12px 14px",
            border: `1px solid ${C.line}`, textAlign: "left", width: "100%",
            font: "inherit", color: "inherit",
          };
          return onClick ? (
            <button key={label} onClick={onClick} title={`${label} — ${hint}`}
              style={{ ...box, cursor: "pointer" }}>
              {body}
            </button>
          ) : (
            <div key={label} style={box}>{body}</div>
          );
        })}
      </div>

      {open && (
        <OnClockDialog s={open} d={detail.get(open.mechanicId)} go={go}
          onClose={() => setOpen(null)} />
      )}

      {closing && (
        <Modal title={`Close ${closing.mechanic}'s shift?`} onClose={() => setClosing(null)}>
          <p style={{ fontSize: 14 }}>
            It has been open since <b>{closing.startedOn}</b>, so it was almost
            certainly a missed punch-out rather than a very long day. Closing it
            stops the clock now. It does not book any hours — those are entered
            on the timecard.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn tone="ghost" onClick={() => setClosing(null)}>CANCEL</Btn>
            <Btn onClick={async () => {
              const s = closing; setClosing(null); onBusy?.(true);
              try { await now.closeShift(s.id); await load(); }
              catch (e) { setErr(e.message || String(e)); }
              finally { onBusy?.(false); }
            }}>CLOSE THE SHIFT</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── What somebody on the clock is on ─────────────────────────────
   One line on the card, because the board is read from across a shop.
   The job takes precedence over the defect and the defect over the
   hours: a foreman scanning the row wants the current thing, not a
   summary of the day.

   "Nothing booked yet" is worded carefully. A mechanic can be an hour
   into a job with the clock running on their own card and still read as
   nothing here, because that card is a draft in their phone until they
   press Save. Saying "nothing booked yet" is true; saying "idle" would
   not be, and would be a bad thing to say about somebody under a
   truck. */
function OnWhat({ d }) {
  if (!d) return null;
  const job = d.jobs[0];
  const def = d.defects[0];

  const line = job
    ? `${job.unit || "shop job"} · ${job.title}`
    : def
      ? `${def.unit} · ${def.category}`
      : d.booked.length
        ? `${nf(d.hours, 2)} hr booked today`
        : "nothing booked yet";

  const more = (d.jobs.length + d.defects.length) - (job ? 1 : 0) - (def && !job ? 1 : 0);

  return (
    <div style={{ marginTop: 7, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 6 }}>
      <div style={{ fontSize: 12.5, color: job || def ? C.ink : C.muted,
                    fontWeight: job || def ? 600 : 400, lineHeight: 1.35 }}>
        {line}
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
        {more > 0 ? `and ${more} more · ` : ""}
        {d.booked.length && (job || def) ? `${nf(d.hours, 2)} hr booked · ` : ""}
        tap for the rest
      </div>
    </div>
  );
}

/* Everything the database knows about one person's day. Deliberately
   not "everything they are doing" — see onClockDetail. */
function OnClockDialog({ s, d, go, onClose }) {
  const jobs = d?.jobs || [];
  const defects = d?.defects || [];
  const booked = d?.booked || [];

  return (
    <Modal title={s.mechanic}
      sub={`On the clock ${now.fmtHMS(now.elapsedSec(s.startedAt))} · in at ${
        new Date(s.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
      onClose={onClose} width={620}>

      <Group label={`Put on them · ${jobs.length}`}>
        {jobs.length === 0
          ? <Empty>Nothing assigned. Work is put on people from the Work orders tab.</Empty>
          : jobs.map((j) => (
            <Row key={j.id}
              head={`${j.wo} · ${j.unit || "shop job"}`}
              body={j.title}
              note={[j.detail, j.holdReason && `Waiting: ${j.holdReason}`]
                .filter(Boolean).join(" — ")}
              tone={j.priority === "now" ? C.pull : j.priority === "today" ? C.watch : C.line}
              tag={j.startedAt ? "started" : j.state} />
          ))}
      </Group>

      <Group label={`Claimed off the board · ${defects.length}`}>
        {defects.length === 0
          ? <Empty>Nothing claimed on the Defects tab.</Empty>
          : defects.map((x) => (
            <Row key={x.id}
              head={`${x.unit} · ${x.category}`}
              body={x.note}
              note={x.workOrder}
              tone={x.unsafe ? C.pull : C.line}
              tag={x.unsafe ? "out of service" : ""} />
          ))}
      </Group>

      <Group label={`Booked today · ${nf(d?.hours || 0, 2)} hr`}>
        {booked.length === 0
          ? (
            <Empty>
              Nothing saved yet. A clock running on somebody&apos;s own card does not
              show here until they press Save — it is a draft on their phone, not a
              record.
            </Empty>
          )
          : booked.map((b) => (
            <Row key={b.id}
              head={`${nf(b.hours, 2)} hr · ${b.unit}`}
              body={[b.costCode, b.costCodeName].filter(Boolean).join(" — ")}
              note={[b.workOrder, b.note].filter(Boolean).join(" · ")}
              tone={C.line} />
          ))}
      </Group>

      <div className="flex flex-wrap justify-end" style={{ gap: 8, marginTop: 6 }}>
        {go && (
          <Btn tone="ghost" onClick={() => { onClose(); go("work", "orders"); }}>
            WORK ORDERS
          </Btn>
        )}
        <Btn onClick={onClose}>CLOSE</Btn>
      </div>
    </Modal>
  );
}

function Group({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.09em",
                    textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ head, body, note, tone, tag }) {
  return (
    <div style={{ borderLeft: `3px solid ${tone}`, background: C.paper,
                  borderRadius: 4, padding: "8px 11px", marginBottom: 5 }}>
      <div className="flex flex-wrap items-baseline" style={{ gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{head}</span>
        {tag && (
          <span style={{ fontFamily: FD, fontSize: 11, letterSpacing: "0.05em",
                         textTransform: "uppercase", color: tone === C.line ? C.muted : tone,
                         fontWeight: 700 }}>
            {tag}
          </span>
        )}
      </div>
      {body && <div style={{ fontSize: 13, marginTop: 1 }}>{body}</div>}
      {note && <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{note}</div>}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5,
                  padding: "4px 0 2px", maxWidth: 560 }}>
      {children}
    </div>
  );
}
