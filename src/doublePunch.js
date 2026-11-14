/* ── Two punches for one shift ────────────────────────────────────
   Joshua clocked in at 06:12 on 10/05 and out at 16:45. Somewhere in
   the next forty-three seconds a second punch appeared on the same
   day — 06:12 to 16:46, typed rather than clocked — and his card read
   20.11 hours on the clock against 10.04 booked.

   What happened next is the reason this module exists. The card
   looked like it had been entered twice, so all seven of his lines
   were removed one at a time with the reason "booked twice". They
   were not duplicates: HT-239's signal lights, DT-1806's pressure
   sensor, HT-1259's marker lights, HT-713's NoX sensors, DT-865's
   scan, DT-867's hub seal and DT-871's differential are seven
   different jobs, and they add up to 10.04 — exactly one shift. A
   day's work was deleted to fix a problem that was never in it.

   So the app has to say which half is doubled, and it has to say it
   on the punches where the fault actually is.

   Telling the two apart without asking: a punch somebody clocked has
   a row created at the moment it started, to the second. A punch
   typed in afterwards has a row created hours after the time it
   claims. That is the whole signal, and it is a fact about the data
   rather than a guess about the person.

   Nothing here touches the database. */

import { hm } from "./shiftMath.js";

const ms = (t) => {
  if (!t) return null;
  const n = new Date(t).getTime();
  return Number.isFinite(n) ? n : null;
};

/* How far a row's creation can sit from the time it claims to have
   started and still be a live punch. A clock-in writes the row as it
   happens; a minute covers a slow phone and a clock that is a little
   out, and nothing covers a punch typed at the end of the day. */
export const TYPED_AFTER = 60 * 1000;

export function wasTyped(sh = {}) {
  const made = ms(sh.createdAt), began = ms(sh.startedAt);
  if (made == null || began == null) return false;
  return made - began > TYPED_AFTER;
}

/* Seconds two shifts share. An open shift has no end yet, so it is
   measured to now — a second punch opened on top of a running one is
   the live version of this fault and must not read as no overlap. */
export function overlapSeconds(a = {}, b = {}, now = Date.now()) {
  const aIn = ms(a.startedAt), bIn = ms(b.startedAt);
  if (aIn == null || bIn == null) return 0;
  const aOut = ms(a.endedAt) ?? now;
  const bOut = ms(b.endedAt) ?? now;
  const from = Math.max(aIn, bIn), to = Math.min(aOut, bOut);
  return to > from ? Math.round((to - from) / 1000) : 0;
}

export const spanSeconds = (sh = {}, now = Date.now()) => {
  const inAt = ms(sh.startedAt);
  if (inAt == null) return 0;
  const outAt = ms(sh.endedAt) ?? now;
  return outAt > inAt ? Math.round((outAt - inAt) / 1000) : 0;
};

/* How much of the SHORTER shift the two have in common. Measured
   against the shorter one on purpose: a four-hour punch sitting
   wholly inside a ten-hour one is wholly doubled, and measuring it
   against the ten would call it a 40% overlap and let it through. */
export function overlapFraction(a, b, now = Date.now()) {
  const shortest = Math.min(spanSeconds(a, now), spanSeconds(b, now));
  if (!shortest) return 0;
  return overlapSeconds(a, b, now) / shortest;
}

/* Where "two punches for one shift" starts. Mechanics do legitimately
   clock out and back in — a morning in the shop and an evening road
   call are two punches on one day and must never be called a double.
   Those butt up against each other; a double lies on top of another.
   Four fifths is well clear of a few minutes of overlap from somebody
   punching back in before the first punch-out registered. */
export const DOUBLE_AT = 0.8;

export function isDouble(a, b, now = Date.now()) {
  return overlapFraction(a, b, now) >= DOUBLE_AT;
}

/* Every doubled pair on a day, worst overlap first. Each shift can
   appear in more than one pair — three punches for one shift is one
   mistake made twice, and hiding the third would send somebody back
   to this screen a second time. */
export function doublesIn(shifts = [], now = Date.now()) {
  const out = [];
  for (let i = 0; i < shifts.length; i += 1) {
    for (let j = i + 1; j < shifts.length; j += 1) {
      const [a, b] = [shifts[i], shifts[j]];
      if (isDouble(a, b, now)) {
        out.push({ a, b, fraction: overlapFraction(a, b, now),
                   seconds: overlapSeconds(a, b, now) });
      }
    }
  }
  return out.sort((x, y) => y.fraction - x.fraction);
}

/* Which of a doubled pair to take off, or null when the app has no
   business deciding.

   The typed one, when exactly one was typed: it is the one somebody
   added on top of a punch that was already there, which is how this
   fault is made. When both were clocked or both were typed there is
   no signal, and guessing would take an hour off somebody's pay on a
   coin toss — so it says nothing and the screen offers both. */
export function whichToDrop(pair = {}) {
  const { a, b } = pair;
  if (!a || !b) return null;
  const at = wasTyped(a), bt = wasTyped(b);
  if (at === bt) return null;
  return at ? a : b;
}

/* ── Saying it ────────────────────────────────────────────────── */

/* The app's own punch formatter, not a second one. The work log's
   shift_corrected lines already read "08:00–still on", and a banner
   about a punch that wrote the time differently from the log entry
   about the same punch is two answers to one question. */
export const sayShift = (sh = {}) =>
  `${hm(sh.startedAt) || "—"}–${sh.endedAt ? hm(sh.endedAt) : "still on"}`;

/* The sentence over the punches. It names both, says which is which,
   and — the part that was missing when a day's work got deleted —
   says plainly that the hours below are not the problem. */
export function sayDouble(pair = {}) {
  const { a, b } = pair;
  if (!a || !b) return "";
  const drop = whichToDrop(pair);
  const head = `Two punches on this day cover the same shift — `
    + `${sayShift(a)} and ${sayShift(b)}. `;
  return head + (drop
    ? `The ${sayShift(drop)} one was typed in rather than clocked, so it is `
      + `the double. Taking it off leaves the hours below alone.`
    : `Both were clocked, so the app will not pick for you — take off `
      + `whichever is wrong. The hours below are not affected either way.`);
}

/* What the clock reads once a doubled punch comes off, so the screen
   can show the figure before anybody commits to it. */
export function clockAfterDropping(shifts = [], dropId) {
  return Math.round(shifts.filter((s) => s.id !== dropId)
    .reduce((a, s) => a + (Number(s.clockHours) || 0), 0) * 100) / 100;
}
