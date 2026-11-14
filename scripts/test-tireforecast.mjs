/* When tires will need replacing.
   ─────────────────────────────────────────────────────────────────
   Every case here came out of running the forecast on this fleet's
   real data and finding it wrong. A forecast that puts nearly-new
   tires on next month's purchase order costs money; one that misses a
   tire costs a truck. Both happened on the first draft.

     - A wear rate measured over a few hundred miles is the gap between
       the typed mount depth and the first gauge, not wear. The median
       rate climbs from 143 mi/32 under 1,000 miles to over 3,000 past
       5,000 — the tires are not changing, the offset is diluting.
     - DT-1810 has three tires mounted at 27, 26 and 21 that each lost
       exactly 9/32 by their first gauge. Three tires do not wear
       identically. No mileage filter catches that, because the rate
       rests entirely on the mount figure.
     - DT-870 "ran" 46,000 miles a month taken first-reading to
       last-reading. One low value in its history. Its daily readings
       say about 200 a day.
     - One tire size is recorded five different ways, so a purchase
       order keyed on the raw text scatters one order across five rows.

   Needs nothing: no database, no browser.
*/
import { paceOf, pacesByVehicle, rateOf, forecastTire, horizonOf, forecastFleet,
  normalizeSize, sizeOf, sayCoverage, sayMonths, dueDate,
  MIN_RATE_MILES, SUSPECT_RATE, MIN_PACE_DAYS, MAX_MILES_PER_DAY, HORIZONS,
  DAYS_PER_MONTH } from "../src/tireForecast.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`${v ? "  ok  " : "  !!  "}${l}${!v && got !== undefined
    ? ` — got ${JSON.stringify(got)}` : ""}`);
};

const TODAY = "2026-11-13";
/* A truck's odometer: one reading a day for `days`, `perDay` miles. */
const daily = (start, perDay, days, startDate = "2026-08-01") => {
  const t0 = Date.parse(startDate + "T00:00:00Z");
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(t0 + i * 86400000).toISOString().slice(0, 10),
    odo: start + i * perDay,
  }));
};

console.log("── how far a truck runs ──");
/* 200 a day, read daily for 100 days. */
const steady = daily(340000, 200, 100);
const p = paceOf(steady, { today: TODAY });
ok("a steady truck's pace is its miles per month",
  Math.abs(p.miPerMonth - 200 * DAYS_PER_MONTH) < 5, p);

/* DT-870: one low value in the middle of an honest series. Taken
   first-to-last, or min-to-max, it reads as a truck that drove tens of
   thousands of miles a month. */
const withDip = steady.map((r, i) => (i === 40 ? { ...r, odo: 243315 } : r));
const dipped = paceOf(withDip, { today: TODAY });
ok("one bad low reading does not invent tens of thousands of miles",
  dipped.miPerMonth < 7000, dipped.miPerMonth);
ok("…and lands back near the truck's real pace",
  Math.abs(dipped.miPerMonth - 200 * DAYS_PER_MONTH) < 600, dipped.miPerMonth);
ok("…and says how many steps it threw out", dipped.ignored >= 2, dipped.ignored);

/* A replaced odometer: it goes back to zero and counts up again. The
   step backwards is not negative driving, and the miles after it are
   real. */
const reset = [...daily(500000, 200, 40), ...daily(0, 200, 60, "2026-09-10")];
const r2 = paceOf(reset, { today: TODAY });
ok("an odometer replaced partway through is not negative driving",
  r2.miPerMonth > 4000 && r2.miPerMonth < 8000, r2.miPerMonth);

/* Faster than a truck can go is a bad reading, wherever it sits. */
const jump = steady.map((r, i) => (i >= 60 ? { ...r, odo: r.odo + 90000 } : r));
ok("a jump faster than a truck can drive is thrown out",
  paceOf(jump, { today: TODAY }).miPerMonth < 7000, paceOf(jump, { today: TODAY }));
/* A gap between readings is not a jump. Five days at 200 a day is
   1,000 miles in one step, which is under the per-DAY ceiling. */
const sparse = steady.filter((_, i) => i % 5 === 0);
ok("readings five days apart are not mistaken for a jump",
  paceOf(sparse, { today: TODAY }).ignored === 0, paceOf(sparse, { today: TODAY }));
ok(`${MAX_MILES_PER_DAY} a day is the ceiling`, MAX_MILES_PER_DAY >= 600 && MAX_MILES_PER_DAY <= 2000);

ok("one reading is not a pace", paceOf([{ date: "2026-11-01", odo: 1 }], { today: TODAY }).miPerMonth === null);
ok(`under ${MIN_PACE_DAYS} days is not a pace`,
  paceOf(daily(1000, 200, 10, "2026-11-01"), { today: TODAY }).miPerMonth === null,
  paceOf(daily(1000, 200, 10, "2026-11-01"), { today: TODAY }));
ok("…and says why", /days of mileage/.test(paceOf(daily(1000, 200, 10, "2026-11-01"), { today: TODAY }).why || ""));
ok("a parked truck reads nought, not 'unknown'",
  paceOf(daily(50000, 0, 60), { today: TODAY }).miPerMonth === 0);
/* Readings from before the window do not set today's pace: a truck
   moved to a quieter job in the spring is not forecast on its old
   route. */
const old = [...daily(1000, 600, 60, "2026-01-01"), ...daily(40000, 100, 90, "2026-08-10")];
ok("only recent mileage sets the pace",
  Math.abs(paceOf(old, { today: TODAY }).miPerMonth - 100 * DAYS_PER_MONTH) < 300,
  paceOf(old, { today: TODAY }).miPerMonth);

ok("every truck at once, keyed by number",
  pacesByVehicle([...steady.map((r) => ({ ...r, veh: "DT-870" })),
                  ...steady.map((r) => ({ ...r, veh: "DT-871" }))], { today: TODAY })["DT-871"]
    .miPerMonth > 0);

console.log("\n── what a wear rate rests on ──");
const mount = (odo, d) => ({ odo, d, mount: true });
const g = (odo, d) => ({ odo, d });
/* Two gauges far enough apart: the mount depth plays no part. */
const two = rateOf({ pts: [mount(0, 28), g(1000, 26), g(7000, 22)] });
ok("two gauges are measured gauge to gauge", two.basis === "gauged", two);
ok("…from the first gauge, not the mount", two.from === 26 && two.builtOn === 6000, two);
ok("…at 1,500 mi/32", two.rate === 1500, two.rate);
/* THE point. A wildly wrong mount depth must not move a gauged rate
   at all. */
ok("a wrong mount depth does not touch a gauged rate",
  rateOf({ pts: [mount(0, 40), g(1000, 26), g(7000, 22)] }).rate === 1500);

/* One gauge: the mount is the only other end. */
const one = rateOf({ pts: [mount(0, 28), g(6000, 24)] });
ok("one gauge is measured from the mount, and says so", one.basis === "mount" && one.rate === 1500, one);
/* Two gauges too close together fall back to the longer baseline
   rather than giving up a tire that has a usable rate. */
const close = rateOf({ pts: [mount(0, 28), g(5000, 25), g(5600, 24)] });
ok("two gauges too close together fall back to the mount",
  close.basis === "mount" && close.builtOn === 5600, close);
ok("a tire read once with no wear has no rate",
  rateOf({ pts: [mount(0, 28), g(3000, 28)] }).state === "no-rate");
ok("…and a mount with no gauge has none either", !rateOf({ pts: [mount(0, 28)] }).rate);
ok("the order the points arrive in does not matter",
  rateOf({ pts: [g(7000, 22), mount(0, 28), g(1000, 26)] }).rate === 1500);

console.log("\n── one tire ──");
const pace = { miPerMonth: 3000 };
const stats = (depth, pts, pull = 4) => ({ depth, pull, pts });

const fine = forecastTire(stats(22, [mount(0, 28), g(1000, 26), g(7000, 22)]), pace);
/* 18/32 above the pull point × 1,500 mi/32 = 27,000 mi ÷ 3,000/mo = 9. */
ok("a healthy tire gets a date", fine.state === "forecast" && fine.monthsLeft === 9, fine);
ok("…and the miles behind it", fine.milesLeft === 27000, fine.milesLeft);

ok("at the pull point is past it", forecastTire({ depth: 4, pull: 4, pts: [] }, pace).state === "past");
ok("…and so is below it, by how much",
  forecastTire({ depth: 3, pull: 4, pts: [] }, pace).over === 1);
/* Steer tires pull at 6, drives at 4. The pull point is per tire. */
ok("a steer at 5 is past a steer's limit",
  forecastTire({ depth: 5, pull: 6, pts: [] }, pace).state === "past");

/* Short distance: the mount offset dominates and the rate is noise. */
const young = forecastTire(stats(25, [mount(0, 28), g(800, 25)]), pace);
ok(`under ${MIN_RATE_MILES} mi is not trusted`, young.state === "unsettled", young);
ok("…and says how far it has run", /800 mi/.test(young.why), young.why);

/* DT-1810, exactly: mounted at 21, gauged once at 12, 3,174 miles on.
   353 mi/32 — a full tire gone in about 8,500 miles. */
const d1810 = forecastTire(stats(12, [mount(0, 21), g(3174, 12)]), pace);
ok("DT-1810's 4LO goes to the check list, not the order", d1810.state === "suspect", d1810);
ok("…naming the mount depth to check", /mount depth of 21/.test(d1810.why), d1810.why);
/* But two real gauges showing the same fast wear are believed: that
   is the tire, not the paperwork. */
const fastGauged = forecastTire(stats(12, [mount(0, 28), g(0, 21), g(3174, 12)]), pace);
ok("the same fast wear between two gauges IS believed",
  fastGauged.state === "forecast" && fastGauged.basis === "gauged", fastGauged);
ok(`${SUSPECT_RATE} mi/32 is the line`, SUSPECT_RATE > 200 && SUSPECT_RATE < 1000);

ok("no pace on the truck says so",
  forecastTire(stats(22, [mount(0, 28), g(6000, 24)]), {}).state === "no-pace");
ok("a parked truck says so",
  forecastTire(stats(22, [mount(0, 28), g(6000, 24)]), { miPerMonth: 0 }).state === "parked");

console.log("\n── which horizon ──");
ok("past is its own bucket", horizonOf({ state: "past" }) === "past");
ok("1.0 months is a one-month tire", horizonOf({ state: "forecast", monthsLeft: 1 }) === 1);
ok("1.1 is a three-month tire", horizonOf({ state: "forecast", monthsLeft: 1.1 }) === 3);
ok("12 is a twelve-month tire", horizonOf({ state: "forecast", monthsLeft: 12 }) === 12);
ok("past twelve is later", horizonOf({ state: "forecast", monthsLeft: 12.1 }) === "later");
ok("a tire that cannot be forecast has no horizon", horizonOf({ state: "no-rate" }) === null);
ok("the horizons asked for", HORIZONS.join() === "1,3,6,12", HORIZONS);

console.log("\n── one size, one spelling ──");
/* This fleet's real spellings of one tire. */
const SAME = ["425/65R22.5", "425/65 R22.5", "425/65r22.5", "425/65/r22.5", "425/65/22.5"];
ok("five spellings of 425/65R22.5 are one size",
  new Set(SAME.map(normalizeSize)).size === 1 && normalizeSize(SAME[4]) === "425/65R22.5",
  SAME.map(normalizeSize));
ok("…and four of 295/80R22.5",
  new Set(["295/80R22.5", "295/80 R22.5", "295/80r 22.5", "295/80/22.5"].map(normalizeSize)).size === 1);
ok("11r22.5 is 11R22.5", normalizeSize("11r22.5") === "11R22.5");
ok("11R24.5 is left alone", normalizeSize("11R24.5") === "11R24.5");
/* 22.55 is a typo. Guessing it means 22.5 would put a tire on an order
   that nobody typed; leaving it as written puts it in front of a
   person. */
ok("a typo is left as typed, not guessed at", normalizeSize("295/80/22.55") === "295/80/22.55");
ok("nothing recorded is said plainly", sizeOf({}) === "Size not recorded");
ok("…and the folded spelling is the purchasing key", sizeOf({ size: "425/65/r22.5" }) === "425/65R22.5");

console.log("\n── the fleet ──");
const T = (veh, pos, size, depth, pts, pull = 4) => ({
  tire: { veh, pos, size }, stats: { depth, pull, pts } });
const FLEET = [
  T("DT-892", "4LI", "11R24.5", 4, []),                                    // past
  T("DT-891", "3LI", "11R24.5", 6, [mount(0, 28), g(0, 10), g(4000, 6)]),  // gauged, ~0.7 mo
  T("DT-899", "4RI", "11r24.5", 9, [mount(0, 28), g(0, 15), g(6000, 9)]),  // ~1.7 mo
  /* 28 → 16 over 24,000 mi is 2,000 mi/32; 12/32 left × 2,000 ÷ 3,000 = 8 months. */
  T("DT-883", "3LO", "425/65 R22.5", 16, [mount(0, 28), g(24000, 16)]),    // mount, 8 mo
  T("DT-1810", "4LO", "11R24.5", 12, [mount(0, 21), g(3174, 12)]),          // suspect
  T("DT-1801", "1L", "11R22.5", 25, [mount(0, 28), g(600, 25)], 6),        // unsettled
  T("DT-1802", "2LO", "11R24.5", 27, [mount(0, 28)]),                      // no rate
];
const PACES = { "DT-892": pace, "DT-891": pace, "DT-899": pace, "DT-883": pace,
  "DT-1810": pace, "DT-1801": pace, "DT-1802": pace };
const R = forecastFleet(FLEET, PACES);

ok("one tire past the limit", R.past.length === 1 && R.past[0].tire.veh === "DT-892");
ok("three with a date", R.due.length === 3, R.due.map((d) => d.tire.veh));
ok("…soonest first", R.due[0].tire.veh === "DT-891", R.due.map((d) => d.tire.veh));
ok("DT-1810 is held back for checking", R.check.length === 1 && R.check[0].tire.veh === "DT-1810");
/* The point of the check list: a suspect tire is not on the order. */
ok("…and is not counted toward any purchase",
  !R.due.some((d) => d.tire.veh === "DT-1810")
  && R.bands[R.bands.length - 1].byThen === 4, R.bands.map((b) => b.byThen));
ok("the ones that cannot be forecast are kept, with their reason",
  R.unknown.unsettled.length === 1 && R.unknown["no-rate"].length === 1, R.unknown);

/* Running totals INCLUDE the tire already past the limit: it is still
   a tire to buy by the end of the month. */
ok("by one month: the past tire plus the one due", R.bands[0].byThen === 2, R.bands[0]);
ok("…by three: one more", R.bands[1].byThen === 3, R.bands[1]);
ok("…and the running totals never go down",
  R.bands.every((b, i) => i === 0 || b.byThen >= R.bands[i - 1].byThen));

ok("sizes are counted under one spelling",
  R.bySize.find((s) => s.size === "11R24.5")?.byThen[12] === 3,
  R.bySize.map((s) => `${s.size}:${s.byThen[12]}`));
ok("…including the one spelled 11r24.5",
  !R.bySize.some((s) => s.size === "11r24.5"));
ok("…and 425/65 R22.5 is filed properly",
  R.bySize.find((s) => s.size === "425/65R22.5")?.byThen[12] === 1);

console.log("\n── saying it ──");
ok("coverage says what it leaves out", /Covers 4 of 7/.test(sayCoverage(R.covered)), sayCoverage(R.covered));
/* More than half the real fleet cannot be forecast yet. A total with
   no word about that reads as the whole bill. */
ok("…and calls the totals a floor", /floor/.test(sayCoverage(R.covered)));
ok("…counting the held-back tire among what is left out",
  /other 3/.test(sayCoverage(R.covered)), sayCoverage(R.covered));
ok("a fleet fully covered says so", /all 2/.test(sayCoverage({ total: 2, forecast: 2, unknown: 0 })));
ok("under a month reads in weeks", /wk/.test(sayMonths(0.5)), sayMonths(0.5));
ok("…never 'nought weeks'", sayMonths(0.01) === "1 wk", sayMonths(0.01));
ok("past reads as now", sayMonths(0) === "now");
ok("months read to one place", sayMonths(8.24) === "8.2 mo");
ok("a due date is today plus the months",
  dueDate(1, new Date("2026-11-13T00:00:00Z")) === "2026-12-13", dueDate(1, new Date("2026-11-13T00:00:00Z")));

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
