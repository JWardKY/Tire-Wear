/* Turning a typed "HH:MM" into a punch, and refusing the ones that are
   obviously a slip of the finger.

   Its own module, with no database import, for the same reason
   payrollFormat.js and csvImport.js are: this is the arithmetic behind
   a figure on somebody's pay, and it should be testable without a
   browser, a key, or a network.

   ── On timezones ──────────────────────────────────────────────────
   A time is parsed WITHOUT a Z, deliberately. "17:00" on a shop tablet
   means five in the afternoon in Kentucky, and the tablets are set to
   Kentucky. The database stores the instant; this module is the one
   place that decides which instant a typed time means, so if the shop
   ever runs a second timezone there is one thing to change.

   Anything reading a stored punch back into a box goes through hm() for
   the same reason — it is the exact inverse, so a time typed and then
   read back is the time that was typed. */

export const hm = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const atOn = (dateISO, time) =>
  (time ? new Date(`${dateISO}T${time}:00`) : null);

/* The sanity check that keeps a missed punch-out from becoming most of
   a day on somebody's pay.

   Not 24. Because a stop earlier than the start rolls into the next day
   (see below), two times typed against one date can never be more than
   a day apart — a cap of 24 could never fire, which is a check that
   reads as protection and is not. The case it has to catch is real and
   ordinary: closing Thursday's 06:02 punch and typing 05:00 for 17:00
   rolls to Friday morning and books nearly twenty-three hours.

   Eighteen is generous for one continuous punch. A longer stretch than
   that is two punches with a break in between, which is how it wants to
   be recorded anyway. The dialog also shows the hours before they are
   saved, and says so in orange past fourteen — this is the backstop,
   not the warning. */
export const HOURS_CAP = 18;

/* A clock-out a minute or two ahead of the server is a rounding
   argument, not a lie. An hour ahead is somebody typing tomorrow. */
const FUTURE_GRACE_MS = 60000;

/* The two timestamps a punch would be stored as, or a sentence saying
   why it would not be. `nowMs` is a parameter so the future check can
   be tested without waiting. */
export function shiftTimes(dateISO, { start, stop }, nowMs = Date.now()) {
  const a = atOn(dateISO, start);
  let b = atOn(dateISO, stop);

  /* A stop before the start means the shift ran past midnight, so the
     stop belongs to the next day. Storing it as typed would give a
     negative shift, and the check constraint would refuse the row. */
  if (a && b && b < a) b = new Date(b.getTime() + 86400000);

  if (a && b) {
    const hours = (b - a) / 3600000;
    if (hours > HOURS_CAP)
      throw new Error(
        `That is ${hours.toFixed(1)} hours on the clock. Check the times — ` +
        `if the shift really ran into another day, enter it as two punches.`);
  }
  if (b && b.getTime() > nowMs + FUTURE_GRACE_MS)
    throw new Error("That clock-out time has not happened yet.");

  return {
    started_at: a ? a.toISOString() : null,
    ended_at: b ? b.toISOString() : null,
  };
}

/* What tw_shift_hours works out, in the browser, so a dialog can show
   the number before it is written rather than after. Same rule: minutes
   between the punches, less the lunch, never below zero.

   Kept in step with the function by hand. If one changes, change both —
   a dialog that promises 8.50 and stores 8.00 is worse than one that
   promises nothing. */
export function shiftHours(startedAt, dateISO, stopHM, lunch) {
  if (!startedAt || !stopHM) return null;
  const a = new Date(startedAt);
  let b = atOn(dateISO, stopHM);
  if (b < a) b = new Date(b.getTime() + 86400000);
  const mins = (b - a) / 60000 - (Number(lunch) || 0);
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}
