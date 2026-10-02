/* Why a tire came off.
   ─────────────────────────────────────────────────────────────────
   Seventy tires have come off this fleet and forty-one of them say
   "Worn out", which cannot all be true — the list had nowhere to put
   a tire that blew, so a blowout went in as ordinary wear. A blowout
   is a tow, a lost load and sometimes a wrecked fender, and none of
   that is visible once it is filed as a tire reaching the end of its
   life.

   The second one added here is the one that matters most. The
   argument for running retreads is money; the argument against is a
   cap coming apart on the road. Recorded as "Road hazard", the
   retread programme looks better than it is, forever, and nobody can
   tell from the figures.

   Which is why "Retread failure" is only offered on a retread. It is
   not a thing that can happen to a virgin casing, and a list that
   offers it anyway will eventually be used to record one — at which
   point the retread figures carry a failure that never happened. Same
   shape of rule as the cap count: ask the question only where it has
   an answer.

   Needs nothing: no database, no browser.
*/
import { REASONS, DEFAULT_REASON, reasonsFor, isFailure, isRetreadFailure,
  keepReason, sayReason } from "../src/pullReason.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

const virgin = { type: "virgin" };
const cap = { type: "retread", caps: 2 };

console.log("the two that were missing:");
const all = REASONS.map((r) => r.label);
ok("a tire can have blown", all.includes("Tire blew"), all);
ok("…and a retread can have come apart", all.includes("Retread failure"), all);

console.log("\nthe six that were already there are untouched:");
/* Seventy tires already carry these words. Renaming one would orphan
   every record that used it, because the column is free text and
   nothing would go back and fix them. */
for (const r of ["Worn out", "Road hazard", "Sidewall damage",
  "Irregular wear", "Rotated off", "Casing sent to retread"])
  ok(`"${r}" still says exactly that`, all.includes(r), all);
ok("worn out is still what it opens on", DEFAULT_REASON === "Worn out", DEFAULT_REASON);

console.log("\nwhat is offered depends on the casing:");
ok("a retread can have failed as a retread",
  reasonsFor(cap).includes("Retread failure"), reasonsFor(cap));
/* The whole rule. */
ok("a virgin casing cannot",
  !reasonsFor(virgin).includes("Retread failure"), reasonsFor(virgin));
ok("but either can blow",
  reasonsFor(virgin).includes("Tire blew") && reasonsFor(cap).includes("Tire blew"));
ok("a virgin casing is offered seven", reasonsFor(virgin).length === 7, reasonsFor(virgin));
ok("a retread eight", reasonsFor(cap).length === 8, reasonsFor(cap));
/* The database column spells it tire_type; the app spells it type.
   Both arrive at this function depending on where it is called. */
ok("it reads the database spelling too",
  reasonsFor({ tire_type: "retread" }).includes("Retread failure"));
ok("nothing at all is treated as a virgin casing",
  !reasonsFor(undefined).includes("Retread failure"), reasonsFor(undefined));
/* A casing sent away to be capped again is a retread being retreaded,
   which is ordinary. */
ok("a retread can still be sent off to be capped again",
  reasonsFor(cap).includes("Casing sent to retread"));

console.log("\na tire that stopped rather than finished:");
ok("blew", isFailure("Tire blew"));
ok("retread failure", isFailure("Retread failure"));
ok("road hazard", isFailure("Road hazard"));
ok("sidewall damage", isFailure("Sidewall damage"));
/* These two are a tire finishing its job, and must not be counted
   against anything. */
ok("worn out is not a failure", !isFailure("Worn out"));
ok("rotated off is not a failure", !isFailure("Rotated off"));
ok("nor is a casing sent to be capped", !isFailure("Casing sent to retread"));
ok("something the list has never heard of is not a failure",
  !isFailure("Stolen") && !isFailure("") && !isFailure(null));
/* Typed, pasted or read back from the database with different case. */
ok("it does not care about case or spacing",
  isFailure(" tire blew ") && isFailure("TIRE BLEW"));

console.log("\nthe one that is an argument about retreading:");
ok("a cap coming apart is", isRetreadFailure("Retread failure"));
/* A retread that hit a kerb is a road hazard that happened to be on a
   retread. It is not evidence about retreading. */
ok("a road hazard on a retread is not", !isRetreadFailure("Road hazard"));
ok("nor is a blowout", !isRetreadFailure("Tire blew"));
ok("nor worn out", !isRetreadFailure("Worn out"));

console.log("\nkeeping a chosen reason honest:");
/* The move dialog picks a reason for whichever tire is being
   displaced, and the wheel under it can change between one click and
   the next. */
ok("a retread failure survives on a retread",
  keepReason("Retread failure", cap) === "Retread failure");
ok("…and falls back on a virgin casing",
  keepReason("Retread failure", virgin) === "Worn out",
  keepReason("Retread failure", virgin));
ok("anything else is left alone", keepReason("Road hazard", virgin) === "Road hazard");
ok("and nothing chosen opens on worn out", keepReason("", virgin) === "Worn out");
ok("no tire at all does not crash",
  keepReason("Retread failure", null) === "Worn out");

console.log("\nwhat it says when one is picked:");
const said = sayReason("Retread failure", cap);
ok("a cap that came apart names which cap", /2nd cap/.test(said), said);
ok("…and says what the record is for", /retread programme/i.test(said), said);
ok("a cap with no count still says something",
  /cap that came apart/.test(sayReason("Retread failure", { type: "retread" })),
  sayReason("Retread failure", { type: "retread" }));
ok("a blowout says what it means for the figures",
  /cost per mile will read dearer/.test(sayReason("Tire blew", virgin)),
  sayReason("Tire blew", virgin));
/* A tire that wore out is the ordinary case and needs no commentary. */
ok("worn out says nothing at all", sayReason("Worn out", virgin) === "");
ok("rotated off says nothing either", sayReason("Rotated off", virgin) === "");

console.log("\nthe labels are what gets written to the database:");
/* removed_reason is free text with no check constraint, so these
   strings are the record. A trailing space or a stray capital would
   split a reason into two for every report from here on. */
for (const r of all) {
  ok(`"${r}" is clean`, r === r.trim() && !/\s\s/.test(r) && r.length > 0, r);
}
ok("no two say the same thing", new Set(all).size === all.length, all);

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
