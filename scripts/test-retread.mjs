/* How many times a casing has been capped.
   ─────────────────────────────────────────────────────────────────
   A retread is not one thing. A first cap on a good casing and a
   third cap on a tired one wear differently and cost differently, and
   the app could not tell them apart — 159 retreads on the fleet and
   every one of them looked identical to every other, including on the
   Analysis page where retread is compared against virgin.

   Two rules here, and the second is the one that keeps the data
   honest. The mount form will not record a retread without an answer,
   because that is the one moment somebody is holding the tire. The
   edit form asks but does not insist: 138 retreads are on trucks now
   with nothing recorded and nobody can go back and ask, so demanding
   a number there would mean somebody fixing a misspelt brand has to
   invent one first.

   Blank is therefore a real answer and has to stay distinguishable
   from a first cap. "Nobody recorded it" and "it has been capped
   once" are not the same claim.

   Needs nothing: no database, no browser.
*/
import {
  CAPS, capLabel, capNeeded, capFor, sayType, sayTypeTight, isRetread,
} from "../src/retread.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

console.log("what the form offers:");
ok("first through fourth", CAPS.join() === "1,2,3,4", CAPS);
/* A casing's working life is three or four caps. The column allows up
   to ten so a real fifth one is not refused — a form that rejects the
   truth teaches people to type a lie instead. */
ok("…and a fifth is still a number this can label", capLabel(5) === "5th");

console.log("\nordinals, including the ones a naive rule gets wrong:");
for (const [n, want] of [[1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [5, "5th"],
                         [11, "11th"], [12, "12th"], [13, "13th"],
                         [21, "21st"], [22, "22nd"], [23, "23rd"]]) {
  ok(`${n} → ${want}`, capLabel(n) === want, capLabel(n));
}
ok("a string of digits is still a number", capLabel("2") === "2nd");
ok("nothing is nothing", capLabel(null) === "" && capLabel(undefined) === "");
ok("zero caps is not a cap", capLabel(0) === "");
ok("…nor is a negative one", capLabel(-1) === "");
ok("…nor half a cap", capLabel(1.5) === "", capLabel(1.5));
ok("…nor a word", capLabel("second") === "");

console.log("\nwhat a tire reads as:");
ok("a virgin tire", sayType("virgin", null) === "Virgin");
ok("a retread with a count", sayType("retread", 2) === "Retread · 2nd cap",
   sayType("retread", 2));
/* The 138 nobody was asked about. This must not read as a first cap —
   that would be inventing a fact to fill a blank. */
ok("a retread nobody recorded", sayType("retread", null) === "Retread");
ok("…which is not the same as a first cap",
   sayType("retread", null) !== sayType("retread", 1));
ok("a virgin tire never claims a cap, whatever it is handed",
   sayType("virgin", 3) === "Virgin", sayType("virgin", 3));

console.log("\nand on the diagram card, where there is no room:");
ok("a retread with a count", sayTypeTight("retread", 3) === "retread 3rd");
ok("one without", sayTypeTight("retread", null) === "retread");
ok("a virgin tire says nothing at all", sayTypeTight("virgin", null) === "");

console.log("\nwhat stops a mount being recorded:");
ok("a retread with no count", /how many times/i.test(capNeeded("retread", "")));
ok("…and with none at all", /how many times/i.test(capNeeded("retread", null)));
ok("…and with a nonsense one", /how many times/i.test(capNeeded("retread", 0)));
ok("a retread with a count is fine", capNeeded("retread", 2) === "");
ok("a virgin tire is never asked", capNeeded("virgin", null) === ""
   && capNeeded("virgin", "") === "");

console.log("\nwhat reaches the database:");
/* A virgin tire may not carry a count — the database refuses the
   pairing, and a number left behind after somebody switched the type
   back would be a lie the form told. */
ok("a retread sends its count", capFor("retread", 2) === 2);
ok("…as a number, not the text off a dropdown", capFor("retread", "3") === 3);
ok("a virgin tire sends nothing", capFor("virgin", 2) === null);
ok("…even after the type was switched back", capFor("virgin", "1") === null);
ok("a retread with nothing chosen sends nothing", capFor("retread", "") === null);
ok("…rather than a zero", capFor("retread", 0) === null);

console.log("\nthe type test itself:");
ok("retread", isRetread("retread") === true);
ok("virgin", isRetread("virgin") === false);
ok("nothing", isRetread(null) === false && isRetread(undefined) === false);
ok("something else entirely", isRetread("RETREAD") === false);

console.log("\nnothing a mechanic would not say:");
for (const [what, text] of [
  ["a counted retread", sayType("retread", 2)],
  ["an uncounted one", sayType("retread", null)],
  ["a virgin tire", sayType("virgin", null)],
  ["the refusal", capNeeded("retread", null)],
]) {
  ok(`${what} carries no jargon`, !/null|undefined|NaN|object|\[/.test(text), text);
}

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
