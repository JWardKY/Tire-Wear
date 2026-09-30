/* What a day was spent on, in one cell.
   ─────────────────────────────────────────────────────────────────
   The card board said "6 lines" and stopped there. Whether that was
   six trucks or six goes at the same one meant opening the card, and
   a supervisor approving thirteen of them does not open thirteen
   cards.

   A real day runs to a dozen units — Donald Bradley's 29 September
   carries five trucks and two kinds of shop time — so a column sized
   for the worst day would make every other row unreadable. The first
   few are shown, the rest are counted, and the whole list is on the
   title attribute for the once somebody needs it.

   Needs nothing: no database, no browser.
*/
import { summarise, sayList } from "../src/cardLists.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

/* Donald Bradley's 29 September, in the order the view hands it over —
   by hours, so the first name is where the day actually went. */
const DAY = ["DT-808", "Shop cleanup / housekeeping", "DT-885", "DT-887",
             "DT-896", "Other shop time"];

console.log("a day with more on it than fits:");
const s = summarise(DAY, 3);
ok("three are shown", s.shown.length === 3, s.shown);
ok("…the first three, in the order given", s.shown.join("|") === "DT-808|Shop cleanup / housekeeping|DT-885", s.shown);
ok("the rest are counted", s.more === 3, s.more);
ok("…and the whole list is still there to hover",
  s.full === DAY.join(", "), s.full);
ok("it is not empty", !s.empty);

console.log("\nand as a sentence:");
ok("first three then the count",
  sayList(DAY, 3) === "DT-808, Shop cleanup / housekeeping, DT-885 +3 more",
  sayList(DAY, 3));

console.log("\na day that fits says nothing about more:");
ok("exactly at the limit", summarise(["a", "b", "c"], 3).more === 0);
ok("…and no tail on the sentence", sayList(["a", "b", "c"], 3) === "a, b, c");
ok("under the limit", summarise(["DT-890"], 3).more === 0);
ok("…reads as just the one", sayList(["DT-890"], 3) === "DT-890");
/* One over is the case a naive slice gets wrong. */
ok("one over the limit counts one", summarise(["a", "b", "c", "d"], 3).more === 1);
ok("…and says 'more', not 'mores'", sayList(["a", "b", "c", "d"], 3) === "a, b, c +1 more");

console.log("\na card with nothing booked to it:");
/* Seven cards on the board right now are somebody still on the clock
   with no lines yet. The cell has to be a dash, not an empty box and
   not "+0 more". */
for (const [what, v] of [["an empty list", []], ["null", null], ["undefined", undefined]]) {
  const e = summarise(v, 3);
  ok(`${what} is empty`, e.empty && e.shown.length === 0 && e.more === 0, e);
  ok(`…and says nothing`, sayList(v, 3) === "", sayList(v, 3));
}

console.log("\nrubbish in a list does not become a name:");
/* A blank cost code is a real row in this database — uncoded_lines
   counts them — and " " rendered in the cell reads as a unit whose
   name nobody can see. */
ok("blanks are dropped", summarise(["DT-890", "", "  ", "DT-891"], 3).shown.join("|") === "DT-890|DT-891");
ok("nulls are dropped", summarise(["DT-890", null, "DT-891"], 3).shown.length === 2);
ok("…and they do not count towards the tail",
  summarise(["DT-890", "", null, "DT-891"], 3).more === 0,
  summarise(["DT-890", "", null, "DT-891"], 3));
ok("a list of nothing but blanks is empty", summarise(["", "  ", null], 3).empty);
ok("surrounding space is trimmed", summarise([" DT-890 "], 3).shown[0] === "DT-890");
/* Cost codes come back as text but a number is a number. */
ok("a numeric code is still a name", summarise([880, 885], 3).shown.join("|") === "880|885");

console.log("\nthe limit itself:");
ok("a different limit is honoured", summarise(DAY, 2).shown.length === 2);
ok("…and the count follows it", summarise(DAY, 2).more === 4);
ok("the default is three", summarise(DAY).shown.length === 3);
/* Guarding these because a limit arriving from a caller is a limit
   that can arrive wrong, and a negative slice takes from the end. */
ok("zero shows none and counts all",
  summarise(DAY, 0).shown.length === 0 && summarise(DAY, 0).more === DAY.length,
  summarise(DAY, 0));
ok("a negative limit does not take from the end",
  summarise(DAY, -2).shown.length === 0 && summarise(DAY, -2).more === DAY.length,
  summarise(DAY, -2));
ok("a limit past the end shows everything, counts none",
  summarise(DAY, 99).shown.length === DAY.length && summarise(DAY, 99).more === 0);

console.log("\nthe original list is left alone:");
const before = DAY.slice();
summarise(DAY, 3); sayList(DAY, 3);
ok("nothing was sorted or spliced underneath the caller",
  DAY.join("|") === before.join("|"), DAY);

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
