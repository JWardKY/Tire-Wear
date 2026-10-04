/* A supervisor changing somebody else's hours.
   ─────────────────────────────────────────────────────────────────
   The Timecards board showed a gap it could only half fix: the
   punches were editable, the booked lines were not. So Joshua's 4.60
   clocked against 1.23 booked — three and a bit hours nobody could
   charge out — had no fix in the app at all.

   These are the rules for the other half: what makes a line writable,
   what the work log says about it, and what the gap becomes. The log
   sentence is tested as carefully as the arithmetic, because once a
   line is removed the sentence is the only record that it existed.

   Needs nothing: no database, no browser.
*/
import { whyNotSaveable, whyNotRemovable, whyNotAllowed, MAX_HOURS, MIN_REASON,
  sayLine, sayAdded, sayRemoved, sayEdited, changesBetween, unitOf,
  bookedOf, gapOf, sayGap, SETTLED } from "../src/cardEdit.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`${v ? "  ok  " : "  !!  "}${l}${!v && got !== undefined
    ? ` — got ${JSON.stringify(got)}` : ""}`);
};

const LINE = { date: "2026-10-03", vehId: "v1", unit: "DT-861", unitLabel: "",
  where: "shop", hours: 3.37, costCode: "873", workOrder: "WO-4412", note: "" };

console.log("── what stops a line being written ──");
ok("a good line is fine", whyNotSaveable(LINE) === "", whyNotSaveable(LINE));
/* Each of these is also a constraint in the database. The point of
   repeating it here is the sentence: a supervisor who gets "new row
   violates check constraint" learns nothing at all. */
ok("hours need a cost code", /cost code/.test(whyNotSaveable({ ...LINE, costCode: "" })),
  whyNotSaveable({ ...LINE, costCode: "" }));
ok("…and a cost code of spaces is not one",
  /cost code/.test(whyNotSaveable({ ...LINE, costCode: "   " })),
  whyNotSaveable({ ...LINE, costCode: "   " }));
ok("nought hours is not a line", whyNotSaveable({ ...LINE, hours: 0 }) !== "",
  whyNotSaveable({ ...LINE, hours: 0 }));
ok("…nor is a negative one", whyNotSaveable({ ...LINE, hours: -2 }) !== "");
ok("…nor a blank", whyNotSaveable({ ...LINE, hours: "" }) !== "");
ok("…nor something that is not a number",
  whyNotSaveable({ ...LINE, hours: "about three" }) !== "");
ok(`${MAX_HOURS} hours is the ceiling`,
  whyNotSaveable({ ...LINE, hours: MAX_HOURS }) === ""
  && whyNotSaveable({ ...LINE, hours: MAX_HOURS + 0.01 }) !== "",
  [whyNotSaveable({ ...LINE, hours: MAX_HOURS }),
   whyNotSaveable({ ...LINE, hours: MAX_HOURS + 0.01 })]);
/* The database refuses an hour with nowhere to go, and so does this. */
ok("an hour needs a unit or a label",
  whyNotSaveable({ ...LINE, vehId: "", unitLabel: "" }) !== "");
ok("…and a label alone is enough",
  whyNotSaveable({ ...LINE, vehId: "", unitLabel: "Parts run" }) === "",
  whyNotSaveable({ ...LINE, vehId: "", unitLabel: "Parts run" }));
ok("…but a label of spaces is not",
  whyNotSaveable({ ...LINE, vehId: "", unitLabel: "   " }) !== "");
ok("a line needs a date", whyNotSaveable({ ...LINE, date: "" }) !== "");

console.log("\n── taking hours off ──");
/* Adding and correcting take no reason — a supervisor fixing a typo
   will not write an essay and should not have to. Removal is the one
   that cannot be seen afterwards by reading the card. */
ok("removal needs a reason", whyNotRemovable("") !== "", whyNotRemovable(""));
ok("…and not a one-letter one", whyNotRemovable("x") !== "");
ok("…and whitespace is not a reason", whyNotRemovable("     ") !== "");
ok(`${MIN_REASON} characters is enough`, whyNotRemovable("dupe") === "",
  whyNotRemovable("dupe"));
ok("…and a real one certainly is", whyNotRemovable("booked twice") === "");

console.log("\n── nobody anonymous ──");
/* The badge is whoever last typed an email into this browser, and a
   shop tablet carries one badge for the whole building. A pay record
   needs the person. */
ok("a change needs a named person", whyNotAllowed("") !== "", whyNotAllowed(""));
ok("…and spaces are not a name", whyNotAllowed("   ") !== "");
ok("…a name is", whyNotAllowed("Jason Ward") === "");

console.log("\n── what the log says ──");
ok("a line reads as a sentence", sayLine(LINE) === "3.37 hr on DT-861 to 873 (WO-4412)",
  sayLine(LINE));
ok("…without a work order when there is none",
  sayLine({ ...LINE, workOrder: "" }) === "3.37 hr on DT-861 to 873",
  sayLine({ ...LINE, workOrder: "" }));
ok("…and the typed label when there is no truck",
  /on Parts run/.test(sayLine({ ...LINE, unit: "", unitLabel: "Parts run" })),
  sayLine({ ...LINE, unit: "", unitLabel: "Parts run" }));
ok("the unit is the truck when there is one", unitOf(LINE) === "DT-861", unitOf(LINE));
ok("…and the dash when there is neither", unitOf({}) === "—", unitOf({}));

ok("an addition names the mechanic and the day",
  sayAdded("Joshua Sawyers", LINE)
    === "Joshua Sawyers's 2026-10-03 card — 3.37 hr on DT-861 to 873 (WO-4412) added",
  sayAdded("Joshua Sawyers", LINE));
/* The reason is IN the sentence, not only in the detail, because the
   summary is what a person reads down a log. */
ok("a removal carries its reason in the sentence",
  /removed — booked twice$/.test(sayRemoved("Joshua Sawyers", LINE, "booked twice")),
  sayRemoved("Joshua Sawyers", LINE, "booked twice"));

console.log("\n── an edit says only what moved ──");
/* A sentence listing every field makes the one that changed
   impossible to find; one listing none is not a record of anything. */
const after = { ...LINE, hours: 4.6 };
ok("one field changed, one field reported", changesBetween(LINE, after).length === 1,
  changesBetween(LINE, after));
ok("…with both sides of it",
  sayEdited("Joshua Sawyers", LINE, after) === "Joshua Sawyers's 2026-10-03 card — "
    + "DT-861: hours 3.37 → 4.60",
  sayEdited("Joshua Sawyers", LINE, after));
ok("two changes, two reported",
  changesBetween(LINE, { ...LINE, hours: 4.6, costCode: "878" }).length === 2,
  changesBetween(LINE, { ...LINE, hours: 4.6, costCode: "878" }));
ok("…and both are named",
  /hours 3\.37 → 4\.60, cost code 873 → 878/.test(
    sayEdited("J", LINE, { ...LINE, hours: 4.6, costCode: "878" })),
  sayEdited("J", LINE, { ...LINE, hours: 4.6, costCode: "878" }));
/* Hours are compared as the figure the card carries. 3.37 and "3.37"
   are the same hours and must not read as a change — the form hands
   back strings, so an edit that touched nothing would otherwise log
   every field every time. */
ok("a number and its own text are not a change",
  changesBetween(LINE, { ...LINE, hours: "3.37" }).length === 0,
  changesBetween(LINE, { ...LINE, hours: "3.37" }));
ok("…and nothing changed says so plainly",
  /saved unchanged$/.test(sayEdited("J", LINE, { ...LINE })),
  sayEdited("J", LINE, { ...LINE }));
/* Moving a line to another day takes it off this card and onto
   another one. That is a legitimate fix and it has to be readable. */
ok("a line moved to another day is reported as such",
  /date 2026-10-03 → 2026-10-02/.test(
    sayEdited("J", LINE, { ...LINE, date: "2026-10-02" })),
  sayEdited("J", LINE, { ...LINE, date: "2026-10-02" }));
/* The unit is two fields wearing one hat. Swapping a truck for a
   typed label is a change to what the hours are against. */
ok("a truck swapped for a label is a change to the unit",
  changesBetween(LINE, { ...LINE, vehId: "", unit: "", unitLabel: "Parts run" })
    .some((c) => c.field === "unit"),
  changesBetween(LINE, { ...LINE, vehId: "", unit: "", unitLabel: "Parts run" }));

console.log("\n── the gap, as the dialog works it out ──");
const DAY = [{ hours: 1.23 }, { hours: 0.37 }];
ok("booked is the lines added up", bookedOf(DAY) === 1.6, bookedOf(DAY));
ok("…and nothing booked is nought, not NaN", bookedOf([]) === 0, bookedOf([]));
ok("…and a line with no hours does not poison the total",
  bookedOf([{ hours: 2 }, { hours: null }, { hours: "" }]) === 2,
  bookedOf([{ hours: 2 }, { hours: null }, { hours: "" }]));
/* Joshua's own card, which is what sent somebody looking. */
ok("the gap is the clock less the card", gapOf(4.6, [{ hours: 1.23 }]) === 3.37,
  gapOf(4.6, [{ hours: 1.23 }]));
/* Floating point: 4.6 - 1.23 is 3.3699999999999997 before rounding,
   and a dialog that disagreed with the board by a hundredth would be
   worse than one that showed no figure at all. */
ok("…to the hundredth the board uses",
  Number.isInteger(gapOf(4.6, [{ hours: 1.23 }]) * 100),
  gapOf(4.6, [{ hours: 1.23 }]) * 100);
ok("booking the missing hours closes it",
  gapOf(4.6, [{ hours: 1.23 }, { hours: 3.37 }]) === 0,
  gapOf(4.6, [{ hours: 1.23 }, { hours: 3.37 }]));
ok("a card with nothing booked is the whole shift",
  gapOf(8, []) === 8, gapOf(8, []));
ok("…and no clock at all reads negative, not nought",
  gapOf(0, [{ hours: 2 }]) === -2, gapOf(0, [{ hours: 2 }]));

console.log("\n── and what the gap means ──");
ok("a positive gap is time nobody can charge out",
  /not booked to anything/.test(sayGap(3.37)), sayGap(3.37));
/* The opposite problem, and it must not be described as the first
   one: a mechanic who booked more than he was clocked for. */
ok("a negative gap is its own problem",
  /more is booked than was clocked/.test(sayGap(-2)), sayGap(-2));
ok("…stated as a positive number", /^2\.00 hr more/.test(sayGap(-2)), sayGap(-2));
ok("nought is settled", /agree/.test(sayGap(0)), sayGap(0));
/* Real-time clocks round to the hundredth, so a card can land a
   hundredth out through nobody's fault. Tyler's -0.01 is not a gap. */
ok("…and so is a hundredth either way",
  /agree/.test(sayGap(0.009)) && /agree/.test(sayGap(-0.009)),
  [sayGap(0.009), sayGap(-0.009)]);
ok("a hundredth itself is not settled", !/agree/.test(sayGap(SETTLED)), sayGap(SETTLED));

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
