/* Driving time on a timecard — the clock.
   ─────────────────────────────────────────────────────────────────
   The first version of this asked for eight things before it would
   take a trip: the unit, both ends, a cost code, the hours, a work
   order, a note. Jason's answer was that it asks way too much — pick
   the truck, start, stop — and he was right. The control it should
   have been copying was already in the app: the equipment card has a
   clock on it, so this has the same one.

   What survived the rewrite is the part that matters underneath: a
   driving line is an ORDINARY time entry with "Driving" on it, so the
   card total, the approval, the payroll export and the hours board all
   keep working without knowing this tab exists.

   Needs nothing: no database, no browser.
*/
import { DRIVING, isDriving, drivingOnly, notDriving, drivenHours,
  hms, liveSeconds, realHours, sayLong, suggestCode, whyNotReady, ready, entryFrom }
  from "../src/driveLine.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

const CODES = [
  { code: "880", name: "Transmission", codeGroup: "Vehicle" },
  { code: "SHOP-CF", name: "Clays Ferry Shop", codeGroup: "Shop" },
];

console.log("what counts as driving:");
ok("a line with Driving on it", isDriving({ workTypes: ["Driving"] }));
ok("…however it is cased", isDriving({ workTypes: [" driving "] }));
ok("read off a database row too", isDriving({ work_types: ["Driving"] }));
ok("a line with other work on it as well",
  isDriving({ workTypes: ["PM service", "Driving"] }));
ok("not a line without it", !isDriving({ workTypes: ["PM service"] }));
ok("nothing at all does not crash", !isDriving(null));

console.log("\npulling a day apart:");
const day = [
  { id: "a", hours: 3, workTypes: ["Repair"] },
  { id: "b", hours: 1.5, workTypes: ["Driving"] },
  { id: "c", hours: 2, workTypes: ["Driving", "Repair"] },
];
ok("the driving lines", drivingOnly(day).map((e) => e.id).join() === "b,c");
ok("…and everything else", notDriving(day).map((e) => e.id).join() === "a");
/* The two halves have to add back up to the day, or the tab and the
   card total tell the mechanic different things. */
ok("and the two halves are the whole day",
  drivingOnly(day).length + notDriving(day).length === day.length);
ok("driving hours add up", drivenHours(day) === 3.5, drivenHours(day));
/* A line that was both driving and a repair counts its hours ONCE. */
ok("…counting a mixed line once, not twice", drivenHours([day[2]]) === 2);

console.log("\nthe clock:");
ok("nothing run is nought", hms(0) === "0:00:00");
ok("a minute", hms(60) === "0:01:00");
ok("an hour and a half", hms(5400) === "1:30:00");
ok("it does not go backwards", hms(-50) === "0:00:00");
const T0 = Date.parse("2026-10-02T13:00:00Z");
ok("a stopped clock is what it banked",
  liveSeconds({ seconds: 900, runningAt: null }, T0) === 900);
ok("a running one counts on from where it started",
  liveSeconds({ seconds: 900, runningAt: "2026-10-02T12:50:00Z" }, T0) === 1500);
/* A phone whose clock has drifted backwards must not eat banked time. */
ok("a clock that reads backwards never subtracts",
  liveSeconds({ seconds: 900, runningAt: "2026-10-02T13:10:00Z" }, T0) === 900);

console.log("\nhours — real time, not quarters:");
/* A ten-minute shuttle books ten minutes. It used to book fifteen. */
ok("ten minutes is ten minutes", realHours(600) === 0.17, realHours(600));
ok("…and not a quarter of an hour", realHours(600) !== 0.25);
ok("half an hour", realHours(1800) === 0.5);
ok("a mis-tap books nothing", realHours(4) === 0);
ok("a clock never started is nought", realHours(0) === 0);

console.log("\nthe cost code nobody is asked for:");
/* What they have already charged today is the best guess by a
   distance — a day is usually spent on one or two jobs. */
ok("what was charged last today",
  suggestCode(CODES, [{ costCode: "880" }]) === "880");
ok("…the most recent of several",
  suggestCode(CODES, [{ costCode: "SHOP-CF" }, { costCode: "880" }]) === "880");
/* A truck shuttled with nothing else booked is shop time. */
ok("a shop code when nothing has been charged yet",
  suggestCode(CODES, []) === "SHOP-CF", suggestCode(CODES, []));
ok("…and a code that no longer exists is skipped",
  suggestCode(CODES, [{ costCode: "GONE" }]) === "SHOP-CF");
ok("no codes at all does not crash", suggestCode([], []) === "");

console.log("\nwhat stops a trip going on the card:");
const trip = (over = {}) => ({ vehId: "v1", seconds: 1800, runningAt: null,
  costCode: "880", now: T0, ...over });
ok("a full one is ready", ready(trip()), whyNotReady(trip()));
/* Two things, and one of them is filled in for them. */
ok("the truck comes first", whyNotReady(trip({ vehId: "" })) === "Pick the truck first");
ok("then the clock", whyNotReady(trip({ seconds: 0 })) === "Start the clock");
ok("a clock still running is not a finished trip",
  /Stop the clock/.test(whyNotReady(trip({ runningAt: "2026-10-02T12:50:00Z" }))),
  whyNotReady(trip({ runningAt: "2026-10-02T12:50:00Z" })));
ok("and payroll needs somewhere to charge it",
  /cost code/.test(whyNotReady(trip({ costCode: "" }))), whyNotReady(trip({ costCode: "" })));

console.log("\nwhat gets written:");
const e = entryFrom({ vehId: "v1", seconds: 1800, runningAt: null, costCode: "880",
  stoppedAt: T0, stints: [{ start: "a", stop: "b" }] }, "2026-10-02");
ok("Driving is on it", e.workTypes.includes(DRIVING), e.workTypes);
/* The whole design in one assertion: an ordinary time entry, the same
   shape addEntry already writes. */
ok("it is an ordinary time entry",
  e.hours === 0.5 && e.costCode === "880" && e.date === "2026-10-02", e);
/* Five minutes on the road books five minutes. */
ok("…for the time actually driven",
  entryFrom({ vehId: "v1", seconds: 300, costCode: "880", stoppedAt: T0 }).hours === 0.08,
  entryFrom({ vehId: "v1", seconds: 300, costCode: "880", stoppedAt: T0 }).hours);
ok("…booked as driving, not as a road call", e.where === "driving", e.where);
ok("…and specifically not as a road call", e.where !== "road");
ok("the truck is on it", e.vehId === "v1" && !e.unitLabel, e);
ok("the seconds behind the hours are kept",
  e.unitSeconds === 1800, e.unitSeconds);
/* So a supervisor can see the clock was really run rather than a
   figure typed in. */
ok("…and so are the stints", e.stints.length === 1, e.stints);
/* A mechanic who drove a truck to the quarry AND fixed it there has
   one line with both, and the hours count once. */
ok("driving joins other work rather than replacing it",
  entryFrom({ vehId: "v1", seconds: 900, costCode: "880", workTypes: ["Repair"],
    stoppedAt: T0 }).workTypes.join() === "Repair,Driving");
ok("…and is not put on twice",
  entryFrom({ vehId: "v1", seconds: 900, costCode: "880", workTypes: ["driving"],
    stoppedAt: T0 }).workTypes.join() === "Driving");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
