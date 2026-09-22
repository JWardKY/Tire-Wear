/* Tread numbers that cannot be right.
   ─────────────────────────────────────────────────────────────────
   DT-899 came back from a walk-around with four right-side wheels
   showing a dash in the miles-per-32nd column. The obvious reading of
   a dash is "nobody entered this". Every one of them had been gauged
   twice.

   What the numbers actually said:

     3RI  mounted 17.0  →  17.0 on 09/11  →  17.0 on 09/22
     3RO  mounted 16.0  →  16.0           →  16.0
     4RI  mounted 10.0  →  11.0           →  10.0
     4RO  mounted 12.0  →  10.0           →  14.0

   Two different faults wearing the same blank. 4RO reads four
   thirty-seconds deeper than it did eleven days earlier, which cannot
   happen. The other three have simply not worn in 4,138 miles, so
   there is nothing to divide the miles by and no rate to print.

   Both deserved a sentence and got a dash. This file holds the rules
   for producing that sentence, and the line between a number that is
   wrong and a gauge that was held differently.

   Needs nothing: no database, no browser.
*/
import {
  checkDepth, checkMount, risesIn, worstRise, ceilingFrom,
  sayTyped, sayMount, sayRise, whyNoRate, GAUGE_SLOP,
} from "../src/treadCheck.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

/* DT-899 as the database actually holds it. */
const M = (d, date) => ({ odo: 95003, d, date, mount: true });
const R = (d, odo, date) => ({ odo, d, date });
const DT899 = {
  "3LI": [M(16, "2026-08-25"), R(16, 97757, "2026-09-11"), R(12, 99141, "2026-09-22")],
  "3LO": [M(16.5, "2026-08-25"), R(17, 97757, "2026-09-11"), R(14, 99141, "2026-09-22")],
  "3RI": [M(17, "2026-08-25"), R(17, 97757, "2026-09-11"), R(17, 99141, "2026-09-22")],
  "3RO": [M(16, "2026-08-25"), R(16, 97757, "2026-09-11"), R(16, 99141, "2026-09-22")],
  "4LI": [M(13, "2026-08-25"), R(14, 97757, "2026-09-11"), R(12, 99141, "2026-09-22")],
  "4LO": [M(14, "2026-08-25"), R(14, 97757, "2026-09-11"), R(11, 99141, "2026-09-22")],
  "4RI": [M(10, "2026-08-25"), R(11, 97757, "2026-09-11"), R(10, 99141, "2026-09-22")],
  "4RO": [M(12, "2026-08-25"), R(10, 97757, "2026-09-11"), R(14, 99141, "2026-09-22")],
};

console.log("the wheel that cannot be right:");
const r4RO = worstRise(DT899["4RO"]);
ok("4RO is flagged", !!r4RO);
ok("…by the four thirty-seconds it gained", r4RO?.by === 4, r4RO);
ok("…against the reading it contradicts, not the mount",
   r4RO?.was === 10 && r4RO?.when === "2026-09-11" && r4RO?.fromMount === false, r4RO);
const said = sayRise("4RO", r4RO);
ok("…and says so in a sentence with both dates",
   /4RO read 10\/32 on 09\/11\/26, then 14\/32 on 09\/22\/26/.test(said), said);

console.log("\nand the ones that are only the gauge:");
/* 3LO gained half a 32nd and 4LI and 4RI gained one. That is where
   somebody put the gauge, not a wrong number, and flagging it would
   fire on half the fleet and teach everybody to ignore the flag. */
for (const p of ["3LO", "4LI", "4RI", "3LI", "3RI", "3RO", "4LO"]) {
  ok(`${p} is left alone`, worstRise(DT899[p]) === null, worstRise(DT899[p]));
}
ok("a 32nd exactly is the gauge", GAUGE_SLOP === 1);
ok("…so a 32nd is allowed",
   worstRise([M(10, "a"), R(11, 2, "b")]) === null);
ok("…and a hair over is not",
   worstRise([M(10, "a"), R(11.5, 2, "b")])?.by === 1.5);

console.log("\nwhy each wheel has no rate:");
const st = (pos, over) => whyNoRate({ miPer32: null, depth: 1, miles: 4138, pts: DT899[pos], ...over });
ok("3RI says it has not worn, and over how far",
   st("3RI").kind === "no-wear" && /no wear measured in 4,138 mi/.test(st("3RI").say), st("3RI").say);
ok("3RO the same", st("3RO").kind === "no-wear");
ok("4RI the same — its rise is inside the gauge", st("4RI").kind === "no-wear", st("4RI"));
ok("4RO says it reads deeper instead",
   st("4RO").kind === "grew" && /reads 4\/32 deeper than it did on 09\/11\/26/.test(st("4RO").say),
   st("4RO").say);
/* Against the mount the date is the day it went on, and "deeper than
   it did on 09/10" reads as though somebody gauged it that day. */
ok("a rise over the mount says so in words, not with the mount date",
   /deeper than when it was mounted/.test(
     whyNoRate({ miPer32: null, depth: 15, miles: 1384,
       pts: [{ odo: 97757, d: 11, date: "2026-09-10", mount: true },
             { odo: 99141, d: 15, date: "2026-09-22" }] }).say),
   whyNoRate({ miPer32: null, depth: 15, miles: 1384,
     pts: [{ odo: 97757, d: 11, date: "2026-09-10", mount: true },
           { odo: 99141, d: 15, date: "2026-09-22" }] }).say);
ok("a tire with a rate is not explained at all",
   whyNoRate({ miPer32: 1035, depth: 12, miles: 4138, pts: DT899["3LI"] }) === null);
ok("a tire nobody has gauged says so",
   whyNoRate({ miPer32: null, depth: null, miles: 0, pts: [] })?.kind === "unmeasured");
ok("a tire that has not turned a wheel says that",
   whyNoRate({ miPer32: null, depth: 15, miles: 0, pts: [M(15, "a")] })?.kind === "no-miles",
   whyNoRate({ miPer32: null, depth: 15, miles: 0, pts: [M(15, "a")] }));
ok("nothing at all is nothing", whyNoRate(null) === null);
/* The distinction the dash lost: not measured, versus measured and
   unchanged. They call for opposite actions. */
ok("unmeasured and no-wear never read the same",
   whyNoRate({ miPer32: null, depth: null, miles: 0, pts: [] }).say
   !== st("3RI").say);

console.log("\ntyping into the form:");
const before = DT899["4RO"].slice(0, 2);        // mount 12, then 10 on 09/11
ok("14 is refused", !!checkDepth(14, before));
ok("…naming the 10 it contradicts", checkDepth(14, before)?.was === 10);
ok("…in words, with the date", /Deeper than the 10\/32 it read on 09\/11\/26\./
   .test(sayTyped(checkDepth(14, before))), sayTyped(checkDepth(14, before)));
ok("11 is the gauge and passes", checkDepth(11, before) === null);
ok("10 passes", checkDepth(10, before) === null);
ok("9 passes", checkDepth(9, before) === null);
ok("0 passes — a tire worn to nothing is a reading",
   checkDepth(0, before) === null);
ok("an empty box is not a reading", checkDepth("", before) === null);
ok("…nor is a blank one", checkDepth(null, before) === null && checkDepth(undefined, before) === null);
ok("…nor is something that is not a number", checkDepth("abc", before) === null);
ok("a tire with no history cannot contradict anything",
   checkDepth(99, []) === null && checkDepth(99, null) === null);
/* Against the mount alone the sentence has to say so, or it reads as
   though somebody gauged it. */
ok("contradicting the mount says it was the mount",
   /Deeper than the 11\/32 it was mounted at on 09\/10\/26\./
     .test(sayTyped(checkDepth(15, [M(11, "2026-09-10")]))),
   sayTyped(checkDepth(15, [M(11, "2026-09-10")])));

console.log("\nthe ceiling is the shallowest so far, not the last:");
/* 4RO's own history proves why. After 12 → 10 → 14, the next reading
   still cannot be more than 10. Taking the LAST point would let 13
   through on a tire that measured 10 a fortnight ago. */
ok("the whole of 4RO's history binds it", ceilingFrom(DT899["4RO"])?.d === 10);
ok("…so 13 is still refused after the bad 14", !!checkDepth(13, DT899["4RO"]));
ok("…and it names the 10, not the 14", checkDepth(13, DT899["4RO"])?.was === 10);
ok("ties name where the figure first appeared",
   ceilingFrom([M(16, "2026-08-25"), R(16, 97757, "2026-09-11")])?.mount === true);

console.log("\nevery step is found, worst first:");
/* 20 mounted, up to 22, down to 14, back up to 20: two steps the wrong
   way, the later one the bigger. */
const messy = [M(20, "a"), R(22, 2, "b"), R(14, 3, "c"), R(20, 4, "d")];
const all = risesIn(messy);
ok("both rises are found", all.length === 2, all.map((x) => x.by));
ok("…the worst first, not the first found",
   all[0].by === 6 && all[1].by === 2, all.map((x) => x.by));
ok("…and the worst is measured from the 14, not the 20",
   all[0].was === 14 && all[0].now === 20, all[0]);

/* The step that only shows against the shallowest figure, never
   against the one before it: 14, then 15 which is the gauge, then 15.5
   which is a 32nd and a half above the 14. Comparing each point with
   its predecessor finds nothing here. */
const creep = [M(20, "a"), R(14, 2, "b"), R(15, 3, "c"), R(15.5, 4, "d")];
const crept = risesIn(creep);
ok("a drift back up past the shallowest reading is caught",
   crept.length === 1 && crept[0].by === 1.5, crept);
ok("…measured from the 14, which is not the point before it",
   crept[0]?.was === 14 && crept[0]?.when === "b", crept[0]);

console.log("\nthe mount depth, when the readings say it is wrong:");
/* The other half of DT-899: a mount figure keyed too shallow means the
   tire never shows wear against it, and the wheel goes blank. */
const gauged = [R(15, 99141, "2026-09-22")];
ok("11 under a 15 that was gauged is flagged", !!checkMount(11, gauged));
ok("…by four", checkMount(11, gauged)?.by === 4);
ok("…and says which reading and when",
   /gauged 15\/32 on 09\/22\/26, deeper than the 11\/32 here/
     .test(sayMount(checkMount(11, gauged))), sayMount(checkMount(11, gauged)));
ok("15 is fine", checkMount(15, gauged) === null);
ok("16 is fine — a tire may wear", checkMount(16, gauged) === null);
ok("14 is the gauge and passes", checkMount(14, gauged) === null);
ok("a tire nobody has gauged cannot contradict the mount",
   checkMount(11, []) === null);
ok("an empty box says nothing", checkMount("", gauged) === null);
ok("the deepest reading is the one named, not the first",
   checkMount(10, [R(13, 1, "a"), R(17, 2, "b"), R(12, 3, "c")])?.read === 17,
   checkMount(10, [R(13, 1, "a"), R(17, 2, "b"), R(12, 3, "c")]));

console.log("\nrubbish in the point list does not become a reading:");
/* A tire read to nothing IS a reading, so zero must survive; a missing
   depth is not, and must not be treated as one. */
/* Number(null) is 0, so without an explicit guard a point with no
   depth reads as a tire worn to nothing, becomes the shallowest figure
   on record, and makes every later reading look impossible. */
ok("a null depth is dropped, not read as zero",
   ceilingFrom([M(16, "a"), { odo: 2, d: null, date: "b" }])?.d === 16,
   ceilingFrom([M(16, "a"), { odo: 2, d: null, date: "b" }]));
ok("…and an empty one", ceilingFrom([M(16, "a"), { odo: 2, d: "", date: "b" }])?.d === 16);
ok("…and a missing one", ceilingFrom([M(16, "a"), { odo: 2, date: "b" }])?.d === 16);
ok("…and none of them flags the next reading",
   checkDepth(15, [M(16, "a"), { odo: 2, d: null, date: "b" }]) === null);
ok("…and a zero is kept", ceilingFrom([M(16, "a"), R(0, 2, "b")])?.d === 0);
ok("an empty history has no ceiling", ceilingFrom([]) === null && ceilingFrom(null) === null);

console.log("\nthe sentences say nothing a mechanic would not:");
for (const [what, text] of [
  ["a rise", sayRise("4RO", r4RO)],
  ["a typed reading", sayTyped(checkDepth(14, before))],
  ["a mount depth", sayMount(checkMount(11, gauged))],
  ["no wear", st("3RI").say],
]) {
  ok(`${what} carries no jargon`,
     !/null|undefined|NaN|32nds|object|\[/.test(text), text);
}
ok("nothing in, nothing out",
   sayRise("4RO", null) === "" && sayTyped(null) === "" && sayMount(null) === "");

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
