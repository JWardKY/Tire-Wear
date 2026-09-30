/* Which fleet a comparison is about.
   ─────────────────────────────────────────────────────────────────
   The Analysis page answers one question — which tire gets the most
   miles per 32nd — and that question only means anything inside a
   fleet.

   A dump truck grinds twelve tires through quarry entrances at 60,000
   lb on the drives. A pickup carries a toolbox. Averaged together the
   pickups lift every brand figure by an amount that has nothing to do
   with the tire and everything to do with what it is bolted to, and
   the ranking somebody orders off becomes a ranking of what the tire
   happened to be fitted to.

   That was academic while the app held 135 haul trucks. It stopped
   being academic when 76 light trucks and seven tankers arrived from
   Motive, at which point a third of the tires on the page would have
   been pickups.

   So: one fleet at a time, always, and no "everything" option —
   offering that is offering the bug back.

   Needs nothing: no database, no browser.
*/
import {
  GROUPS, DEFAULT_GROUP, groupOf, groupLabel, groupBlurb, groupsPresent, firstGroup,
} from "../src/fleetGroup.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

console.log("what each division is compared against:");
ok("DT is haul", groupOf("DT") === "haul");
ok("HT is haul — they haul the same material on the same roads", groupOf("HT") === "haul");
/* The whole point: a pickup is not compared with a dump truck. */
ok("LT is on its own", groupOf("LT") === "light");
ok("…and that is not haul", groupOf("LT") !== groupOf("DT"));
ok("EQ is on its own too", groupOf("EQ") === "equipment");
ok("OT is other", groupOf("OT") === "other");

console.log("\na division nobody recognises:");
/* Landing an unknown in with the dump trucks is exactly the mixing
   this exists to stop, so the fallback is "other", never haul. */
for (const d of ["ZZ", "", null, undefined, 0, "haul"])
  ok(`${JSON.stringify(d)} is other, not haul`, groupOf(d) === "other", groupOf(d));
ok("case does not matter", groupOf("lt") === "light" && groupOf("Dt") === "haul");

console.log("\nthere is no way to ask for all of them at once:");
/* The one option that must not exist. Any group that covered more than
   one kind of truck would put the average back. */
ok("no group claims every division",
  !GROUPS.some((g) => g.divisions.length > 2), GROUPS.map((g) => g.divisions));
ok("no division is in two groups at once", (() => {
  const seen = new Set();
  return GROUPS.every((g) => g.divisions.every((d) => !seen.has(d) && seen.add(d)));
})(), GROUPS.map((g) => g.divisions));
ok("every group has a label and a blurb",
  GROUPS.every((g) => groupLabel(g.key) && groupBlurb(g.key)));
ok("an unknown key says nothing rather than guessing",
  groupLabel("nope") === "" && groupBlurb("nope") === "");

console.log("\nwhich tabs to offer:");
const fleet = ["DT", "DT", "HT", "LT", "LT", "LT", "EQ"];
let p = groupsPresent(fleet);
ok("only the ones with something in them", p.length === 3, p.map((g) => g.key));
ok("…in page order, haul first", p.map((g) => g.key).join() === "haul,light,equipment", p.map((g) => g.key));
ok("…each with its count", p.find((g) => g.key === "haul").n === 3
  && p.find((g) => g.key === "light").n === 3
  && p.find((g) => g.key === "equipment").n === 1, p.map((g) => [g.key, g.n]));
ok("nothing at all offers nothing", groupsPresent([]).length === 0);
ok("one fleet offers one tab", groupsPresent(["LT", "LT"]).length === 1);

console.log("\nwhich one the page opens on:");
ok("haul when there is haul", firstGroup(fleet) === "haul");
/* A shop that has only pickups on the page should not open on an
   empty Haul tab. */
ok("…and the first there is when there is not", firstGroup(["LT", "LT"]) === "light");
ok("equipment only", firstGroup(["EQ"]) === "equipment");
ok("an empty fleet still names a group", firstGroup([]) === DEFAULT_GROUP);
ok("the default is haul, which is what the page always meant",
  DEFAULT_GROUP === "haul");

console.log("\nan unknown division is offered, not swallowed:");
/* It has to be reachable. A tire filed under a division nobody named
   would otherwise be on no tab at all and simply disappear. */
p = groupsPresent(["DT", "ZZ"]);
ok("it turns up under Other", p.some((g) => g.key === "other" && g.n === 1), p.map((g) => [g.key, g.n]));
ok("…and not under haul", p.find((g) => g.key === "haul").n === 1, p.map((g) => [g.key, g.n]));

console.log("\nevery tire lands on exactly one tab:");
const divisions = ["DT", "HT", "LT", "EQ", "OT", "ZZ", null];
ok("counts add up to what went in",
  groupsPresent(divisions).reduce((a, g) => a + g.n, 0) === divisions.length,
  groupsPresent(divisions).map((g) => [g.key, g.n]));

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
