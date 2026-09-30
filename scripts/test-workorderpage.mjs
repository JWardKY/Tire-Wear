/* A work order as a page.
   ─────────────────────────────────────────────────────────────────
   The board showed a work order as a row, and a row answers one
   question: is this done yet. Somebody walking to a truck wants the
   others — what is wrong with it, what has already been tried, who has
   been on it, what came off the shelf, how long it has been sitting.

   Two things this settles that the row never had to.

   Hours group by the day the work happened, not the day somebody keyed
   them in. Donald Bradley books his whole week on Friday at five;
   ordered by entry those six lines are one blur, and ordered by work
   date they are the week the truck actually had.

   And the status is a sentence with a number of days in it. "Open" on
   a job raised in March is technically true and practically a lie.

   Needs nothing: no database, no browser.
*/
import {
  daysSince, sayAge, sayStatus, crewOf, byDay, whatWasDone, packet,
} from "../src/workOrderPage.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

const NOW = Date.parse("2026-09-30T12:00:00Z");
const ago = (days) => new Date(NOW - days * 86400000).toISOString();

console.log("how long something has been sitting:");
ok("today is nought days", daysSince(ago(0), NOW) === 0);
ok("yesterday is one", daysSince(ago(1), NOW) === 1);
ok("a month is 30", daysSince(ago(30), NOW) === 30);
/* Floored, so "2 days" means two have actually passed rather than that
   the clock ticked past midnight twice. */
ok("part of a day does not round up", daysSince(new Date(NOW - 86400000 * 1.9).toISOString(), NOW) === 1);
ok("nothing to measure from is null", daysSince(null, NOW) === null);
ok("rubbish is null, not 1970", daysSince("not a date", NOW) === null);
/* A clock skew on a tablet would otherwise print "-3 days". */
ok("the future does not go negative", daysSince(ago(-5), NOW) === 0);
ok("one day reads singular", sayAge(1) === "1 day");
ok("two reads plural", sayAge(2) === "2 days");
ok("nought reads as today", sayAge(0) === "today");

console.log("\nwhere the job stands:");
let st = sayStatus({ state: "open", at: ago(2) }, NOW);
ok("nobody has touched it", /Not started/.test(st.line) && /2 days/.test(st.line), st);
ok("…and two days old is not an alarm", st.tone === "open", st);
/* The row said "open" whether it was raised this morning or in March. */
st = sayStatus({ state: "open", at: ago(29) }, NOW);
ok("a month old is flagged", st.tone === "stale", st);

st = sayStatus({ state: "in progress", at: ago(9), startedAt: ago(3) }, NOW);
ok("started says when", /In progress/.test(st.line) && /3 days/.test(st.line), st);
/* Started is not a state in the table — it is whether an hour has ever
   been booked. A job somebody spent a day on and a job nobody has
   touched read identically otherwise, and they are the two most
   different rows on the board. */
st = sayStatus({ state: "open", at: ago(4), worked: true }, NOW);
ok("an hour booked counts as started even with the state left open",
  st.tone === "working", st);

st = sayStatus({ state: "hold", holdReason: "waiting on parts", holdSince: ago(6) }, NOW);
ok("on hold names the reason", /waiting on parts/.test(st.line), st);
ok("…and how long", /6 days/.test(st.line), st);
/* A hold with no date still has to say it is held. */
ok("a hold with no since is still a hold",
  sayStatus({ state: "open", holdReason: "no parts" }, NOW).tone === "hold");

st = sayStatus({ state: "done", completedBy: "Dylan Barnes", completedAt: ago(1) }, NOW);
ok("finished names who", /Dylan Barnes/.test(st.line), st);
ok("…and when", /1 day ago/.test(st.line), st);
ok("finished today does not say '0 days ago'",
  /today/.test(sayStatus({ state: "done", completedAt: ago(0) }, NOW).line),
  sayStatus({ state: "done", completedAt: ago(0) }, NOW));
/* Done beats held: an order closed out while a hold reason was still
   on it is done, not waiting. */
ok("done wins over a stale hold reason",
  sayStatus({ state: "done", holdReason: "parts", completedAt: ago(1) }, NOW).tone === "done");
ok("an order with nothing on it still says something",
  sayStatus({}, NOW).line.length > 0, sayStatus({}, NOW));

console.log("\nwho is on it:");
/* The order keeps its own assigned_name and the crew table keeps the
   rest, and they overlap often enough that printing both is how a
   packet names one person twice. */
ok("the assigned name comes first",
  crewOf({ assignedName: "Dylan Barnes", crew: [{ name: "Tyler Coffey" }] })
    .join() === "Dylan Barnes,Tyler Coffey");
ok("…and is not repeated by the crew table",
  crewOf({ assignedName: "Dylan Barnes", crew: [{ name: "Dylan Barnes" }] }).length === 1);
ok("…however it is cased there",
  crewOf({ assignedName: "Dylan Barnes", crew: [{ name: "dylan bradley" }, { name: "DYLAN BRADLEY" }] })
    .length === 2);
ok("plain strings work as well as rows",
  crewOf({ crew: ["Tyler Coffey"] }).join() === "Tyler Coffey");
ok("nobody on it is an empty list", crewOf({}).length === 0);
ok("blanks are not people", crewOf({ assignedName: "  ", crew: [{ name: "" }, null] }).length === 0);

console.log("\ntime, by the day the work happened:");
const hours = [
  { id: 1, date: "2026-09-28", hours: 2.5, who: "Dylan Barnes", did: "Pulled the wheel" },
  { id: 2, date: "2026-09-30", hours: 1.0, who: "Tyler Coffey", did: "Refitted and road tested" },
  { id: 3, date: "2026-09-28", hours: 1.5, who: "Tyler Coffey", did: "Pressed the bearing" },
  { id: 4, date: null, hours: 3.0, who: "Dylan Barnes", did: "" },
];
let days = byDay(hours);
ok("a day is one row however many entries made it", days.length === 3, days.map((d) => d.date));
ok("…with the hours added up",
  days.find((d) => d.date === "2026-09-28").hours === 4, days.map((d) => [d.date, d.hours]));
ok("…and everybody who was on it that day named once",
  days.find((d) => d.date === "2026-09-28").who.join() === "Dylan Barnes,Tyler Coffey");
/* Newest first: the question a packet is picked up to answer is where
   they got to, and that is the last thing anybody did. */
ok("newest day first", days[0].date === "2026-09-30", days.map((d) => d.date));
/* Undated hours are real hours and must not quietly vanish. */
ok("undated hours are kept", days.some((d) => d.date === null));
ok("…and go last, not first", days[days.length - 1].date === null, days.map((d) => d.date));
ok("nothing in, nothing out", byDay([]).length === 0 && byDay().length === 0);

console.log("\nwhat was actually done, in their own words:");
let done = whatWasDone(hours);
ok("only the entries somebody wrote on", done.length === 3, done.map((x) => x.did));
/* The running story of a job only reads forwards, and the dates have
   to differ or a reversed sort looks identical — which is exactly how
   this assertion first passed against code that had it backwards. */
ok("oldest first — it is a story",
  done[0].date === "2026-09-28" && done[done.length - 1].date === "2026-09-30",
  done.map((x) => x.date));
ok("…ending on what was done last",
  /Refitted/.test(done[done.length - 1].did), done[done.length - 1]);
ok("…carrying who and how long", done[0].who === "Dylan Barnes" && done[0].hours === 2.5, done[0]);
ok("an order nobody wrote on has nothing to tell",
  whatWasDone([{ date: "2026-09-28", hours: 1, did: "   " }]).length === 0);

console.log("\nthe packet:");
const parts = [
  { id: "p1", num: "12345", name: "Drive tire", qty: 2, cost: 1310.48, who: "Dylan Barnes" },
  { id: "p2", num: "999", name: "Seal", qty: 1, cost: null, who: "Dylan Barnes" },
];
let d = packet({ state: "in progress", at: ago(5), startedAt: ago(2),
                 assignedName: "Dylan Barnes" }, { hours, parts }, NOW);
ok("labour adds up", d.hoursTotal === 8, d.hoursTotal);
ok("parts add up", Math.round(d.partsCost * 100) === 131048, d.partsCost);
/* A total with holes in it has to say so, or somebody quotes it. */
ok("…and a part with no cost is counted out loud, not as zero",
  d.partsWithoutCost === 1, d.partsWithoutCost);
ok("it is not untouched", d.untouched === false);
ok("the crew came through", d.crew.join() === "Dylan Barnes");
ok("and the status knows an hour was booked", d.status.tone === "working", d.status);

console.log("\nan order nobody has started:");
d = packet({ state: "open", at: ago(1) }, { hours: [], parts: [] }, NOW);
ok("says so plainly rather than printing two empty tables", d.untouched === true);
ok("…with nothing in the totals", d.hoursTotal === 0 && d.partsCost === 0);
ok("…and no days and no story", d.days.length === 0 && d.done.length === 0);
/* Called with nothing at all, which is what a failed load looks like. */
d = packet({}, {}, NOW);
ok("no lines at all does not throw", d.untouched === true && d.hoursTotal === 0, d);

console.log("\na part returned to the shelf:");
/* Issues are negative in the ledger and a return is positive, so a
   return reduces what the job cost rather than adding to it. */
d = packet({}, { hours: [], parts: [{ id: "r", num: "1", qty: -1, cost: -50 }] }, NOW);
ok("it comes off the total", d.partsCost === -50, d.partsCost);

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
