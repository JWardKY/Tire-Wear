/* How many came off the shelf.
   ─────────────────────────────────────────────────────────────────
   The quantity box would not let go of the number in it. It was
   value={qty} with onChange forcing the result back to at least 1, so
   clearing the box gave "" → 0 → 1 before the screen repainted. The 1
   was back the instant the backspace landed.

   The shop's workaround, in Jason's words: type the new figure in
   FRONT of the old one and then delete the old — "31" for three
   batteries, then pick the 1 out with the caret. On a phone. That is
   what a controlled input with a floor on it costs.

   A second bug was sitting in the same control. A part nobody has put
   in the catalog has no id, so two typed parts were both partId null:
   changing the quantity on one changed both, removing one removed
   both, and React saw two children with the same key.

   Needs nothing: no database, no browser.
*/
import { typeQty, settleQty, addQty, lineKey, sameLine } from "../src/partQty.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

console.log("the bug, in the shape it actually took:");
/* One backspace into changing 1 to 3. This is the state the old code
   would not allow to exist, and everything else follows from it. */
ok("an empty box is allowed to be empty", typeQty("") === "");
ok("…and does not spring back to 1", typeQty("") !== "1");
/* What the mechanic had to do instead. */
ok("nobody needs to type 31 to get 3", typeQty("3") === "3");

console.log("\nwhat the box takes while it is being typed in:");
for (const [raw, want] of [
  ["3", "3"], ["12", "12"], ["0", "0"], ["", ""],
  ["2.5", "2.5"], [".5", "5"], ["1,5", "1.5"],
]) ok(`${JSON.stringify(raw)} → ${JSON.stringify(want)}`, typeQty(raw) === want, typeQty(raw));
/* A leading point is a stray keypress, not "nought point five" — the
   number has to start with a digit. */
ok("a point with nothing before it is not a decimal", typeQty(".") === "");
ok("two points do not both land", typeQty("1.2.3") === "1.23", typeQty("1.2.3"));
ok("three decimals are cut to two, which is what gets stored",
  typeQty("3.555") === "3.55", typeQty("3.555"));
ok("letters do not get in", typeQty("1a2") === "12");
/* A minus is not a quantity. The old box had min="1" and the browser
   enforced nothing. */
ok("a minus sign is not a quantity", typeQty("-4") === "4");
ok("null and undefined are an empty box, not 'null'",
  typeQty(null) === "" && typeQty(undefined) === "");

console.log("\nwhat it becomes when they leave it:");
ok("a real figure stays", settleQty("3") === 3);
ok("…including a fraction", settleQty("2.5") === 2.5);
/* Cleared and walked away. A part on the list that came off the shelf
   no times is not a thing — but it must settle on leaving, never
   while they are still typing. */
ok("an empty box settles at one", settleQty("") === 1);
ok("nought settles at one", settleQty("0") === 1);
ok("rubbish settles at one", settleQty("abc") === 1);
ok("…and a caller can say what one means", settleQty("", 2) === 2);
ok("a number in, a number out", settleQty(4) === 4);
ok("…and it is a number, not text", typeof settleQty("3") === "number");

console.log("\nadding to a line that is already on the list:");
/* The hazard the whole fix creates if it is not handled: while the box
   is being typed in, qty is text, and "3" + 1 is "31" — the exact
   figure the shop was typing by hand to get around the bug. */
ok("three on the list and one more is four, not thirty-one",
  addQty("3", 1) === 4, addQty("3", 1));
ok("…whichever side is text", addQty(3, "1") === 4 && addQty("3", "1") === 4);
ok("fractions add", addQty(2, 2.5) === 4.5);
/* Each side is cut to two places before they are added, so this is
   1.55 + 1.55 rather than 3.11 rounded — the figure stored is the
   figure that was on the screen, which is the point. */
ok("…each cut to two places before adding, not after",
  addQty("1.555", "1.555") === 3.1, addQty("1.555", "1.555"));
ok("…and the sum never grows a third place",
  String(addQty("0.05", "0.07")).length <= 4, addQty("0.05", "0.07"));
ok("an empty box counts as the one that is there", addQty("", 1) === 2, addQty("", 1));

console.log("\nwhich line is which:");
/* Two parts nobody has catalogued. Both have no id, and the list is
   actually unique on the number. */
const a = { partId: null, num: "5747-31S950" };
const b = { partId: null, num: "SEAL-9" };
ok("two typed parts are not the same line", !sameLine(a, b));
ok("…even though neither has an id", a.partId === b.partId);
ok("a line is the same as itself", sameLine(a, { ...a }));
/* `put` has always deduplicated on the number regardless of case and
   spacing, and this has to agree with it or they disagree about what a
   duplicate is. */
ok("case does not make a new line", sameLine(a, { num: "5747-31s950" }));
ok("…nor does a stray space", sameLine(a, { num: " 5747-31S950 " }));
ok("a catalog part and a typed one with the same number are one line",
  sameLine({ partId: "p1", num: "X" }, { partId: null, num: "X" }));
ok("a key is a string even with nothing to go on",
  lineKey({}) === "" && lineKey(null) === "");

console.log("\nchanging one line leaves the others alone:");
/* The filter the old Remove button used, written out: it removed every
   part whose partId matched — and null matches null. */
const list = [a, b, { partId: "p1", num: "11R245-D" }];
ok("removing a typed part removes exactly one",
  list.filter((p) => !sameLine(p, a)).length === 2,
  list.filter((p) => !sameLine(p, a)).map((p) => p.num));
ok("…and it is the right one",
  list.filter((p) => !sameLine(p, a)).map((p) => p.num).join() === "SEAL-9,11R245-D");
ok("setting a quantity hits one line",
  list.map((p) => (sameLine(p, b) ? { ...p, qty: 9 } : p)).filter((p) => p.qty === 9).length === 1);

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
