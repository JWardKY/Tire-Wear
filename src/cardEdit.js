/* ── A supervisor changing somebody else's hours ──────────────────
   The Timecards board has always shown the gap — hours on the clock
   less hours booked to a unit and a cost code — and until now a
   supervisor could only fix the clock half of it. The punches were
   editable; the booked lines were a read-only table with one lever
   under it, "delete this card".

   So Joshua's 4.60 on the clock against 1.23 booked had no fix in the
   app at all. Three and a bit hours he was paid for that no job was
   carrying, and the only routes were to go and find him, or throw his
   whole day away and start again. Across fifty cards that came to
   +17.36 hours nobody could charge out.

   These are the rules for the other half. Nothing here touches the
   database: it is what makes a line writable, what the work log says
   about it afterwards, and what the gap becomes — so the arithmetic a
   supervisor is trusting can be tested without one.

   Two things this module insists on, because they are the difference
   between a correction and a quiet rewrite of somebody's pay:

     1. Every change carries the name of the person who made it. Not
        the badge on the tablet — the supervisor who is PIN'd in.
     2. Taking hours OFF a card needs a reason in words. Adding and
        correcting do not; a supervisor fixing a typo will not write an
        essay about it and should not have to. Removal is the one that
        cannot be seen afterwards by reading the card, so it is the one
        that has to be readable in the log. */

export const MAX_HOURS = 24;
export const MIN_REASON = 4;

const num = (x) => {
  if (x == null || x === "" || typeof x === "boolean") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const n2 = (v) => {
  const n = num(v);
  return n == null ? "—" : n.toFixed(2);
};

const clean = (s) => String(s ?? "").trim();

/* What a line is against. A truck has a number; everything else — a
   parts run, a safety meeting, shop cleanup — carries the words
   somebody typed instead. */
export const unitOf = (l = {}) => clean(l.unit) || clean(l.unitLabel) || "—";

/* ── What stops a line being written ──────────────────────────────
   Each of these is also a constraint in the database, which is the
   point: the database refuses the row either way, and a supervisor who
   gets "new row violates check constraint tw_time_entries_hours_check"
   learns nothing. Said in a sentence here, before the write. */
export function whyNotSaveable(line = {}) {
  if (!clean(line.costCode)) return "every line needs a cost code";
  const hours = num(line.hours);
  if (hours == null || hours <= 0) return "hours have to be more than nought";
  if (hours > MAX_HOURS) return `${MAX_HOURS} hours is the most one line can carry`;
  if (!clean(line.vehId) && !clean(line.unitLabel)) {
    return "a line needs a unit, or something to call it instead";
  }
  if (!clean(line.date)) return "a line needs a date";
  return "";
}

/* Hours coming OFF somebody's card. The reason goes in the log and is
   the only record left once the row is gone. */
export function whyNotRemovable(reason) {
  return clean(reason).length < MIN_REASON
    ? "taking hours off somebody's card needs a reason"
    : "";
}

/* Nobody anonymous. The badge in localStorage is whoever last typed an
   email into this browser; a shop tablet carries one badge and the
   whole building uses it. A pay record needs the person, and the
   person is whoever put a PIN in. */
export function whyNotAllowed(actor) {
  return clean(actor) ? "" : "hours can only be changed by a named person";
}

/* ── What the log says ────────────────────────────────────────────
   Written so it reads on its own, months later, to somebody who was
   not there: whose card, what moved, and from what to what. */
export function sayLine(l = {}) {
  const wo = clean(l.workOrder);
  return `${n2(l.hours)} hr on ${unitOf(l)} to ${clean(l.costCode) || "no code"}`
    + (wo ? ` (${wo})` : "");
}

export function sayAdded(mechanic, line = {}) {
  return `${clean(mechanic) || "A mechanic"}'s ${clean(line.date)} card — `
    + `${sayLine(line)} added`;
}

export function sayRemoved(mechanic, line = {}, reason) {
  return `${clean(mechanic) || "A mechanic"}'s ${clean(line.date)} card — `
    + `${sayLine(line)} removed — ${clean(reason)}`;
}

/* Only what actually moved. An edit that lists every field makes the
   one that changed impossible to find, and an edit that lists none is
   not a record of anything. */
export const FIELDS = [
  ["hours", "hours", n2],
  ["costCode", "cost code", clean],
  ["unit", "unit", unitOf],
  ["workOrder", "work order", clean],
  ["where", "where", clean],
  ["date", "date", clean],
  ["note", "note", clean],
];

export function changesBetween(before = {}, after = {}) {
  const out = [];
  for (const [key, label, show] of FIELDS) {
    /* The unit is two fields wearing one hat — a truck id or a typed
       label — so it is compared as what it reads, not as what it is
       stored in. */
    const was = key === "unit" ? show(before) : show(before[key]);
    const now = key === "unit" ? show(after) : show(after[key]);
    if (was !== now) out.push({ field: key, label, was, now });
  }
  return out;
}

export function sayEdited(mechanic, before = {}, after = {}) {
  const diff = changesBetween(before, after);
  const who = clean(mechanic) || "A mechanic";
  const when = clean(after.date) || clean(before.date);
  if (!diff.length) return `${who}'s ${when} card — ${sayLine(after)} saved unchanged`;
  return `${who}'s ${when} card — ${unitOf(after)}: `
    + diff.map((d) => `${d.label} ${d.was || "—"} → ${d.now || "—"}`).join(", ");
}

/* ── The gap, recomputed on screen ────────────────────────────────
   The board's figure comes from a view and only moves when the day is
   re-read. A supervisor working a card down to zero needs to watch it
   fall as they go, so the dialog does the same arithmetic over the
   lines it is holding. Same subtraction, same rounding: a dialog that
   disagreed with the board by a hundredth would be worse than one that
   did not show it at all. */
export function bookedOf(entries = []) {
  const total = entries.reduce((a, e) => a + (num(e.hours) || 0), 0);
  return Math.round(total * 100) / 100;
}

export function gapOf(clockHours, entries = []) {
  const clocked = num(clockHours) || 0;
  return Math.round((clocked - bookedOf(entries)) * 100) / 100;
}

/* What the gap MEANS, which is not the same question as what it is.
   Positive is paid time no job is carrying; negative is a mechanic who
   has booked more than he was clocked for, which is its own problem
   and must not be described as the first one. Under a hundredth is
   nothing — it is the rounding on a real-time clock, not a gap. */
export const SETTLED = 0.01;

export function sayGap(gap) {
  const g = num(gap) || 0;
  if (Math.abs(g) < SETTLED) return "The clock and the card agree.";
  return g > 0
    ? `${n2(g)} hr on the clock is not booked to anything yet.`
    : `${n2(Math.abs(g))} hr more is booked than was clocked.`;
}
