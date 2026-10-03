/* ── Driving time on a timecard ───────────────────────────────────
   A mechanic's day is not all spent in the shop. Trucks get shuttled
   between Clays Ferry and Clover Bottom, somebody runs to the dealer
   for a part, somebody drives out to a quarry for a road call.

   The first version of this asked for eight things before it would
   take a trip — both ends, a work order, a note. Jason's answer was
   that it asks way too much: pick the truck, start, stop. He is right,
   and the thing it should have been copying was already in the app.
   The equipment card has a clock on it, so this has the same one.

   A driving line is still an ORDINARY time entry with "Driving" on it.
   The card total, the approval, the payroll export and the hours board
   all read time entries already, so none of them has to learn this tab
   exists.

   Two things it will not do without:

   WHICH TRUCK. Without it the hours are on nobody's machine and charge
   to nothing — and tw_time_entries will not take a row with no home.

   AND A COST CODE, which is NOT NULL in the database and is what
   payroll charges against. That one is never asked for: it is filled
   in from what the mechanic has already charged today, and sits on the
   saved line where it can be changed. A clock is not something to put
   a form in front of.

   Nothing here touches the database. */

/* The clock itself lives in jobClock.js: the equipment card, this and
   the tread walk-around all run the same one, because three clocks
   that drift apart are three different answers to "how long did that
   take". Re-exported so callers of this module get the whole of what
   a driving line needs from one import. */
import { liveSeconds, realHours } from "./jobClock.js";

export { hms, liveSeconds, realHours, sayLong, SHORTEST, suggestCode, toggle, EMPTY }
  from "./jobClock.js";

export const DRIVING = "Driving";

export const isDriving = (e) =>
  (e?.workTypes || e?.work_types || []).some(
    (t) => String(t).trim().toLowerCase() === DRIVING.toLowerCase());

const clean = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ");

export const drivingOnly = (entries = []) => entries.filter(isDriving);
export const notDriving = (entries = []) => entries.filter((e) => !isDriving(e));

export const drivenHours = (entries = []) =>
  drivingOnly(entries).reduce((a, e) => a + (Number(e.hours) || 0), 0);

/* Why this trip cannot go on the card yet, or "". Two things, and one
   of them is filled in for them. */
export function whyNotReady(d = {}) {
  if (!d.vehId) return "Pick the truck first";
  if (liveSeconds(d, d.now ?? Date.now()) <= 0) return "Start the clock";
  if (d.runningAt) return "Stop the clock and it goes on your card";
  if (!d.costCode) return "No cost code to charge it to";
  return "";
}

export const ready = (d) => !whyNotReady(d);

/* What addEntry wants. Driving is appended to whatever work types are
   already there rather than replacing them. */
export function entryFrom(d = {}, date) {
  const types = (d.workTypes || []).filter((t) => !isDriving({ workTypes: [t] }));
  return {
    date: d.date || date,
    vehId: d.vehId || "",
    unitLabel: d.vehId ? "" : clean(d.unitLabel),
    /* Its own value, not "road". Road already means an outside service
       call everywhere this fleet reads it — the Now board, the hours
       split, the payroll export — and filing driving under it would
       quietly inflate every one of those. */
    where: "driving",
    hours: realHours(liveSeconds(d, d.stoppedAt ?? Date.now())),
    costCode: d.costCode,
    note: clean(d.note) || null,
    workTypes: [...types, DRIVING],
    unitSeconds: Math.round(liveSeconds(d, d.stoppedAt ?? Date.now())),
    stints: d.stints || [],
  };
}
