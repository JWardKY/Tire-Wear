/* The truck file — finding a unit, and adding it up.
   ─────────────────────────────────────────────────────────────────
   Two things worth holding here.

   The box somebody types a truck number into. In a shop that is "881",
   not "DT-881", and the wrong truck's file is worse than no file: it is
   a plausible answer to the wrong question, and nothing on the page
   says so.

   And the totals. rollUp backs the screen AND the CSV, so the two
   cannot disagree — but only if one function does both, which is what
   these assertions are protecting.

   Needs nothing: no database, no browser.
     node scripts/test-truckfile.mjs
*/
import { findUnits, rollUp, squash } from "../src/truckRollup.js";

let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) console.log(`  ok   ${name}`);
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name, got, want) => ok(name, got === want, `got ${got}, wanted ${want}`);

const U = (num, active = true) => ({ id: num, num, make: "Mack", model: "Granite",
  year: 2019, div: num.slice(0, 2), cfg: "dump12", active });

const FLEET = [U("DT-881"), U("DT-1881"), U("DT-864"), U("DT-1800"), U("HT-1119"),
  U("T-673"), U("DT-810", false)];
const names = (list) => list.map((u) => u.num).join(",");

console.log("\nFinding the truck somebody means");

eq("the exact number", names(findUnits(FLEET, "DT-881")), "DT-881");
eq("lower case", names(findUnits(FLEET, "dt-881")), "DT-881");
eq("no punctuation", names(findUnits(FLEET, "dt881")), "DT-881");
eq("a space instead", names(findUnits(FLEET, "DT 881")), "DT-881");

/* The one that matters in a shop: nobody says the prefix out loud. */
eq("just the digits finds both, shortest first",
  names(findUnits(FLEET, "881")), "DT-881,DT-1881");
eq("and a prefix of the digits", names(findUnits(FLEET, "18")), "DT-1800,DT-1881");

eq("a truck off the roster is still findable",
  names(findUnits(FLEET, "810")), "DT-810");
eq("nothing typed offers nothing", findUnits(FLEET, "").length, 0);
eq("a number nobody has offers nothing", findUnits(FLEET, "99999").length, 0);
eq("an HT is found the same way", names(findUnits(FLEET, "1119")), "HT-1119");
eq("and a T", names(findUnits(FLEET, "673")), "T-673");

/* Shortest first, so the common truck is the top of the list. In this
   fleet's numbering the truck whose digits ARE what was typed is always
   the shortest match, which is why there is no separate rule for it. */
const many = [U("DT-1881"), U("DT-881")];
eq("the shorter number is offered first", names(findUnits(many, "881")), "DT-881,DT-1881");

/* Across prefixes too: the 881 truck beats the 1881 one whichever
   letters are in front of them. The wrong truck's file is worse than no
   file — it is a plausible answer to the wrong question, and nothing on
   the page says so. */
eq("and across prefixes",
  names(findUnits([U("DT-1881"), U("HT-881")], "881")), "HT-881,DT-1881");
eq("same length falls back to the number itself",
  names(findUnits([U("HT-881"), U("DT-881")], "881")), "DT-881,HT-881");
eq("squash is the same rule everywhere", squash("dt 8-8_1"), "DT881");

console.log("\nAdding the file up");

const FILE = {
  unit: U("DT-881"),
  meter: { odo: 412000, date: "2026-09-01", source: "motive" },
  hours: [
    { id: "h1", date: "2026-08-03", hours: 3.5, mechanic: "Dylan Barnes", code: "800", codeName: "Brake System" },
    { id: "h2", date: "2026-08-03", hours: 2, mechanic: "Will Strong", code: "800", codeName: "Brake System" },
    /* A second line the same day, so "days on it" cannot quietly be
       counted as "entries" — two hours in the morning and two in the
       afternoon is one day on this truck, not two. */
    { id: "h5", date: "2026-08-03", hours: 1, mechanic: "Dylan Barnes", code: "600", codeName: "Tires" },
    { id: "h3", date: "2026-09-02", hours: 4.25, mechanic: "Dylan Barnes", code: "600", codeName: "Tires" },
    { id: "h4", date: "2026-09-10", hours: 1.5, mechanic: "Dylan Barnes", code: "600", codeName: "Tires" },
  ],
  parts: [
    { id: "p1", at: "2026-08-03T14:00:00Z", kind: "issue", qty: 2, cost: 41.5, partNumber: "A-1" },
    { id: "p2", at: "2026-09-02T14:00:00Z", kind: "issue", qty: 1, cost: 310, partNumber: "B-2" },
    /* A receive is stock coming IN. Counting it as a part on the truck
       would inflate what the truck cost by whatever the shelf took. */
    { id: "p3", at: "2026-09-02T15:00:00Z", kind: "receive", qty: 40, cost: 10, partNumber: "C-3" },
  ],
  services: [
    { id: "s1", date: "2026-06-01", program: "A service", hours: 2 },
    { id: "s2", date: "2026-09-05", program: "B service", hours: 5 },
  ],
  defects: [
    { id: "d1", state: "open", safety: "unsafe", repairedAt: null },
    { id: "d2", state: "claimed", safety: "safe", repairedAt: null },
    { id: "d3", state: "repaired", safety: "safe", repairedAt: "2026-08-04T10:00:00Z" },
    { id: "d4", state: "repaired", safety: "safe", repairedAt: "2026-05-01T10:00:00Z" },
  ],
  orders: [
    { id: "w1", state: "in progress", completedAt: null },
    { id: "w2", state: "done", completedAt: "2026-08-05T10:00:00Z" },
    { id: "w3", state: "done", completedAt: "2026-02-05T10:00:00Z" },
  ],
  /* 4R is twelve 32nds apart — the pair that started this. 4L is two
     apart, which is fine. The pulled tire has no depth and must not
     drag anything into the check. */
  tires: [
    { id: "t1", on: true, cost: 520, pos: "4RI", depth: 27 },
    { id: "t2", on: true, cost: 520, pos: "4RO", depth: 15 },
    { id: "t4", on: true, cost: 520, pos: "4LI", depth: 24 },
    { id: "t5", on: true, cost: 520, pos: "4LO", depth: 22 },
    { id: "t3", on: false, cost: 480, pos: "3RI", depth: null },
  ],
  pmDue: [
    { programId: "g1", level: "over" }, { programId: "g2", level: "soon" },
    { programId: "g3", level: "ok" },
  ],
  odos: [], history: [],
};

const all = rollUp(FILE);

eq("every hour booked to it", all.labourHours, 12.25);
eq("every entry counted", all.lines, 5);
eq("two mechanics have had their hands on it", all.mechanics.length, 2);
eq("the busiest is first", all.mechanics[0].mechanic, "Dylan Barnes");
eq("…with his hours", all.mechanics[0].hours, 10.25);
/* Days, not entries. Two lines on one day is one day on the truck. */
eq("…over the days he was actually on it", all.mechanics[0].days, 3);
ok("…which is fewer than his entries", all.mechanics[0].days < 4);
eq("…and when he last touched it", all.mechanics[0].last, "2026-09-10");
eq("the other mechanic's hours", all.mechanics[1].hours, 2);

eq("charged to two codes", all.codes.length, 2);
eq("the biggest code first", all.codes[0].code, "600");
eq("…with its hours", all.codes[0].hours, 6.75);
eq("…and its name kept", all.codes[0].name, "Tires");

eq("only issued parts count", all.partLines, 2);
eq("…and the money follows the quantity", all.partsCost, 393);

eq("services done", all.servicesDone, 2);
eq("defects still open", all.openDefects, 2);
ok("a major defect is open, because one of them is", all.majorDefect);
eq("defects repaired", all.repairedDefects, 2);
eq("jobs still open", all.openOrders, 1);
eq("jobs finished", all.doneOrders, 2);
eq("tires on it", all.tiresOn, 4);
eq("tires it has eaten", all.tiresOff, 1);
eq("rubber recorded", all.tireSpend, 2560);
eq("services over", all.pmOver, 1);

/* The pair that started this: 4RI at 27/32 beside 4RO at 15/32. */
eq("the mismatched pair is found", all.mismatchedPairs.length, 1);
eq("…and it is the right end", all.mismatchedPairs[0].end, "4R");
eq("…by the right amount", all.mismatchedPairs[0].diff, 12);
eq("the pair within spec is not flagged",
  all.mismatchedPairs.filter((m) => m.end === "4L").length, 0);
eq("a tighter limit catches the other pair too",
  rollUp(FILE, { dualMatch: 1 }).mismatchedPairs.length, 2);
eq("services due soon", all.pmSoon, 1);

console.log("\nThe same file, narrowed to a range");

const aug = rollUp(FILE, { from: "2026-08-01", to: "2026-08-31" });
eq("only August hours", aug.labourHours, 6.5);
eq("only August entries", aug.lines, 3);
eq("both mechanics were on it in August", aug.mechanics.length, 2);
eq("only August parts", aug.partLines, 1);
eq("…and their cost", aug.partsCost, 83);
eq("no service in August", aug.servicesDone, 0);
eq("one defect repaired in August", aug.repairedDefects, 1);
eq("one job finished in August", aug.doneOrders, 1);

/* What is ON the truck is not a date question. A range must never make
   a tire disappear or an open defect look closed — that is the reading
   that sends somebody out on a truck with a major fault on it. */
eq("tires on it ignore the range", aug.tiresOn, all.tiresOn);
eq("open defects ignore the range", aug.openDefects, all.openDefects);
ok("the major defect ignores the range", aug.majorDefect);
eq("open jobs ignore the range", aug.openOrders, all.openOrders);
eq("service due ignores the range", aug.pmOver, all.pmOver);
/* What is mounted is not a date question either. */
eq("mismatched duals ignore the range",
  aug.mismatchedPairs.length, all.mismatchedPairs.length);

const half = rollUp(FILE, { from: "2026-09-01" });
eq("an open-ended range takes everything after it", half.labourHours, 5.75);
const upto = rollUp(FILE, { to: "2026-08-31" });
eq("…and everything before it", upto.labourHours, 6.5);
eq("the two halves are the whole", upto.labourHours + half.labourHours, all.labourHours);

console.log("\nAn empty file still adds up");
const none = rollUp({ unit: U("DT-999"), meter: {}, hours: [], parts: [], services: [],
  defects: [], orders: [], tires: [], pmDue: [], odos: [], history: [] });
eq("no hours", none.labourHours, 0);
eq("no mechanics", none.mechanics.length, 0);
eq("no money", none.partsCost, 0);
ok("and nothing major is open on it", !none.majorDefect);
eq("no tires, no pairs", none.mismatchedPairs.length, 0);

console.log(failed ? `\n${failed} failed\n` : "\nAll good\n");
process.exit(failed ? 1 : 0);
