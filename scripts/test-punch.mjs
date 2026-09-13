/* Correcting a punch — the arithmetic behind somebody's pay.
   ─────────────────────────────────────────────────────────────────
   A mechanic forgot to clock out on a Thursday. On Friday morning the
   board's CLOSE IT button stopped the clock at now(), which put
   twenty-six hours on his card. That is the bug this file exists for,
   and every rule below is one of the ways a typed correction goes
   wrong: midnight, a time that has not happened yet, a stop before a
   start, a lunch that eats the whole shift.

   Needs nothing: no database, no browser.
     node scripts/test-punch.mjs
*/
import { spawnSync } from "node:child_process";

/* Run in the shop's timezone, not the machine's.
   ─────────────────────────────────────────────────────────────────
   This is the whole subject. A punch is typed as a wall-clock time and
   stored as an instant, and which instant "17:00" means is exactly what
   the timezone decides. The container this runs in is UTC, where an
   Eastern bug reads as correct, so the process re-execs itself under
   America/New_York before asserting anything. */
if (!process.env.TZ) {
  const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], {
    stdio: "inherit", env: { ...process.env, TZ: "America/New_York" },
  });
  process.exit(r.status ?? 1);
}

import { hm, atOn, shiftTimes, shiftHours, HOURS_CAP } from "../src/shiftMath.js";

let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) console.log(`  ok   ${name}`);
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name, got, want) => ok(name, got === want, `got ${got}, wanted ${want}`);
const throws = (name, fn, match) => {
  try { fn(); ok(name, false, "it did not throw"); }
  catch (e) { ok(name, match.test(e.message), `said "${e.message}"`); }
};

/* Every test dates from a Thursday so "the shift ran into Friday" is a
   real sentence rather than an arithmetic accident. */
const THU = "2026-09-10";
const FRI = "2026-09-11";
/* Friday 09:00 Eastern, as the moment "now" is, for the future check. */
const FRI_9AM = atOn(FRI, "09:00").getTime();

console.log("\nA time typed is the time stored");

/* The round trip. If this is wrong, everything a supervisor types comes
   back as something else the next time the dialog is opened. */
const t = shiftTimes(THU, { start: "06:02", stop: "17:00" }, FRI_9AM);
eq("the start reads back as typed", hm(t.started_at), "06:02");
eq("the stop reads back as typed", hm(t.ended_at), "17:00");
eq("06:02 Eastern in September is 10:02Z", t.started_at, "2026-09-10T10:02:00.000Z");
eq("17:00 Eastern in September is 21:00Z", t.ended_at, "2026-09-10T21:00:00.000Z");

/* Eastern is not one offset. A punch either side of the change has to
   land on the hour that was typed, not an hour beside it. */
const win = shiftTimes("2026-01-15", { start: "06:00", stop: "17:00" },
  atOn("2026-01-16", "09:00").getTime());
eq("a January punch reads back as typed", hm(win.started_at), "06:00");
eq("…and is stamped on standard time", win.started_at, "2026-01-15T11:00:00.000Z");

console.log("\nThe missed punch-out");

/* The bug, stated. Thursday 06:02 closed at Friday's now() is 26.97
   hours; closed at the time he actually left it is a day's work. */
eq("closing Thursday's punch at Friday 09:00 would be 27 hours",
  Math.round((FRI_9AM - atOn(THU, "06:02").getTime()) / 36000) / 100, 26.97);
eq("closing it at 17:00 less a lunch is a day",
  shiftHours(atOn(THU, "06:02").toISOString(), THU, "17:00", 30), 10.47);

throws("a stop that has not happened yet is refused",
  () => shiftTimes(FRI, { start: "06:00", stop: "23:00" }, FRI_9AM),
  /has not happened yet/);
ok("…but a minute of clock drift is not",
  !!shiftTimes(FRI, { start: "06:00", stop: "09:00" }, FRI_9AM - 30000).ended_at);

console.log("\nMidnight");

/* A stop earlier than the start is the night shift, not a negative
   day. The database constraint would refuse the row outright, so
   getting this wrong is an error in somebody's face at 2am. */
const night = shiftTimes(THU, { start: "22:00", stop: "06:30" }, FRI_9AM);
ok("a stop before the start rolls into the next day",
  night.ended_at > night.started_at, `${night.started_at} → ${night.ended_at}`);
eq("…and the stop is Friday morning", night.ended_at, "2026-09-11T10:30:00.000Z");
eq("…which is eight and a half hours",
  shiftHours(night.started_at, THU, "06:30", 0), 8.5);

console.log("\nThe answers that are a typo");

/* The ordinary way this goes wrong: closing Thursday's 06:02 punch and
   typing 05:00 when 17:00 was meant. It rolls into Friday and books
   nearly twenty-three hours. */
throws("a rolled-over typo is refused",
  () => shiftTimes(THU, { start: "06:02", stop: "05:00" }, FRI_9AM),
  /hours on the clock/);

/* The check has to be reachable. Two times typed against one date can
   never be more than 24 hours apart, so a cap of 24 would read as
   protection and never fire once. */
ok("the cap can actually be reached", HOURS_CAP < 24, `it is ${HOURS_CAP}`);
let tripped = 0;
for (const stop of ["00:30", "01:00", "02:00", "03:00", "04:00", "05:00"]) {
  try { shiftTimes(THU, { start: "06:02", stop }, FRI_9AM); }
  catch { tripped++; }
}
eq("every rolled-over early-morning stop trips it", tripped, 6);

ok("a long but real day is allowed",
  !!shiftTimes(THU, { start: "05:00", stop: "21:00" }, FRI_9AM).ended_at);
ok("a genuine night shift is still allowed",
  !!shiftTimes(THU, { start: "22:00", stop: "06:30" }, FRI_9AM).ended_at);

console.log("\nOne end at a time");

/* A supervisor fixing only the clock-out must not blank the clock-in,
   and the other way round. */
const stopOnly = shiftTimes(THU, { stop: "17:00" }, FRI_9AM);
eq("a stop on its own has no start", stopOnly.started_at, null);
eq("…and still stores the stop", hm(stopOnly.ended_at), "17:00");
const startOnly = shiftTimes(THU, { start: "06:00" }, FRI_9AM);
eq("a start on its own has no stop", startOnly.ended_at, null);
eq("an empty time is nothing, not midnight",
  shiftTimes(THU, { start: "", stop: "" }, FRI_9AM).started_at, null);

console.log("\nHours on the clock");

const IN = atOn(THU, "06:00").toISOString();
eq("eight hours less a half-hour lunch", shiftHours(IN, THU, "14:30", 30), 8);
eq("no lunch is the whole thing", shiftHours(IN, THU, "14:30", 0), 8.5);
eq("a lunch longer than the shift is zero, not negative",
  shiftHours(IN, THU, "06:10", 60), 0);
eq("minutes round to two places", shiftHours(IN, THU, "14:35", 0), 8.58);
eq("nothing typed yet is nothing, not zero", shiftHours(IN, THU, "", 30), null);
eq("never clocked in is nothing", shiftHours(null, THU, "17:00", 30), null);

/* The screen shows this number and the database computes its own. If
   they disagree the dialog is promising a figure it will not store. */
const pgShiftHours = (a, b, lunch) =>
  Math.max(0, Math.round(((b - a) / 60000 - lunch) / 60 * 100) / 100);
let drift = 0, compared = 0;
for (const stop of ["06:30", "09:00", "14:30", "17:00", "21:15", "23:59"]) {
  for (const lunch of [0, 30, 60]) {
    const st = shiftTimes(THU, { start: "06:00", stop }, atOn(FRI, "23:59").getTime());
    const mine = shiftHours(IN, THU, stop, lunch);
    const theirs = pgShiftHours(new Date(st.started_at), new Date(st.ended_at), lunch);
    compared++;
    if (mine !== theirs) drift++;
  }
}
eq("every combination was actually compared", compared, 18);
eq("what the dialog shows is what the database will store", drift, 0);

console.log(failed ? `\n${failed} failed\n` : "\nAll good\n");
process.exit(failed ? 1 : 0);
