/* A shop day, written up.
   ─────────────────────────────────────────────────────────────────
   The write-up itself is a model's work and cannot be asserted on.
   What CAN be asserted on is everything the model is given — and that
   is the half that decides whether the result is true.

   The fixture is Wednesday 10/07 as it really was: 23.07 hr, 11
   entries, four mechanics, eleven of those hours on one rear
   differential. If the facts block is right about that day, the
   write-up has nothing to invent from.

   What is actually being protected here:

     - An entry whose mechanic wrote nothing must say so out loud.
       Half this shop's lines carry a write-up and half carry none, and
       a blank that reaches the model unmarked is a blank the model
       will fill in.
     - Figures are quoted, never rounded. 1.89 is the number somebody
       checks the summary against.
     - A twenty-minute day and an eight-hour day are told apart before
       anything is written, because padding is where invention starts.

   Needs nothing: no database, no browser, no API key.
*/
import { hoursOf, unitOf, toldOf, whyNothingToWrite, byMechanic, byUnit,
  bigJobs, BIG_SHARE, factsFor, lengthFor, systemPrompt } from "../src/daySummary.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`${v ? "  ok  " : "  !!  "}${l}${!v && got !== undefined
    ? ` — got ${JSON.stringify(got)}` : ""}`);
};

const e = (mechanic, unit, hours, code, told, extra = {}) => ({
  mechanic, unit, hours, costCode: code, costCodeName: extra.codeName || "",
  workTypes: extra.types || [], workOrder: extra.wo || "",
  workPerformed: told, note: extra.note || "", ...extra,
});

/* Wednesday 10/07, as the cards had it. */
const DAY = [
  e("Joshua Sawyers", "DT-866", 4.73, "825", "Installed the new rear differential and driveline. Still waiting on a yoke nut that is on national backorder."),
  e("Joshua Sawyers", "DT-861", 2.25, "880", "Installed the transmission and clutch linkage, and torqued the bell housing bolts."),
  e("Joshua Sawyers", "DT-1803", 1.50, "878", "4RO was at 30 psi, replaced with a new one and swapped 4RO and 4RI. Found a retread separation on a sidewall and replaced that tire with a better used one."),
  e("Joshua Sawyers", "DT-874", 1.04, "830", "Replaced the middle cab light."),
  e("Dylan Barnes", "DT-866", 5.00, "825", "Worked the rear end job as far as he could and is waiting on parts."),
  e("Dylan Barnes", "DT-861", 3.33, "880", "Installed the rebuilt transmission's bell housing bolts."),
  e("Dylan Barnes", "Shop cleanup", 0.22, "SHOP-CF", ""),
  e("Nick Shifflet", "DT-866", 1.50, "825", "Took the old differential back for warranty."),
  e("Nick Shifflet", "DT-861", 1.50, "880", "Picked up the rebuilt transmission."),
  e("Shade Means", "DT-884", 1.50, "878", "Replaced 4RO and 4RI and updated both the tread depth site and Conti Connect."),
  e("Shade Means", "DT-884", 0.50, "830", "Replaced the driver side low beam."),
];

console.log("── adding the day up ──");
ok("the hours are the entries, summed", hoursOf(DAY) === 23.07, hoursOf(DAY));
/* This day's eleven figures happen to sum exactly, so they do NOT
   test the rounding — a fixture that passes either way proves
   nothing. Two tenths of an hour do produce the error, and a headline
   reading 0.30000000000000004 hr would end anybody's trust in the
   rest of it. */
ok("…to the hundredth, not to fifteen decimal places",
  hoursOf([{ hours: 0.1 }, { hours: 0.2 }]) === 0.3,
  hoursOf([{ hours: 0.1 }, { hours: 0.2 }]));
ok("…and the same on a mechanic's own total",
  byMechanic([{ mechanic: "A", hours: 0.1 }, { mechanic: "A", hours: 0.2 }])[0].hours === 0.3,
  byMechanic([{ mechanic: "A", hours: 0.1 }, { mechanic: "A", hours: 0.2 }])[0].hours);
ok("an empty day adds to nought, not NaN", hoursOf([]) === 0 && hoursOf() === 0);

console.log("\n── nothing to write about ──");
/* A Sunday and a card somebody still owes are different things and
   must read differently. */
ok("a day nobody worked says so", /Nothing was booked/.test(whyNothingToWrite([])),
  whyNothingToWrite([]));
ok("…and a day somebody clocked but never booked says THAT instead",
  /clock ran/.test(whyNothingToWrite([], { clocked: 9.5 })),
  whyNothingToWrite([], { clocked: 9.5 }));
ok("a day with work in it is not 'nothing'", whyNothingToWrite(DAY) === "");

console.log("\n── the two ways a day gets read ──");
const people = byMechanic(DAY);
ok("four mechanics", people.length === 4, people.map((p) => p.mechanic));
ok("…longest day first", people[0].mechanic === "Joshua Sawyers", people[0].mechanic);
ok("…with their own hours added up", people[0].hours === 9.52, people[0].hours);
ok("…and Dylan's 8.55", people[1].hours === 8.55, people[1].hours);
ok("…and every entry kept", people.reduce((a, p) => a + p.lines.length, 0) === DAY.length);
/* Shade's two DT-884 lines are one truck, and a reader thinks of them
   that way even though they are two cost codes. */
const units = byUnit(DAY);
ok("DT-884's two lines are one truck",
  units.find((u) => u.unit === "DT-884")?.hours === 2,
  units.find((u) => u.unit === "DT-884"));
ok("…carrying both of its codes",
  (units.find((u) => u.unit === "DT-884")?.codes || []).sort().join() === "830,878",
  units.find((u) => u.unit === "DT-884")?.codes);
ok("DT-866 is the biggest job", units[0].unit === "DT-866" && units[0].hours === 11.23,
  [units[0].unit, units[0].hours]);
ok("…worked by three people", units[0].who.length === 3, units[0].who);

console.log("\n── where the day went ──");
const big = bigJobs(DAY);
ok("the two trucks that carried the day", big.length === 2,
  big.map((g) => `${g.unit} ${g.hours}`));
ok("…DT-866 and DT-861", big.map((g) => g.unit).sort().join() === "DT-861,DT-866",
  big.map((g) => g.unit));
/* A day spread thin across a dozen trucks has no story, and naming an
   arbitrary three would invent one. */
const THIN = Array.from({ length: 12 }, (_, i) =>
  e("A", `DT-${800 + i}`, 1, "873", "did a thing"));
ok("a day spread thin has no headline job", bigJobs(THIN).length === 0,
  bigJobs(THIN).map((g) => g.unit));
/* …and a day that WAS one job says so. */
ok("a single-job day is all one job",
  bigJobs([e("A", "DT-866", 8, "825", "rear end")]).length === 1);
ok(`${BIG_SHARE} is the share`, BIG_SHARE > 0 && BIG_SHARE < 0.5, BIG_SHARE);

console.log("\n── what the write-up is given ──");
const facts = factsFor("2026-10-07", DAY, { clocked: 24.5, mechanics: 4 });
ok("the date", /DATE: 2026-10-07/.test(facts));
ok("the headline figures", /23\.07 hr across 11 entries by 4 mechanics/.test(facts),
  (facts.match(/TOTAL BOOKED[^\n]*/) || [""])[0]);
ok("what was clocked, beside what was booked", /TOTAL CLOCKED: 24\.50 hr/.test(facts),
  (facts.match(/TOTAL CLOCKED[^\n]*/) || [""])[0]);
/* Every entry, not a sample. A summary written from nine of eleven
   lines is wrong about the day and cannot be told so. */
ok("every entry is in there",
  DAY.every((x) => facts.includes(x.workPerformed || "(nothing)")),
  DAY.filter((x) => !facts.includes(x.workPerformed || "(nothing)")).map((x) => x.unit));
ok("…each with its own hours", /DT-866 · 4\.73 hr/.test(facts),
  (facts.match(/DT-866[^\n]*/) || [""])[0]);
/* 1.89-style precision is the whole point: it is what somebody checks
   the summary against. */
ok("…quoted, not rounded", /DT-874 · 1\.04 hr/.test(facts) && !/1 hr/.test(facts),
  (facts.match(/DT-874[^\n]*/) || [""])[0]);
ok("…and its cost code", /878/.test(facts) && /SHOP-CF/.test(facts));

/* THE one that matters. Dylan's shop cleanup line has no write-up.
   If that reaches the model as a blank rather than as "(nothing)", it
   is an invitation to describe work nobody recorded. */
ok("a line whose mechanic wrote nothing says so, out loud",
  /Shop cleanup[\s\S]{0,120}wrote: \(nothing\)/.test(facts),
  (facts.match(/Shop cleanup[\s\S]{0,160}/) || [""])[0]);
ok("…and a line that has words quotes them exactly",
  facts.includes('wrote: "Replaced the middle cab light."'));
ok("the big jobs are named with their share",
  /DT-866 — 11\.23 hr \(49% of the day\)/.test(facts),
  (facts.match(/DT-866 — [^\n]*/) || [""])[0]);

console.log("\n── an eight-hour day and a twenty-minute one ──");
/* "Could be an 8 hour shift or a 20 minute shift." Padding a thin day
   to look like a full one is exactly where a model starts inventing. */
const TINY = [e("Shade Means", "DT-884", 0.33, "878", "Aired up 4RO.")];
ok("a one-job day asks for a few sentences", lengthFor(TINY).words <= 100,
  lengthFor(TINY));
ok("…and says so in words", /sentence/.test(lengthFor(TINY).say), lengthFor(TINY).say);
ok("a full day asks for more", lengthFor(DAY).words >= 400, lengthFor(DAY));
ok("…but is still capped", lengthFor(THIN.concat(THIN)).words <= 800,
  lengthFor(THIN.concat(THIN)));
ok("the ask always grows with the day",
  lengthFor(TINY).words < lengthFor(DAY).words,
  [lengthFor(TINY).words, lengthFor(DAY).words]);

/* The tiny day still gets the full treatment of facts — short is not
   the same as thin. */
const tinyFacts = factsFor("2026-10-07", TINY);
ok("a twenty-minute day still carries its one entry",
  /0\.33 hr/.test(tinyFacts) && /Aired up 4RO/.test(tinyFacts), tinyFacts);
ok("…and does not claim mechanics it does not have",
  /by 1 mechanic\b/.test(tinyFacts), (tinyFacts.match(/TOTAL BOOKED[^\n]*/) || [""])[0]);

console.log("\n── what it is told not to do ──");
const sys = systemPrompt();
ok("use only what you are given", /Use only what you are given/.test(sys));
ok("…and nothing about a line that says nothing",
  /wrote: \(nothing\)/.test(sys), sys.slice(0, 200));
ok("keep the numbers exactly", /1\.89 hr is 1\.89 hr/.test(sys));
/* The separation that keeps a flag from reading as a finding. */
ok("anything inferred goes under its own heading",
  /Worth checking/.test(sys) && /never as a statement of fact/.test(sys));
ok("…and the heading is left out when there is nothing to raise",
  /leave the heading out/.test(sys));
/* The instruction wraps across lines in the prompt, so the whitespace
   is collapsed before looking — a rule that only matched when it
   happened to fit on one line would pass by luck. */
ok("do not pad a short day", /Do\s+not\s+pad/.test(sys),
  (sys.match(/[^\n]*pad[^\n]*/) || [""])[0]);

console.log("\n── the odds and ends ──");
ok("a line against no truck keeps its label",
  unitOf({ unitLabel: "Parts run" }) === "Parts run");
ok("…and one against neither is not a blank",
  unitOf({}) === "Unassigned", unitOf({}));
ok("the equipment card's write-up wins over the plain note",
  toldOf({ workPerformed: "the real one", note: "the other" }) === "the real one");
ok("…but a note alone still counts", toldOf({ note: "only this" }) === "only this");
ok("…and neither is an empty string, not undefined", toldOf({}) === "");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
