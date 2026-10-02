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

export const DRIVING = "Driving";

export const isDriving = (e) =>
  (e?.workTypes || e?.work_types || []).some(
    (t) => String(t).trim().toLowerCase() === DRIVING.toLowerCase());

const clean = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ");

export const drivingOnly = (entries = []) => entries.filter(isDriving);
export const notDriving = (entries = []) => entries.filter((e) => !isDriving(e));

export const drivenHours = (entries = []) =>
  drivingOnly(entries).reduce((a, e) => a + (Number(e.hours) || 0), 0);

/* The clock, in the shape the equipment card already uses so the two
   behave the same way under a thumb. */
export const hms = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const liveSeconds = (d = {}, now = Date.now()) =>
  (Number(d.seconds) || 0)
  + (d.runningAt ? Math.max(0, (now - new Date(d.runningAt).getTime()) / 1000) : 0);

/* Quarter hours, because that is the unit payroll charges in — and a
   trip that happened is never nought: a ten-minute shuttle rounds to a
   quarter rather than to nothing, which the database would refuse
   anyway. */
export function quarters(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s === 0) return 0;
  return Math.max(0.25, Math.round((s / 3600) * 4) / 4);
}

/* The cost code nobody is asked for. What this mechanic has already
   charged to today is the best guess by a distance — a day is usually
   spent on one or two jobs — and a shop code is the honest fallback,
   because a truck being shuttled with nothing else booked is shop
   time. It lands on the saved line where it can be changed. */
export function suggestCode(codes = [], entries = []) {
  const live = entries.filter((e) => e.costCode);
  for (let i = live.length - 1; i >= 0; i -= 1) {
    const c = codes.find((x) => x.code === live[i].costCode);
    if (c) return c.code;
  }
  const shop = codes.find((c) => String(c.codeGroup || c.code_group || "").toLowerCase() === "shop");
  return (shop || codes[0] || {}).code || "";
}

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
    hours: quarters(liveSeconds(d, d.stoppedAt ?? Date.now())),
    costCode: d.costCode,
    note: clean(d.note) || null,
    workTypes: [...types, DRIVING],
    unitSeconds: Math.round(liveSeconds(d, d.stoppedAt ?? Date.now())),
    stints: d.stints || [],
  };
}
