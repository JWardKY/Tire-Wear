import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { C, FD, FM } from "./theme.js";
import { nf, Btn, Field, SectionLabel, inp, linkBtn } from "./ui.jsx";
import * as time from "./timeData.js";

/* ── Equipment worked ─────────────────────────────────────────────
   A mechanic's day, one unit at a time. This is the shape the shop
   asked for: pick the truck, run a clock on it, say what kind of work
   it was and what you found, and pull the parts against it.

   Two things here are not decoration.

   The sub-clock is per unit and it keeps its stints. A mechanic starts
   on a truck, gets pulled to a road call, comes back. One elapsed
   number would lie about that; the stints say when the time actually
   happened, and the hours field is what gets charged. The clock fills
   the hours in, and a mechanic can type over them — same rule as the
   shift card, for the same reason.

   The parts pulled here are issued against the time entry, not just
   the truck. That is what makes "what did this job cost" answerable
   later: the labour and the parts share an id. */

const WHERE = [
  ["shop", "In the shop"],
  ["road", "Outside service call"],
];

/* Not every hour is against a truck. Sweeping the bay, a parts run, an
   hour waiting on a gearbox — that is real time somebody has to pay for,
   and it used to be pushed off to the Add hours dialog, which meant the
   clock and the parts list were not available for it. It belongs on the
   same card.

   The six are Jason's, from the indirect group in his mockup. They say
   what the person was doing; the cost code says what it charges to, and
   the two are not the same question. "Swept the shop" charges to the
   shop's own code, picked for the mechanic by the shop they name below;
   the 9xx Plant codes are the asphalt plant, not this building. */
const SHOP_WORK = [
  "Shop cleanup / housekeeping",
  "Parts run / pickup",
  "Yard & equipment moves",
  "Waiting on parts",
  "Safety meeting / training",
  "Other shop time",
];

/* The shops are the cost codes filed under Shop. They used to be a
   hardcoded list of three names, which meant an hour of shop time still
   had to be charged to a piece of equipment's code — in practice one of
   the 9xx Plant codes, which are the asphalt plant, not this building.
   Now picking the shop IS charging the time to it, and adding a fourth
   shop is a row in Setup rather than a deploy. */
const shopsFrom = (codes) => codes.filter((c) => c.group === "Shop");

/* The shop a mechanic picked last, so the second card of the day does
   not ask again. Per browser, which is per person in practice. Stored as
   the code, not the name: a name can be corrected in Setup, and a stale
   one here would silently stop matching. */
const LAST_SHOP = "tirewear:lastshop";
const lastShop = () => {
  try { return localStorage.getItem(LAST_SHOP) || ""; } catch { return ""; }
};

const blank = () => ({
  key: Math.random().toString(36).slice(2),
  vehId: "",
  /* Set instead of vehId when the hour is shop time rather than a unit.
     Exactly one of the two is ever filled in. */
  shopWork: "",
  shop: "",
  /* The Shop cost code behind that name, so switching back to a unit
     knows which charge it put there and can take it away again. */
  shopCode: "",
  where: "shop",
  hours: "",
  hoursTyped: false,
  costCode: "",
  workOrder: "",
  jobLocation: "",
  workTypes: [],
  workPerformed: "",
  parts: [],
  seconds: 0,
  stints: [],
  runningAt: null,
});

const hms = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/* Quarter hours, because that is the unit payroll charges in. */
const toQuarters = (sec) => Math.round((sec / 3600) * 4) / 4;

const liveSeconds = (c, now) =>
  c.seconds + (c.runningAt ? Math.max(0, (now - new Date(c.runningAt).getTime()) / 1000) : 0);

/* A phone discards a backgrounded tab whenever it feels like it, and a
   mechanic who starts a clock on a truck and puts the phone in their
   pocket is the ordinary case, not the edge one. Until Save is pressed
   the card lives only in React state, so that eviction used to take the
   running clock and everything typed with it — silently, with nothing in
   the database to show for the morning.

   So the form is mirrored into localStorage on every change and read
   back on the way in. It is per mechanic and per day, so two people
   sharing a shop tablet cannot inherit each other's half-finished card.
   It is a draft, not a record: the database is still only written by
   Save. */
const draftKey = (mechanicId, date) => `tirewear:card:${mechanicId}:${date}`;

function readDraft(mechanicId, date) {
  try {
    const raw = localStorage.getItem(draftKey(mechanicId, date));
    if (!raw) return null;
    const cards = JSON.parse(raw);
    if (!Array.isArray(cards) || !cards.length) return null;
    /* Shape it back into something the form can hold, in case an older
       draft is missing a field a newer build expects. */
    return cards.map((c) => ({ ...blank(), ...c }));
  } catch {
    return null;   // private window, full disk, or a draft we cannot read
  }
}

export default function EquipmentWorked({ mechanic, date, vehicles, codes, parts, onSaved, onErr }) {
  const [cards, setCards] = useState(() => readDraft(mechanic.id, date) || [blank()]);
  const [restored, setRestored] = useState(
    () => !!readDraft(mechanic.id, date));
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  /* Swap drafts when the day or the person changes. The ref stops the
     mirror below from writing the outgoing card into the incoming key. */
  const loadedFor = useRef(draftKey(mechanic.id, date));
  useEffect(() => {
    const key = draftKey(mechanic.id, date);
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    const found = readDraft(mechanic.id, date);
    setCards(found || [blank()]);
    setRestored(!!found);
  }, [mechanic.id, date]);

  /* Mirror every change. An empty form clears the draft rather than
     leaving an empty one behind to be "restored" tomorrow. */
  useEffect(() => {
    const key = draftKey(mechanic.id, date);
    if (loadedFor.current !== key) return;
    try {
      const worth = cards.some((c) =>
        c.vehId || c.costCode || c.hours || c.workPerformed || c.workTypes.length
        || c.parts.length || c.seconds || c.runningAt || c.jobLocation);
      if (worth) localStorage.setItem(key, JSON.stringify(cards));
      else localStorage.removeItem(key);
    } catch { /* storage full or blocked — the form still works */ }
  }, [cards, mechanic.id, date]);

  const anyRunning = cards.some((c) => c.runningAt);
  useEffect(() => {
    if (!anyRunning) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyRunning]);

  /* A clock left running when the tab closes is a mechanic's pay, so
     warn before the browser throws it away. */
  useEffect(() => {
    if (!anyRunning) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyRunning]);

  const patch = useCallback((key, fields) => {
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, ...fields } : c)));
  }, []);

  const toggleClock = useCallback((key) => {
    setCards((cs) => cs.map((c) => {
      if (c.key !== key) return c;
      if (!c.runningAt) return { ...c, runningAt: new Date().toISOString() };
      const stop = new Date().toISOString();
      const secs = c.seconds
        + Math.max(0, (new Date(stop).getTime() - new Date(c.runningAt).getTime()) / 1000);
      const q = toQuarters(secs);
      return {
        ...c,
        runningAt: null,
        seconds: secs,
        stints: [...c.stints, { start: c.runningAt, stop }],
        hours: c.hoursTyped ? c.hours : (q > 0 ? String(q) : c.hours),
      };
    }));
  }, []);

  const shops = useMemo(() => shopsFrom(codes), [codes]);

  const codeGroups = useMemo(() => {
    const g = {};
    /* A code filed under nothing would head an optgroup with a blank
       label, which renders as an unnamed gap. Setup asks for a group, so
       this is only a backstop. */
    codes.forEach((c) => { (g[c.group || "Other"] ||= []).push(c); });
    return g;
  }, [codes]);

  /* A truck or a shop activity — one of the two, never neither. The
     database says the same thing in tw_time_needs_a_home. */
  const homed = (c) => !!c.vehId || (!!c.shopWork && !!c.shop);
  const ready = (c) => homed(c) && c.costCode
    && Number(c.hours) > 0 && Number(c.hours) <= 24;
  const filled = (c) =>
    c.vehId || c.shopWork || c.costCode || c.hours || c.workPerformed
      || c.workTypes.length || c.parts.length || c.seconds || c.runningAt
      || c.jobLocation;

  const live = cards.filter(filled);
  const canSave = live.length > 0 && live.every(ready) && !cards.some((c) => c.runningAt);

  /* A greyed-out button that will not say what is wrong is where a
     timecard goes to die: the mechanic assumes it saved, walks away, and
     the hours are simply gone. Name the first thing standing in the way. */
  const blocker = (() => {
    if (saving || canSave) return null;
    if (!live.length) return "Pick a unit or shop time to start.";
    if (cards.some((c) => c.runningAt))
      return "A clock is still running — press Stop, then save.";
    const bad = live.find((c) => !ready(c));
    if (!bad) return null;
    if (!homed(bad)) return "One card has no unit or shop on it yet.";
    if (!bad.costCode) return "Choose what to charge the time to.";
    if (!Number(bad.hours)) return "Put the hours on it — the clock fills them in when you stop.";
    if (Number(bad.hours) > 24) return "That is more than twenty-four hours.";
    return null;
  })();
  const totalHours = live.reduce((a, c) => a + (Number(c.hours) || 0), 0);

  const save = async () => {
    setSaving(true);
    const failed = [];
    let saved = 0;
    for (const c of live) {
      try {
        await time.saveCard({
          date,
          vehId: c.vehId || null,
          /* Payroll's Unit column is coalesce(vehicle number, unit_label),
             so shop time reads as what the person was doing and the shop
             itself rides in Job/location beside it. */
          unitLabel: c.shopWork
            || (vehicles.find((v) => v.id === c.vehId) || {}).num || null,
          where: c.where,
          jobLocation: c.shopWork
            ? (c.shop || null)
            : (c.jobLocation.trim() || null),
          hours: Number(c.hours),
          costCode: c.costCode,
          workOrder: c.workOrder.trim() || null,
          note: c.workPerformed.trim().slice(0, 200) || null,
          workTypes: c.workTypes,
          unitSeconds: Math.round(c.seconds),
          stints: c.stints,
          workPerformed: c.workPerformed.trim() || null,
          parts: c.parts.map((p) => ({ partId: p.partId, number: p.num, qty: p.qty })),
          who: mechanic.name,
        }, mechanic.id);
        saved += 1;
      } catch (e) {
        failed.push(e.message || String(e));
      }
    }
    setSaving(false);
    if (saved) {
      setCards([blank()]);
      setRestored(false);
      try { localStorage.removeItem(draftKey(mechanic.id, date)); } catch { /* fine */ }
    }
    if (failed.length) onErr?.(failed.join(" "));
    else onErr?.(null);
    await onSaved?.();
  };

  const clear = () => {
    if (!live.length) return;
    if (!window.confirm("Clear everything on this form? Nothing has been saved yet.")) return;
    setCards([blank()]);
    setRestored(false);
    try { localStorage.removeItem(draftKey(mechanic.id, date)); } catch { /* fine */ }
  };

  return (
    <div id="equipment-worked" style={{ marginBottom: 16 }}>
      <div className="flex flex-wrap items-baseline justify-between"
        style={{ gap: 8, marginBottom: 9 }}>
        <SectionLabel noMargin>Equipment worked</SectionLabel>
        <span style={{ fontSize: 12.5, color: C.muted }}>
          {live.length ? `${nf(totalHours, 2)} hr across ${live.length} unit${live.length === 1 ? "" : "s"}` : "Nothing on the form yet"}
        </span>
      </div>

      {restored && (
        <div className="flex flex-wrap items-center"
          style={{ gap: 10, background: C.card, border: `1px solid ${C.line}`,
            borderLeft: `4px solid ${C.watch}`, borderRadius: 8,
            padding: "10px 14px", marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
            Picked up where you left off. <strong>This is not saved yet</strong> —
            it is still only on this phone until you press Save timecard.
          </span>
          <button onClick={() => setRestored(false)}
            style={{ ...linkBtn, fontSize: 13, marginLeft: "auto" }}>
            Got it
          </button>
        </div>
      )}

      {cards.map((c, i) => (
        <UnitCard key={c.key} card={c} index={i} count={cards.length}
          now={now} vehicles={vehicles} codeGroups={codeGroups} shops={shops} parts={parts}
          onPatch={(f) => patch(c.key, f)}
          onClock={() => toggleClock(c.key)}
          onRemove={() => setCards((cs) => (cs.length === 1 ? [blank()] : cs.filter((x) => x.key !== c.key)))} />
      ))}

      <button onClick={() => setCards((cs) => [...cs, blank()])}
        className="no-print"
        style={{ ...linkBtn, fontFamily: FD, fontSize: 14, letterSpacing: "0.05em",
                 textTransform: "uppercase", textDecoration: "none",
                 border: `1px dashed ${C.line}`, borderRadius: 8, padding: "11px 16px",
                 width: "100%", background: C.card, marginTop: 4 }}>
        + Add another unit
      </button>

      <p style={{ fontSize: 12.5, color: C.muted, margin: "12px 0 0", lineHeight: 1.55 }}>
        Shop time, cleanup, a parts run, a safety meeting — pick it from the bottom
        of the equipment list. It runs the same clock and takes the same parts;
        it just asks which shop instead of where the work happened.
      </p>

      <div className="flex flex-wrap items-center justify-end no-print"
        style={{ gap: 8, marginTop: 12 }}>
        {blocker && (
          <span style={{ fontSize: 12.5, color: C.watch, fontWeight: 600, marginRight: "auto" }}>
            {blocker}
          </span>
        )}
        <Btn tone="ghost" onClick={clear} disabled={saving || !live.length}>Clear form</Btn>
        <Btn tone="ghost" onClick={() => window.print()}>Print</Btn>
        <Btn onClick={save} disabled={saving || !canSave}>
          {saving ? "Saving…" : "Save timecard"}
        </Btn>
      </div>
    </div>
  );
}

/* ── One unit ─────────────────────────────────────────────────── */

function UnitCard({ card: c, index, count, now, vehicles, codeGroups, shops, parts, onPatch, onClock, onRemove }) {
  const secs = liveSeconds(c, now);
  const running = !!c.runningAt;
  const isShop = !!c.shopWork;
  /* A draft written before the shop carried its code has only the name.
     Match it back up rather than showing the select on the wrong shop. */
  const shopValue = c.shopCode
    || (shops.find((x) => x.name === c.shop) || {}).code || "";

  const toggleType = (t) => onPatch({
    workTypes: c.workTypes.includes(t)
      ? c.workTypes.filter((x) => x !== t)
      : [...c.workTypes, t],
  });

  return (
    <div style={{ background: C.card, border: `1px solid ${running ? C.green700 : C.line}`,
                  borderRadius: 8, padding: "14px 16px 16px", marginBottom: 10 }}>
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 10 }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.1em",
                        textTransform: "uppercase", color: C.muted }}>
            {isShop ? "Time on this" : "Time on this unit"}
          </div>
          <div style={{ fontFamily: FM, fontSize: 26, fontWeight: 600, lineHeight: 1.1,
                        color: running ? C.green700 : C.green900 }}>
            {hms(secs)}
            <span style={{ fontFamily: FD, fontSize: 13, color: C.muted, fontWeight: 400,
                           marginLeft: 8, letterSpacing: "0.04em" }}>
              {c.stints.length + (running ? 1 : 0)} stint{c.stints.length + (running ? 1 : 0) === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 8 }}>
          <Btn tone={running ? "ghost" : "solid"} onClick={onClock}>
            {running ? "Stop" : "Start"}
          </Btn>
          {count > 1 && (
            <button onClick={onRemove} disabled={running}
              style={{ ...linkBtn, fontSize: 12.5, color: running ? C.muted : C.pull,
                       cursor: running ? "not-allowed" : "pointer" }}>
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Two rows rather than one five-across grid: the where-the-work
          -happened toggle needs room to set its two labels on one line. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                                           marginTop: 14 }}>
        <Field label={isShop ? "Shop time" : "Equipment"}>
          <select
            value={c.vehId || (c.shopWork ? `shop:${c.shopWork}` : "")}
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith("shop:")) {
                /* Shop time is indirect however it is spent — sweeping the
                   bay and driving for parts both belong in the same band
                   on "where the time went", so the toggle goes away and
                   the answer is fixed rather than left to be got wrong. */
                const want = c.shopCode || lastShop();
                const sh = shops.find((x) => x.code === want) || shops[0];
                onPatch({ vehId: "", shopWork: v.slice(5), where: "plant",
                          shopCode: sh ? sh.code : "",
                          shop: sh ? sh.name : "",
                          /* Picking the shop is what charges the hour. A
                             code already typed by hand is left alone. */
                          costCode: c.costCode || (sh ? sh.code : "") });
              } else {
                /* Coming back to a unit drops the shop's code with the
                   shop, or the hour would still be charged to the shop. */
                onPatch({ vehId: v, shopWork: "", shop: "", shopCode: "",
                          where: "shop",
                          costCode: c.costCode === c.shopCode ? "" : c.costCode });
              }
            }}
            style={inp}>
            <option value="">Pick the unit…</option>
            <optgroup label="Trucks and equipment">
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.num} — {v.make} {v.model}</option>
              ))}
            </optgroup>
            <optgroup label="Shop &amp; indirect time">
              {SHOP_WORK.map((w) => (
                <option key={w} value={`shop:${w}`}>{w}</option>
              ))}
            </optgroup>
          </select>
        </Field>

        {isShop ? (
          <Field label="Which shop">
            <select value={shopValue}
              onChange={(e) => {
                const sh = shops.find((x) => x.code === e.target.value);
                onPatch({ shopCode: e.target.value, shop: sh ? sh.name : "",
                          costCode: e.target.value });
                try { localStorage.setItem(LAST_SHOP, e.target.value); } catch { /* fine */ }
              }}
              style={{ ...inp, borderColor: c.shopCode ? C.line : C.pull }}>
              {!shops.length && <option value="">No shops set up yet</option>}
              {shops.map((sh) => <option key={sh.code} value={sh.code}>{sh.name}</option>)}
            </select>
            <div style={{ fontSize: 12, color: shops.length ? C.muted : C.pull, marginTop: 4 }}>
              {shops.length
                ? "The hours charge to this shop."
                : "A supervisor adds these under Cost codes, filed under Shop."}
            </div>
          </Field>
        ) : (
          <Field label="Where the work happened">
            <div className="flex" style={{ gap: 6 }}>
              {WHERE.map(([k, l]) => (
                <button key={k} onClick={() => onPatch({ where: k })}
                  style={{ flex: 1, fontFamily: FD, fontSize: 13, fontWeight: 600,
                           letterSpacing: "0.04em", textTransform: "uppercase",
                           padding: "8px 6px", borderRadius: 5, cursor: "pointer",
                           whiteSpace: "nowrap",
                           border: `1px solid ${c.where === k ? C.green700 : C.line}`,
                           background: c.where === k ? C.green700 : "#fff",
                           color: c.where === k ? "#fff" : C.muted }}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                                           marginTop: 12, alignItems: "start" }}>
        <Field label="Hours on this unit">
          <input type="number" step="0.25" min="0.25" max="24" value={c.hours}
            onChange={(e) => onPatch({ hours: e.target.value, hoursTyped: true })}
            placeholder={secs ? String(toQuarters(secs)) : "0.00"}
            style={{ ...inp, fontFamily: FM }} />
        </Field>

        <Field label="Charge the time to">
          <select value={c.costCode} onChange={(e) => onPatch({ costCode: e.target.value })}
            style={{ ...inp, borderColor: c.costCode ? C.line : C.pull }}>
            <option value="">Choose a cost code…</option>
            {Object.entries(codeGroups).map(([group, list]) => (
              <optgroup key={group} label={group}>
                {list.map((cc) => (
                  <option key={cc.code} value={cc.code}>{cc.code} — {cc.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {!c.costCode ? (
            <div style={{ fontSize: 12, color: C.pull, fontWeight: 600, marginTop: 4 }}>
              Payroll needs this to charge the hours out.
            </div>
          ) : isShop && c.costCode === shopValue ? (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              Set by the shop above. Change it if these hours belong elsewhere.
            </div>
          ) : null}
        </Field>

        <Field label="Work order">
          <input value={c.workOrder} onChange={(e) => onPatch({ workOrder: e.target.value })}
            placeholder="optional" style={{ ...inp, fontFamily: FM }} />
        </Field>

        {/* Payroll charges a road call against the job it was for, so the
            field only appears once the work is outside the shop. */}
        {!isShop && c.where === "road" && (
          <Field label="Job / location">
            <input value={c.jobLocation}
              onChange={(e) => onPatch({ jobLocation: e.target.value })}
              placeholder="Job number or where you went"
              style={inp} />
          </Field>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.09em",
                      textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>
          Type of work
        </div>
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          {time.WORK_TYPES.map((t) => {
            const on = c.workTypes.includes(t);
            return (
              <button key={t} onClick={() => toggleType(t)}
                style={{ fontFamily: FD, fontSize: 13, fontWeight: 600, letterSpacing: "0.04em",
                         textTransform: "uppercase", padding: "6px 12px", borderRadius: 999,
                         cursor: "pointer",
                         border: `1px solid ${on ? C.green700 : C.line}`,
                         background: on ? C.green700 : "#fff",
                         color: on ? "#fff" : C.muted }}>
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label="Work performed">
          <textarea value={c.workPerformed} rows={3}
            onChange={(e) => onPatch({ workPerformed: e.target.value })}
            placeholder="What you found and what you did"
            style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
        </Field>
      </div>

      <PartsPulled parts={parts} picked={c.parts}
        onChange={(next) => onPatch({ parts: next })} />
    </div>
  );
}

/* ── Parts pulled on this unit ────────────────────────────────── */

function PartsPulled({ parts, picked, onChange }) {
  const [q, setQ] = useState("");
  const box = useRef(null);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const taken = new Set(picked.map((p) => p.partId));
    return parts
      .filter((p) => !taken.has(p.id)
        && (p.num.toLowerCase().includes(s) || p.name.toLowerCase().includes(s)))
      .slice(0, 8);
  }, [q, parts, picked]);

  /* Typing the same number twice adds to the line that is already
     there rather than making a second one — Jason's rule, and the
     database has a unique index saying the same thing. */
  const put = (line) => {
    const key = line.num.trim().toLowerCase();
    const at = picked.findIndex((x) => x.num.trim().toLowerCase() === key);
    if (at >= 0) {
      const next = picked.slice();
      next[at] = {
        ...next[at],
        qty: Math.round((next[at].qty + line.qty) * 100) / 100,
        partId: next[at].partId || line.partId,
        name: next[at].name || line.name,
      };
      onChange(next);
    } else {
      onChange([...picked, line]);
    }
    setQ("");
    box.current?.focus();
  };

  const add = (p) =>
    put({ partId: p.id, num: p.num, name: p.name, uom: p.uom, qty: 1 });

  /* Offered whenever there are two characters and no catalog row is an
     exact match for them — a near match is still worth typing past. */
  const typed = q.trim();
  const canType = typed.length >= 2
    && !parts.some((p) => p.num.toLowerCase() === typed.toLowerCase());

  /* A part nobody has put in the catalog is still a part that came off
     the shelf. It is recorded as typed and moves no stock, which is
     better than a mechanic having nowhere to write it down. */
  const addTyped = () => {
    const num = q.trim();
    if (!num) return;
    put({ partId: null, num, name: "", uom: "", qty: 1 });
  };

  const setQty = (partId, qty) =>
    onChange(picked.map((p) => (p.partId === partId ? { ...p, qty } : p)));

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.lineSoft}` }}>
      <div style={{ fontFamily: FD, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.09em",
                    textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>
        Parts used
      </div>

      {picked.length === 0 ? (
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Nothing pulled yet.</div>
      ) : (
        <div style={{ marginBottom: 8 }}>
          {picked.map((p) => (
            <div key={p.partId} className="flex flex-wrap items-center"
              style={{ gap: 8, padding: "6px 0", borderTop: `1px solid ${C.lineSoft}` }}>
              <span style={{ fontFamily: FM, fontSize: 13, fontWeight: 600 }}>{p.num}</span>
              <span style={{ fontSize: 13, color: C.muted, flex: 1, minWidth: 120 }}>
                {p.name}
                {!p.partId && (
                  <span style={{ fontFamily: FD, fontSize: 11, letterSpacing: "0.06em",
                                 textTransform: "uppercase", color: C.watch,
                                 marginLeft: p.name ? 8 : 0 }}>
                    typed — no stock
                  </span>
                )}
              </span>
              <input type="number" min="1" step="1" value={p.qty}
                onChange={(e) => setQty(p.partId, Math.max(1, Number(e.target.value) || 1))}
                style={{ ...inp, fontFamily: FM, width: 78 }} />
              <span style={{ fontSize: 12, color: C.muted, width: 34 }}>{p.uom}</span>
              <button onClick={() => onChange(picked.filter((x) => x.partId !== p.partId))}
                style={{ ...linkBtn, fontSize: 12.5, color: C.pull }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <input ref={box} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (hits.length) add(hits[0]);
            else if (canType) addTyped();
          }}
          placeholder="Part number or name…" style={inp} />
        {(hits.length > 0 || canType) && (
          <div style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%",
                        background: "#fff", border: `1px solid ${C.line}`, borderRadius: 5,
                        marginTop: 3, boxShadow: "0 10px 26px rgba(0,0,0,0.14)",
                        maxHeight: 260, overflowY: "auto" }}>
            {hits.map((p) => (
              <button key={p.id} onClick={() => add(p)}
                style={{ display: "block", width: "100%", textAlign: "left", border: "none",
                         background: "none", cursor: "pointer", padding: "8px 10px",
                         borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ fontFamily: FM, fontSize: 13, fontWeight: 600 }}>{p.num}</span>
                <span style={{ fontSize: 13, color: C.ink, marginLeft: 8 }}>{p.name}</span>
                <span style={{ fontSize: 12, color: p.onHand > 0 ? C.muted : C.pull, marginLeft: 8 }}>
                  {p.onHand > 0 ? `${nf(p.onHand)} on hand` : "none on hand"}
                </span>
              </button>
            ))}
            {canType && (
              <button onClick={addTyped}
                style={{ display: "block", width: "100%", textAlign: "left", border: "none",
                         background: hits.length ? C.paper : "none", cursor: "pointer",
                         padding: "8px 10px" }}>
                <span style={{ fontSize: 13, color: C.ink }}>
                  Use <b style={{ fontFamily: FM }}>{q.trim()}</b> as typed
                </span>
                <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>
                  not in the catalog — no stock moves
                </span>
              </button>
            )}
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
        Type at least two characters. {nf(parts.length)} parts in the catalog —
        anything not in it can still be typed in.
      </div>
    </div>
  );
}
