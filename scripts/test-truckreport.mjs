/* A truck file as a document — the CSV and the PDF.
   ─────────────────────────────────────────────────────────────────
   Asked for a PDF beside the existing Print and CSV, the first thing
   found was that the CSV already lied. Its SUMMARY came from the
   date-aware rollup; every detail section below it ignored From/To. A
   "last month" file said 12.5 labour hours at the top and then listed
   every hour ever booked to the truck. Nothing on screen showed it.

   So the CSV and the PDF now render from one report definition with
   the dates applied once. What is protected here:

     - dated sections (hours, services, parts, mileage, timeline) hold
       only what is in range, and agree with the summary;
     - current sections (tires, defects, work orders) are NOT filtered,
       because "what is on the truck" is not a question about last month;
     - the CSV keeps its old header names, so a spreadsheet keyed on
       them keeps working;
     - the PDF is real text — generated here, in Node, and read back.

   Needs nothing: no database, no browser.
*/
import { inRange, sayRange, cellText, reportOf, csvRows, filenameFor, pdfBody }
  from "../src/truckReport.js";
import { buildPdf } from "../src/truckPdf.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`${v ? "  ok  " : "  !!  "}${l}${!v && got !== undefined
    ? ` — got ${JSON.stringify(got)}` : ""}`);
};

/* DT-866 across two months. October is the range asked for. */
const F = {
  unit: { num: "DT-866", make: "Mack", model: "Granite", year: "2021", div: "DT" },
  meter: { odo: 347882, date: "2026-11-13" },
  hours: [
    { date: "2026-09-12", mechanic: "Alex Oswald", hours: 2, code: "825", codeName: "Differential",
      performed: "Checked rear end for noise" },
    { date: "2026-10-07", mechanic: "Joshua Sawyers", hours: 4.73, code: "825",
      codeName: "Differential", performed: "Installed new rear differential and driveline" },
    { date: "2026-10-07", mechanic: "Dylan Barnes", hours: 5, code: "825",
      codeName: "Differential", note: "rear end job, waiting on parts" },
    { date: "2026-11-02", mechanic: "Tyler Coffey", hours: 1.5, code: "873", codeName: "Service" },
  ],
  services: [
    { date: "2026-09-01", program: "PM-A", category: "Engine", odo: 330000, hours: 3, by: "Alex" },
    { date: "2026-10-20", program: "PM-B", category: "Engine", odo: 345000, hours: 4, by: "Tyler" },
  ],
  parts: [
    { kind: "issue", at: "2026-10-07T14:00:00Z", partNumber: "YN-1", name: "Yoke nut", qty: 1, cost: 42 },
    { kind: "issue", at: "2026-11-03T09:00:00Z", partNumber: "FL-2", name: "Filter", qty: 2, cost: 18.5 },
    /* A receipt is not a part on the truck. */
    { kind: "receive", at: "2026-10-05T09:00:00Z", partNumber: "YN-1", name: "Yoke nut", qty: 5 },
  ],
  odos: [{ date: "2026-09-30", odo: 340000 }, { date: "2026-10-31", odo: 346450 }],
  history: [
    { at: "2026-11-02T15:00:00Z", kind: "hours", what: "1.5 hr", summary: "Service" },
    { at: "2026-10-07T20:00:00Z", kind: "hours", what: "4.73 hr", summary: "Rear diff" },
    { at: "2026-09-12T13:00:00Z", kind: "hours", what: "2 hr", summary: "Noise check" },
  ],
  /* Current: always shown whatever the dates. */
  tires: [{ pos: "1L", on: true, brand: "Continental", model: "HDC3", size: "11R24.5",
    onDate: "2026-03-01", onOdo: 300000, newDepth: 28, cost: 655.24 }],
  defects: [{ first: "2026-04-01", category: "Lights", note: "Headlight", state: "repaired" }],
  orders: [{ wo: "WO-26-0071", title: "Rear carrier", state: "in progress", at: "2026-10-01" }],
};
/* The rollup for October, as the screen computes it. */
const ROLL_OCT = { labourHours: 9.73, lines: 2,
  mechanics: [{ mechanic: "Dylan Barnes", hours: 5, days: 1, last: "2026-10-07" },
              { mechanic: "Joshua Sawyers", hours: 4.73, days: 1, last: "2026-10-07" }] };
const OCT = { from: "2026-10-01", to: "2026-10-31" };

console.log("── the range ──");
ok("a date inside is in", inRange("2026-10-07", "2026-10-01", "2026-10-31"));
ok("…and the first and last days count", inRange("2026-10-01", "2026-10-01", "2026-10-31")
  && inRange("2026-10-31", "2026-10-01", "2026-10-31"));
ok("a timestamp compares by its day", inRange("2026-10-31T23:59:00Z", "2026-10-01", "2026-10-31"));
ok("outside is out", !inRange("2026-11-01", "2026-10-01", "2026-10-31"));
ok("no bounds lets everything in", inRange("1999-01-01", "", ""));
ok("one bound is still a bound", !inRange("2026-09-30", "2026-10-01", ""));
ok("the range reads in words", sayRange(OCT.from, OCT.to) === "10/01/26 to 10/31/26",
  sayRange(OCT.from, OCT.to));
ok("…and none reads as all of it", sayRange("", "") === "all records");

console.log("\n── what the document holds ──");
const R = reportOf(F, ROLL_OCT, OCT);
const sec = (id) => R.sections.find((s) => s.id === id);

/* THE bug. The summary says 9.73 hours for October; the detail must
   say the same and not list September and November underneath. */
const octHours = sec("hours").rows.reduce((a, r) => a + r[2], 0);
ok("the hour lines are October's only", sec("hours").rows.length === 2,
  sec("hours").rows.map((r) => r[0]));
ok("…and add up to the summary's figure", Math.abs(octHours - ROLL_OCT.labourHours) < 0.001,
  [octHours, ROLL_OCT.labourHours]);
ok("services in range only", sec("services").rows.length === 1
  && sec("services").rows[0][1] === "PM-B", sec("services").rows);
ok("parts issued in range only", sec("parts").rows.length === 1
  && sec("parts").rows[0][1] === "YN-1", sec("parts").rows);
ok("…and a receipt is never a part on the truck",
  !reportOf(F, ROLL_OCT, {}).sections.find((s) => s.id === "parts").rows.some((r) => r[3] === 5));
ok("mileage in range only", sec("mileage").rows.length === 1, sec("mileage").rows);
ok("the timeline in range only", sec("history").rows.length === 1, sec("history").rows);

/* What is on the truck is not a question about last month. */
ok("tires are as of today, not filtered", sec("tires").rows.length === 1);
ok("defects too", sec("defects").rows.length === 1);
ok("work orders too", sec("orders").rows.length === 1);
ok("…and the document says which is which",
  /cover 10\/01\/26 to 10\/31\/26/.test(R.scope) && /as of the day this was made/.test(R.scope),
  R.scope);

const ALL = reportOf(F, ROLL_OCT, {});
ok("with no dates, every hour is there",
  ALL.sections.find((s) => s.id === "hours").rows.length === 4);
ok("…and it says it is everything", /Everything on record/.test(ALL.scope));
ok("the header names the truck", R.title === "Truck file — DT-866");
ok("…and what it is", /Mack Granite 2021/.test(R.subtitle) && /347,882 mi/.test(R.subtitle),
  R.subtitle);
ok("a truck with no mileage says so", /no mileage/.test(reportOf({ unit: { num: "X" } }, {}, {}).subtitle));
ok("an empty file does not throw",
  reportOf({}, {}, {}).sections.every((s) => Array.isArray(s.rows)));

console.log("\n── the CSV ──");
const csv = csvRows(R);
const flat = csv.map((r) => r.join("|"));
ok("it starts with the truck", csv[0][0] === "Truck file — DT-866");
ok("…and says the range", flat.some((l) => l === "Range: 10/01/26 to 10/31/26"), flat.slice(0, 4));
/* Somebody's spreadsheet may be keyed on these. They do not change. */
ok("the old header names are kept",
  flat.includes("date|mechanic|hours|cost_code|cost_code_name|where|job_location|work_order|what_was_done"),
  flat.find((l) => l.startsWith("date|mechanic")));
ok("…and the old section names", flat.includes("HOURS, EVERY ENTRY") && flat.includes("TIRES"));
ok("September's hours are not in October's file",
  !flat.some((l) => l.includes("Checked rear end for noise")));
ok("…nor November's", !flat.some((l) => l.includes("Tyler Coffey")));
ok("the summary is name and value", flat.includes("Labour hours|9.73"));
ok("a file for a range is named for it",
  filenameFor(R, "csv") === "truck-file-DT-866_2026-10-01_to_2026-10-31.csv", filenameFor(R, "csv"));
ok("…one for everything is not", filenameFor(ALL, "pdf") === "truck-file-DT-866.pdf");
ok("…and an open end says so",
  filenameFor(reportOf(F, {}, { from: "2026-10-01" }), "csv") === "truck-file-DT-866_2026-10-01_to_today.csv");

console.log("\n── how a value reads on paper ──");
ok("a date reads mm/dd/yy", cellText("2026-10-07", "date") === "10/07/26");
ok("…from a timestamp too", cellText("2026-10-07T14:00:00Z", "date") === "10/07/26");
ok("hours to two places", cellText(4.7, "hours") === "4.70");
ok("money with a sign", cellText(655.24, "money") === "$655.24");
ok("a big number with commas", cellText(347882, "num") === "347,882");
ok("nothing is a blank, not 'null'", cellText(null, "text") === "" && cellText(undefined, "date") === "");
/* A note typed on a phone carries line breaks. On paper they become
   ragged gaps in the middle of a table cell. */
ok("a note's line breaks fold to spaces", cellText("installed rebuilt transmission\nbell housing bolts")
  === "installed rebuilt transmission bell housing bolts");
/* The summary is a list of different kinds of thing. "Parts cost 42"
   is how it printed before each row carried its own format. */
const sumRows = pdfBody(reportOf(F, { ...ROLL_OCT, partsCost: 42 }, OCT).sections[0]);
ok("the summary prints a dollar figure as one",
  sumRows.find((r) => r[0] === "Parts cost")?.[1] === "$42.00",
  sumRows.find((r) => r[0] === "Parts cost"));
ok("…and hours as hours", sumRows.find((r) => r[0] === "Labour hours")?.[1] === "9.73");
ok("…while the CSV keeps the raw figure",
  csvRows(reportOf(F, { ...ROLL_OCT, partsCost: 42 }, OCT)).some((r) => r[0] === "Parts cost" && r[1] === 42));
ok("every summary row has a format",
  R.sections[0].rowKinds.length === R.sections[0].rows.length,
  [R.sections[0].rowKinds.length, R.sections[0].rows.length]);
ok("a PDF row is formatted, the CSV row is not",
  pdfBody(sec("hours"))[0][0] === "10/07/26" && sec("hours").rows[0][0] === "2026-10-07");

console.log("\n── the PDF itself ──");
/* Made for real, here, and read back. A PDF test that only checks a
   button exists passes on a file that opens blank. */
const doc = buildPdf(R, { printedOn: new Date("2026-11-14T12:00:00Z") });
const out = doc.output();
ok("it is a PDF", out.startsWith("%PDF-"), out.slice(0, 8));
ok("it names the truck", out.includes("Truck file") && out.includes("DT-866"));
ok("it carries the mechanic's own words",
  out.includes("Installed new rear differential and driveline"));
ok("…and October's hours in October's format", out.includes("10/07/26"));
ok("but not September's", !out.includes("Checked rear end for noise"));
ok("it says which half is dated", out.includes("as of the day this was made"));
ok("every page is numbered", out.includes(`Page 1 of ${doc.internal.getNumberOfPages()}`));
/* A long timeline must flow onto more pages, not run off the bottom of
   the first one. */
const long = { ...F, history: Array.from({ length: 300 }, (_, i) => ({
  at: "2026-10-15T10:00:00Z", kind: "hours", what: `entry ${i}`, summary: "x" })) };
const longDoc = buildPdf(reportOf(long, ROLL_OCT, OCT));
ok("a long timeline runs onto further pages", longDoc.internal.getNumberOfPages() >= 5,
  longDoc.internal.getNumberOfPages());
ok("…and the last entry is still in it", longDoc.output().includes("entry 299"));

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
