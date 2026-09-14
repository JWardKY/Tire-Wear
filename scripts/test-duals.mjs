/* Duals that do not match.
   ─────────────────────────────────────────────────────────────────
   Two tires on the same end of an axle carry the load together, and
   they only share it if they are close to the same size. Put a 27/32
   beside a 15/32 and the deep one takes the weight, runs hot and
   scrubs — so the shop buys two tires instead of none. DT-881's 4R end
   was exactly that, and nothing on the screen said so.

   The flag has to be right in both directions. A pair it misses is the
   thing this exists to catch. A pair it invents — a steer "paired" with
   something, a half-measured truck, a rounding artefact — is a flag
   people learn to scroll past, which is the same as not having one.

   Needs nothing: no database, no browser.
     node scripts/test-duals.mjs
*/
import {
  wheelsFrom, dualPairs, dualMismatches, mismatchedWheels, sayMismatch, DUAL_LIMIT,
} from "../src/dualMatch.js";

let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) console.log(`  ok   ${name}`);
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name, got, want) => ok(name, got === want, `got ${got}, wanted ${want}`);

/* A 12-tire dump: steers, a super-single pusher, and two tandem axles
   of duals. */
const DUMP12 = ["1L", "1R", "2L", "2R",
  "3LI", "3LO", "3RI", "3RO", "4LI", "4LO", "4RI", "4RO"];

console.log("\nReading the wheels off the positions");

const w = wheelsFrom(DUMP12);
eq("every position is read", w.length, 12);
eq("an outer knows its axle", w.find((x) => x.id === "4RO").axle, 4);
eq("…and its side", w.find((x) => x.id === "4RO").side, "R");
eq("…and that it is the outer", w.find((x) => x.id === "4RO").slot, "O");
eq("a steer is a single", w.find((x) => x.id === "1L").slot, "S");
eq("lower case is read the same", wheelsFrom(["4ro"])[0].id, "4RO");
eq("a two-digit axle is read", wheelsFrom(["10LI"])[0].axle, 10);
eq("nonsense is dropped, not guessed at", wheelsFrom(["spare", "", null, "4X"]).length, 0);

console.log("\nWhat counts as a pair");

const pairs = dualPairs(w);
eq("four pairs on a 12-tire dump", pairs.length, 4);
eq("the ends are named", pairs.map((p) => p.end).sort().join(","), "3L,3R,4L,4R");
ok("a pair has both halves", pairs.every((p) => p.inner && p.outer));

/* The steers and the super-single pusher have no partner. Pairing them
   with anything would flag a truck that is perfectly fine. */
ok("no steer is in a pair",
  !pairs.some((p) => [p.inner, p.outer].some((x) => /^1/.test(x))));
ok("no super single is in a pair",
  !pairs.some((p) => [p.inner, p.outer].some((x) => /^2[LR]$/.test(x))));

/* Opposite ends of the same axle are not side by side. 4LO and 4RO are
   ten feet apart and have no reason to match. */
const cross = dualPairs(wheelsFrom(["4LO", "4RO"]));
eq("the two sides of an axle are not a pair", cross.length, 0);

/* Half a config is not a pair either. */
eq("an inner with no outer is not a pair", dualPairs(wheelsFrom(["3LI"])).length, 0);

/* A super single and an inner recorded on the same end is contradictory
   data — somebody mis-keyed a position. Pairing them would invent a
   mismatch out of a mistake. */
eq("a super single and an inner on one end is not a pair",
  dualPairs(wheelsFrom(["2L", "2LI"])).length, 0);
eq("…nor a super single and an outer",
  dualPairs(wheelsFrom(["2R", "2RO"])).length, 0);

console.log("\nThe pair that is out of step");

/* DT-881's 4R end, as it actually was. */
const DEPTHS = {
  "1L": 12, "1R": 12, "2L": 20, "2R": 20,
  "3LI": 22, "3LO": 22, "3RI": 18, "3RO": 18,
  "4LI": 24, "4LO": 24, "4RI": 27, "4RO": 15,
};
const at = (m) => (p) => (p in m ? m[p] : null);

const found = dualMismatches(w, at(DEPTHS));
eq("one pair is flagged", found.length, 1);
eq("…and it is the right end", found[0].end, "4R");
eq("…by the right amount", found[0].diff, 12);
eq("the shallow one is named", found[0].shallower, "4RO");
eq("…with its depth", found[0].shallowest, 15);
eq("the deep one is named", found[0].deeper, "4RI");
eq("…with its depth", found[0].deepest, 27);
ok("it reads as a sentence",
  sayMismatch(found[0]) === "4R is 12/32 apart — 4RO at 15/32 beside 4RI at 27/32",
  sayMismatch(found[0]));

const marked = mismatchedWheels(found);
ok("both wheels of the pair are marked", marked.has("4RI") && marked.has("4RO"));
eq("…and only those two", marked.size, 2);

console.log("\nWhere the line is");

/* Four is the number, and it is "more than four" — a pair exactly four
   apart is within spec and must not be flagged. */
eq("the default is four", DUAL_LIMIT, 4);
const gap = (d) => dualMismatches(wheelsFrom(["4RI", "4RO"]),
  at({ "4RI": 20, "4RO": 20 - d })).length;
eq("three apart is fine", gap(3), 0);
eq("exactly four is fine", gap(4), 0);
eq("four and a half is flagged", gap(4.5), 1);
eq("five is flagged", gap(5), 1);

/* The half-32nds a gauge actually reads must not produce a gap that is
   0.30000000000000004 wide. */
const half = dualMismatches(wheelsFrom(["4RI", "4RO"]), at({ "4RI": 20.3, "4RO": 15.1 }));
eq("a fractional gap is a clean number", half[0].diff, 5.2);

/* A shop that wants them matched dead on can say so. */
eq("a limit of zero flags any difference",
  dualMismatches(wheelsFrom(["4RI", "4RO"]), at({ "4RI": 20, "4RO": 19.5 }), 0).length, 1);
eq("…but not two that are the same",
  dualMismatches(wheelsFrom(["4RI", "4RO"]), at({ "4RI": 20, "4RO": 20 }), 0).length, 0);
eq("a limit of nothing falls back to four",
  dualMismatches(wheelsFrom(["4RI", "4RO"]), at({ "4RI": 20, "4RO": 16.5 }), undefined).length, 0);

console.log("\nThe half-measured truck");

/* A pair with one reading has nothing to compare against. Flagging it
   would fire on every truck somebody has started measuring and not
   finished, which is how a flag gets ignored. */
eq("one side unmeasured is not a mismatch",
  dualMismatches(wheelsFrom(["4RI", "4RO"]), at({ "4RI": 27 })).length, 0);
eq("neither side measured is not a mismatch",
  dualMismatches(wheelsFrom(["4RI", "4RO"]), () => null).length, 0);
eq("a bare wheel with no tire is not a mismatch",
  dualMismatches(wheelsFrom(["4RI", "4RO"]), at({ "4RI": 27, "4RO": null })).length, 0);
/* Zero is a reading, not a missing one. A tire worn to nothing beside a
   new one is the worst case there is. */
eq("zero is a reading",
  dualMismatches(wheelsFrom(["4RI", "4RO"]), at({ "4RI": 27, "4RO": 0 })).length, 1);

console.log("\nA truck with more than one");

const BAD = { "3LI": 26, "3LO": 14, "3RI": 20, "3RO": 19,
              "4LI": 25, "4LO": 18, "4RI": 27, "4RO": 15 };
const many = dualMismatches(wheelsFrom(Object.keys(BAD)), at(BAD));
eq("three pairs flagged, not four", many.length, 3);
eq("worst first", many[0].diff, 12);
eq("…then the next", many[1].diff, 12);
eq("…then the smallest", many[2].diff, 7);
ok("the pair within spec is not in the list", !many.some((m) => m.end === "3R"));
eq("every flagged wheel is marked", mismatchedWheels(many).size, 6);

/* Ties are broken by the end so the list does not shuffle between
   renders on a truck with two equally bad pairs. */
eq("a tie is ordered by the end", many.slice(0, 2).map((m) => m.end).join(","), "3L,4R");

console.log(failed ? `\n${failed} failed\n` : "\nAll good\n");
process.exit(failed ? 1 : 0);
