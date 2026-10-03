/* A clock on a job.
   ─────────────────────────────────────────────────────────────────
   Three screens run one. The equipment card has always had it;
   driving got it when the form it started as turned out to ask way
   too much; and the tread walk-around has it now, because gauging
   twelve wheels is work and it was the one job in this app that left
   no trace on anybody's hours.

   One implementation, because three clocks that drift apart are three
   different answers to "how long did that take" — and two of the
   three feed payroll.

   Needs nothing: no database, no browser.
*/
import { hms, liveSeconds, quarters, suggestCode, toggle, EMPTY, TIRES, treadEntry }
  from "../src/jobClock.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};
const T0 = Date.parse("2026-10-03T13:00:00Z");

console.log("the face of it:");
ok("nothing run is nought", hms(0) === "0:00:00");
ok("a minute", hms(60) === "0:01:00");
ok("an hour and a half", hms(5400) === "1:30:00");
ok("over ten hours it keeps counting", hms(36600) === "10:10:00", hms(36600));
ok("it never goes backwards", hms(-50) === "0:00:00");

console.log("\nwhat it reads:");
ok("a stopped clock is what it banked",
  liveSeconds({ seconds: 900, runningAt: null }, T0) === 900);
ok("a running one counts on from where it started",
  liveSeconds({ seconds: 900, runningAt: "2026-10-03T12:50:00Z" }, T0) === 1500);
/* A tablet whose clock has drifted or been put back must not eat time
   somebody has already worked. */
ok("a device clock that reads backwards never subtracts",
  liveSeconds({ seconds: 900, runningAt: "2026-10-03T13:10:00Z" }, T0) === 900);
ok("nothing at all is nought", liveSeconds({}, T0) === 0 && liveSeconds(undefined, T0) === 0);

console.log("\nstarting and stopping:");
const started = toggle(EMPTY, T0);
ok("starting sets it running", !!started.runningAt);
ok("…and banks nothing yet", started.seconds === 0 && started.stints.length === 0);
const stopped = toggle(started, T0 + 1800000);
ok("stopping banks the half hour", stopped.seconds === 1800, stopped.seconds);
ok("…and stops it", stopped.runningAt === null);
/* The stints are the record that a clock was really run, rather than
   a figure somebody typed in afterwards. */
ok("…and keeps the stint", stopped.stints.length === 1, stopped.stints);
const again = toggle(toggle(stopped, T0 + 1800000), T0 + 2700000);
ok("a second stint adds to the first", again.seconds === 2700, again.seconds);
ok("…and is kept separately", again.stints.length === 2, again.stints.length);
/* Pulled off the walk-around for a road call and back again: one
   elapsed figure, two stints, and the gap is not paid. */
ok("…so the gap between them is not counted",
  again.seconds === 2700 && again.stints.length === 2);
ok("the empty clock is not shared between screens",
  EMPTY.stints.length === 0 && toggle(EMPTY, T0) !== EMPTY);

console.log("\nhours, the way payroll charges them:");
ok("half an hour", quarters(1800) === 0.5);
ok("an hour and a quarter", quarters(4500) === 1.25);
ok("rounded to the nearest quarter", quarters(2000) === 0.5, quarters(2000));
/* A job that happened is never nought hours. The database refuses a
   row with nought on it anyway. */
ok("ten minutes is a quarter, not nothing", quarters(600) === 0.25);
ok("…and so is two minutes", quarters(120) === 0.25);
ok("but a clock never started is nought", quarters(0) === 0);
ok("…and junk is nought", quarters(null) === 0 && quarters("x") === 0);

console.log("\nthe cost code nobody is asked for:");
const CODES = [
  { code: "878", name: "Tire Group", codeGroup: "Vehicle" },
  { code: "SHOP-CF", name: "Clays Ferry Shop", codeGroup: "Shop" },
];
ok("what was charged last today", suggestCode(CODES, [{ costCode: "878" }]) === "878");
ok("…the most recent of several",
  suggestCode(CODES, [{ costCode: "SHOP-CF" }, { costCode: "878" }]) === "878");
ok("a shop code when nothing has been charged yet",
  suggestCode(CODES, []) === "SHOP-CF", suggestCode(CODES, []));
ok("…and a code that no longer exists is skipped",
  suggestCode(CODES, [{ costCode: "GONE" }]) === "SHOP-CF");
ok("no codes at all does not crash", suggestCode([], []) === "");
/* Every spelling of the group, because there are three in this app
   and checking two of them is how the Driving tab quietly charged a
   mechanic's first trip of the day to whatever code sorted first —
   873 Service on this fleet — rather than to a shop.

   listCostCodes maps code_group to `group`, which is the one the
   screens actually get. */
ok("the spelling the app's own loader produces",
  suggestCode([{ code: "873", name: "Service", group: "Vehicle" },
               { code: "S1", group: "Shop" }], []) === "S1",
  suggestCode([{ code: "873", group: "Vehicle" }, { code: "S1", group: "Shop" }], []));
ok("the database spelling",
  suggestCode([{ code: "873", code_group: "Vehicle" },
               { code: "S1", code_group: "Shop" }], []) === "S1");
ok("and the camel-cased one",
  suggestCode([{ code: "873", codeGroup: "Vehicle" },
               { code: "S1", codeGroup: "Shop" }], []) === "S1");
/* With no shop code anywhere, the first is the honest answer — but
   only then. */
ok("no shop code at all falls back to the first",
  suggestCode([{ code: "873", group: "Vehicle" }], []) === "873");

console.log("\nthe walk-around, as a line on a timecard:");
const e = treadEntry({ vehId: "v1", seconds: 2700, runningAt: null, costCode: "878",
  tires: 12, stints: [{ start: "a", stop: "b" }], stoppedAt: T0 }, "2026-10-03");
ok("it is an ordinary time entry",
  e.hours === 0.75 && e.costCode === "878" && e.date === "2026-10-03", e);
ok("…against the truck it was done on", e.vehId === "v1", e);
ok("…marked as tire work", e.workTypes.join() === TIRES, e.workTypes);
ok("…in the shop", e.where === "shop", e.where);
/* So a supervisor reading the hours board sees what the time went on
   rather than a bare number against a truck. */
ok("it says what was done", /12 tires gauged/.test(e.workPerformed), e.workPerformed);
ok("…and counts one tire properly",
  /1 tire gauged/.test(treadEntry({ tires: 1, seconds: 600, stoppedAt: T0 }).workPerformed),
  treadEntry({ tires: 1, seconds: 600, stoppedAt: T0 }).workPerformed);
ok("…and says something with no count at all",
  treadEntry({ seconds: 600, stoppedAt: T0 }).workPerformed === "Tread readings");
ok("the seconds behind the hours are kept", e.unitSeconds === 2700, e.unitSeconds);
ok("…and so are the stints", e.stints.length === 1, e.stints);
/* A walk-around that nobody clocked books nothing. */
ok("a clock never started books no hours",
  treadEntry({ vehId: "v1", seconds: 0, stoppedAt: T0 }).hours === 0);

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
