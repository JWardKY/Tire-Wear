/* ── Driving time on a timecard ───────────────────────────────────
   A mechanic's day is not all spent in the shop. Trucks get shuttled
   between Clays Ferry and Clover Bottom, somebody runs to a dealer for
   a part, somebody drives out to a quarry for a road call. That time
   was being booked against whatever job was nearest to hand, or not
   booked at all.

   A driving line is an ORDINARY time entry with "Driving" in its work
   types. That is the whole design, and it is worth saying why: the
   card total, the approval, the payroll export, the work log and the
   supervisor's hours board all already read time entries. Making
   driving a second kind of record would mean teaching every one of
   them about it, and the first one somebody forgot would be hours that
   never reached payroll.

   So the only thing a driving line has that no other line has is where
   it went, and that is two columns on the same table.

   What it insists on, and why:

   A driving line needs BOTH ends. "Drove 2 hours" is not a record of
   anything — it cannot be checked against a truck's miles, it cannot
   be charged to the right job with any confidence, and in a year
   nobody will know what it was. Both ends and it is a trip somebody
   can follow.

   And it needs the same cost code every other line needs, because
   driving a truck to a quarry is chargeable to that quarry, and
   driving one to the dealer is shop overhead. The app does not guess
   which.

   Nothing here touches the database. */

export const DRIVING = "Driving";

export const isDriving = (e) =>
  (e?.workTypes || e?.work_types || []).some(
    (t) => String(t).trim().toLowerCase() === DRIVING.toLowerCase());

const clean = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ");

/* Pulls the driving lines out of a day. Separate from isDriving so the
   tab and the totals cannot drift apart. */
export const drivingOnly = (entries = []) => entries.filter(isDriving);
export const notDriving = (entries = []) => entries.filter((e) => !isDriving(e));

export const drivenHours = (entries = []) =>
  drivingOnly(entries).reduce((a, e) => a + (Number(e.hours) || 0), 0);

/* Why this line cannot be saved yet, or "". Said as a sentence about
   the trip rather than about a field, because the person reading it is
   holding a set of keys, not a form. */
export function whyNotReady(f = {}) {
  if (!f.vehId && !clean(f.unitLabel)) return "Say which unit was driven";
  if (!clean(f.from)) return "Say where the trip started";
  if (!clean(f.to)) return "Say where it ended";
  if (!f.costCode) return "Choose what to charge the driving to";
  const h = Number(f.hours);
  if (f.hours === "" || f.hours == null || !Number.isFinite(h))
    return "Put the hours on it";
  if (h <= 0) return "Driving time has to be more than nothing";
  if (h > 24) return "That is more than twenty-four hours";
  return "";
}

export const ready = (f) => !whyNotReady(f);

/* The trip in one line, for the list and for anywhere a driving entry
   has to say what it was. An arrow rather than "from X to Y" because
   it is read at a glance in a table. */
export function sayTrip(e = {}) {
  const from = clean(e.droveFrom ?? e.drove_from);
  const to = clean(e.droveTo ?? e.drove_to);
  if (from && to) return `${from} → ${to}`;
  if (from) return `From ${from}`;
  if (to) return `To ${to}`;
  return "";
}

/* A there-and-back trip is two lines or one, and the shop decides
   which. This only says what the return leg would look like, so
   "and back" is one tap rather than typing the same two places in the
   other order. */
export function reverseOf(f = {}) {
  return { ...f, from: clean(f.to), to: clean(f.from) };
}

/* What addEntry wants. Driving is appended to whatever work types are
   already on the line rather than replacing them: a mechanic who drove
   a truck to the quarry AND fixed it there has one line with both, and
   the hours should only be counted once. */
export function entryFrom(f = {}, date) {
  const types = (f.workTypes || []).filter((t) => !isDriving({ workTypes: [t] }));
  return {
    date: f.date || date,
    vehId: f.vehId || "",
    unitLabel: f.vehId ? "" : clean(f.unitLabel),
    /* Its own value, not "road". Road already means an outside
       service call everywhere this fleet reads it — the Now board, the
       hours split, the payroll export — and filing driving under it
       would quietly inflate every one of those. */
    where: "driving",
    hours: Number(f.hours),
    costCode: f.costCode,
    workOrder: clean(f.workOrder) || null,
    note: clean(f.note) || null,
    workTypes: [...types, DRIVING],
    droveFrom: clean(f.from),
    droveTo: clean(f.to),
  };
}

/* Somewhere this fleet actually drives between, offered as a starting
   point so the two ends are a tap rather than typing. Anything can
   still be typed — a dealer, a quarry, a customer's yard. */
export const COMMON_PLACES = [
  "Clays Ferry Shop", "Clover Bottom Shop", "Winchester", "Richmond",
  "The yard", "A job site", "The dealer",
];
