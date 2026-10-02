/* Driving time on a timecard.
   ─────────────────────────────────────────────────────────────────
   A mechanic's day is not all spent in the shop. Trucks get shuttled
   between Clays Ferry and Clover Bottom, somebody runs to the dealer
   for a part, somebody drives out to a quarry for a road call. That
   time was going on whatever job was nearest to hand, or nowhere at
   all.

   The design is the thing worth protecting here: a driving line is an
   ORDINARY time entry with "Driving" on it. The card total, the
   approval, the payroll export and the supervisor's hours board all
   already read time entries, so none of them has to learn about this
   tab. A second kind of record would mean teaching every one of them,
   and the first one somebody forgot would be hours that never reached
   payroll.

   Which is why the tests below care so much about the entry shape: it
   has to be something addEntry already knows how to write.

   Needs nothing: no database, no browser.
*/
import { DRIVING, isDriving, drivingOnly, notDriving, drivenHours,
  whyNotReady, ready, sayTrip, reverseOf, entryFrom, COMMON_PLACES }
  from "../src/driveLine.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

const trip = (over = {}) => ({
  date: "2026-10-02", vehId: "v1", unitLabel: "", from: "Clays Ferry Shop",
  to: "Clover Bottom Shop", hours: "1.5", costCode: "880",
  workOrder: "", note: "", ...over,
});

console.log("what counts as driving:");
ok("a line with Driving on it", isDriving({ workTypes: ["Driving"] }));
ok("…however it is cased", isDriving({ workTypes: [" driving "] }));
/* The row comes back from the database under its own name in some
   places and the app's in others. */
ok("read off a database row too", isDriving({ work_types: ["Driving"] }));
ok("a line with other work on it as well",
  isDriving({ workTypes: ["PM service", "Driving"] }));
ok("not a line without it", !isDriving({ workTypes: ["PM service"] }));
ok("not an empty line", !isDriving({ workTypes: [] }) && !isDriving({}));
ok("nothing at all does not crash", !isDriving(null));

console.log("\npulling a day apart:");
const day = [
  { id: "a", hours: 3, workTypes: ["Repair"] },
  { id: "b", hours: 1.5, workTypes: ["Driving"] },
  { id: "c", hours: 2, workTypes: ["Driving", "Repair"] },
  { id: "d", hours: 1, workTypes: [] },
];
ok("the driving lines", drivingOnly(day).map((e) => e.id).join() === "b,c",
  drivingOnly(day).map((e) => e.id));
ok("…and everything else", notDriving(day).map((e) => e.id).join() === "a,d",
  notDriving(day).map((e) => e.id));
/* The two halves have to add back up to the day, or the tab and the
   card total are telling the mechanic different things. */
ok("and the two halves are the whole day",
  drivingOnly(day).length + notDriving(day).length === day.length);
ok("driving hours add up", drivenHours(day) === 3.5, drivenHours(day));
/* A line that was both driving and a repair counts its hours ONCE,
   where the whole line sits. Splitting them would invent hours. */
ok("…counting a mixed line once, not twice", drivenHours([day[2]]) === 2);
ok("a day with no driving is nought hours", drivenHours([day[0]]) === 0);

console.log("\nwhat a trip has to say before it can be saved:");
ok("a full one is ready", ready(trip()), whyNotReady(trip()));
/* Both ends, always. "Drove 2 hours" cannot be checked against a
   truck's miles, cannot be charged with any confidence, and means
   nothing in a year. */
ok("it needs a start", whyNotReady(trip({ from: "" })) === "Say where the trip started");
ok("…and an end", whyNotReady(trip({ to: "" })) === "Say where it ended");
ok("…and whitespace is not an answer", !ready(trip({ from: "   " })));
ok("it needs a unit", /which unit/.test(whyNotReady(trip({ vehId: "" }))),
  whyNotReady(trip({ vehId: "" })));
/* Something not on the fleet still counts — a hired truck, somebody's
   own pickup on a parts run. */
ok("…though a typed one will do",
  ready(trip({ vehId: "", unitLabel: "Company pickup" })));
ok("it needs a cost code", /charge/i.test(whyNotReady(trip({ costCode: "" }))),
  whyNotReady(trip({ costCode: "" })));
ok("it needs hours", /hours/i.test(whyNotReady(trip({ hours: "" }))),
  whyNotReady(trip({ hours: "" })));
ok("nought hours is not a trip", !ready(trip({ hours: "0" })));
ok("…nor a minus figure", !ready(trip({ hours: "-2" })));
ok("…nor more than a day", !ready(trip({ hours: "25" })));
ok("…nor something that is not a number", !ready(trip({ hours: "abc" })));
ok("a quarter of an hour is fine", ready(trip({ hours: "0.25" })));

console.log("\nthe trip in one line:");
ok("both ends", sayTrip({ droveFrom: "Clays Ferry", droveTo: "Richmond" })
  === "Clays Ferry → Richmond");
ok("read off a database row too",
  sayTrip({ drove_from: "Clays Ferry", drove_to: "Richmond" })
  === "Clays Ferry → Richmond");
ok("one end only still says something",
  sayTrip({ droveFrom: "Clays Ferry" }) === "From Clays Ferry");
ok("neither says nothing", sayTrip({}) === "");

console.log("\nthe way back:");
/* Somebody who drove a truck down and came back should not have to
   type the same two places in the other order. */
const back = reverseOf(trip());
ok("the ends swap", back.from === "Clover Bottom Shop" && back.to === "Clays Ferry Shop",
  [back.from, back.to]);
ok("…and everything else is kept", back.vehId === "v1" && back.costCode === "880");

console.log("\nwhat gets written:");
const e = entryFrom(trip(), "2026-10-02");
ok("Driving is on it", e.workTypes.includes(DRIVING), e.workTypes);
/* The whole design in one assertion: this is a time entry, the same
   shape addEntry already writes, so the card total, the approval and
   payroll need to know nothing about driving. */
ok("it is an ordinary time entry",
  e.hours === 1.5 && e.costCode === "880" && e.date === "2026-10-02", e);
/* Its own kind of time, not "road". Road already means an outside
   service call everywhere this fleet reads it — the Now board, the
   hours split, the payroll export — so filing driving under it would
   have quietly inflated every one of those with shuttle runs. */
ok("…booked as driving, not as a road call", e.where === "driving", e.where);
ok("…and specifically not as a road call", e.where !== "road");
ok("the trip is on it", e.droveFrom === "Clays Ferry Shop" && e.droveTo === "Clover Bottom Shop", e);
ok("the unit is on it", e.vehId === "v1" && !e.unitLabel, e);
ok("a typed unit goes to the label instead",
  entryFrom(trip({ vehId: "", unitLabel: " Company pickup " })).unitLabel === "Company pickup");
/* A mechanic who drove a truck to the quarry AND fixed it there has
   one line with both kinds of work on it, and the hours count once. */
ok("driving joins other work rather than replacing it",
  entryFrom(trip({ workTypes: ["Repair"] })).workTypes.join() === "Repair,Driving",
  entryFrom(trip({ workTypes: ["Repair"] })).workTypes);
ok("…and is not put on twice",
  entryFrom(trip({ workTypes: ["Driving"] })).workTypes.join() === "Driving",
  entryFrom(trip({ workTypes: ["Driving"] })).workTypes);
ok("…however it was cased the first time",
  entryFrom(trip({ workTypes: ["driving"] })).workTypes.join() === "Driving",
  entryFrom(trip({ workTypes: ["driving"] })).workTypes);
ok("an empty work order is nothing, not an empty string",
  entryFrom(trip()).workOrder === null, entryFrom(trip()).workOrder);

console.log("\nthe places offered:");
ok("the two shops are there",
  COMMON_PLACES.includes("Clays Ferry Shop") && COMMON_PLACES.includes("Clover Bottom Shop"),
  COMMON_PLACES);
ok("they are a starting point, not a list to choose from",
  ready(trip({ from: "Somebody's quarry", to: "A dealer in Lexington" })));

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
