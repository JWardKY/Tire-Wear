/* Finding a unit by typing it.
   ─────────────────────────────────────────────────────────────────
   The equipment box on a timecard was a dropdown of the whole fleet.
   On a phone that is a spinning wheel of 130-odd trucks with no way to
   jump to one; on a tablet it is a list you scroll past the one you
   wanted. Somebody standing at the truck knows the number on the door.

   The number matching is findUnits — the rule the Truck File search
   already uses — rather than a second one written for this box. Two
   searches in one app that disagree about what "881" means is worse
   than either. What is here is the rest of the list: shop and indirect
   time live in the same box and are words rather than numbers, so the
   shape of what was typed has to decide which is being looked for.

   Needs nothing: no database, no browser.
*/
import {
  searchPicks, topPick, labelFor, pickCount, shopValue, isShopValue, shopNameOf,
} from "../src/pickUnit.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

const vehicles = [
  { id: "a", num: "DT-881", make: "Kenworth", model: "T880" },
  { id: "b", num: "DT-1881", make: "Peterbilt", model: "567" },
  { id: "c", num: "HT-865", make: "Kenworth", model: "T880" },
  { id: "d", num: "DT-899", make: "Peterbilt", model: "567" },
  { id: "e", num: "DT-874", make: "Kenworth", model: "T880" },
  { id: "f", num: "TR-12", make: "", model: "" },
];
const shopWork = ["Shop cleanup", "Parts running", "Training", "Yard work", "Bay 12 sweep"];
const ctx = { vehicles, shopWork };
const nums = (r) => r.units.map((u) => u.num);

console.log("the number on the door:");
ok("a bare number finds the truck", nums(searchPicks("881", ctx)).includes("DT-881"));
ok("…shortest first, so DT-881 beats DT-1881",
   nums(searchPicks("881", ctx))[0] === "DT-881", nums(searchPicks("881", ctx)));
ok("…and Enter takes that one", topPick(searchPicks("881", ctx)) === "a");
ok("it does not care about the prefix",
   nums(searchPicks("865", ctx)).join() === "HT-865", nums(searchPicks("865", ctx)));
ok("typing the whole thing works too",
   nums(searchPicks("DT-881", ctx)).join() === "DT-881", nums(searchPicks("DT-881", ctx)));
ok("…with no dash", nums(searchPicks("dt881", ctx)).join() === "DT-881");
ok("…and in lower case", nums(searchPicks("dt-881", ctx)).join() === "DT-881");
ok("…and with a space", nums(searchPicks("dt 881", ctx)).join() === "DT-881");

console.log("\nwhat the box opens on:");
/* 130 trucks is not a list, it is a scroll. The shop entries are not
   numbers and cannot be typed as one, so they are what is offered
   before anything has been typed. */
const blank = searchPicks("", ctx);
ok("nothing typed offers no trucks", blank.units.length === 0);
ok("…but every shop and indirect choice", blank.shop.length === shopWork.length);
ok("…and says it is waiting to be typed into", blank.empty === true);
ok("whitespace is nothing typed", searchPicks("   ", ctx).empty === true);
/* Enter on an empty box must not book somebody's morning to whatever
   happened to be first in the shop list. */
ok("Enter on an empty box picks nothing", topPick(blank) === "");

console.log("\nshop and indirect time, which are words:");
ok("a word finds it", searchPicks("parts", ctx).shop.join() === "Parts running");
ok("…in any case", searchPicks("PARTS", ctx).shop.join() === "Parts running");
ok("…and part of it", searchPicks("clean", ctx).shop.join() === "Shop cleanup");
/* A number is never looking for shop time, and offering it under a
   truck search is noise on a small screen. */
ok("a number is not offered shop time", searchPicks("881", ctx).shop.length === 0);
ok("…nor is a number with a dash", searchPicks("8-81", ctx).shop.length === 0);
/* "Bay 12 sweep" contains 12 and TR-12 is a truck. A mechanic typing
   12 at a unit means the unit. */
ok("…not even when a shop entry has those digits in its name",
   searchPicks("12", ctx).shop.length === 0, searchPicks("12", ctx).shop);
ok("…and the truck is still found", nums(searchPicks("12", ctx)).includes("TR-12"));
ok("a word still reaches a shop entry with digits in it",
   searchPicks("bay", ctx).shop.join() === "Bay 12 sweep", searchPicks("bay", ctx).shop);
ok("but a prefix and digits still can be",
   Array.isArray(searchPicks("dt881", ctx).shop));
ok("Enter takes the shop entry when no truck answered",
   topPick(searchPicks("parts", ctx)) === "shop:Parts running");
ok("…and the truck when one did",
   topPick(searchPicks("881", ctx)) === "a");

console.log("\nthe make, when the door is muddy:");
/* Only when the number found nothing. Running it on every search
   buries DT-881 under sixty of its cousins. */
const kw = searchPicks("kenworth", ctx);
ok("a make with no number match finds them", nums(kw).length === 3, nums(kw));
ok("…and only that make", nums(kw).every((n) => ["DT-881", "HT-865", "DT-874"].includes(n)), nums(kw));
/* All three are the same length, so the tie-break decides and the
   order is fixed rather than whatever the fleet list happened to be
   in. A list that reshuffles between searches is one nobody can
   thumb without reading every row. */
ok("…in a settled order, shortest then alphabetical",
   nums(kw).join() === "DT-874,DT-881,HT-865", nums(kw));
ok("a model with a letter in it works the same",
   nums(searchPicks("T880", ctx)).length === 3, nums(searchPicks("T880", ctx)));
/* A model that is nothing but digits stays a unit-number search, on
   purpose. Somebody typing 567 at a truck means a unit number; three
   Peterbilt 567s coming back instead would be a wrong answer dressed
   up as a helpful one. */
ok("a model that is only digits is still read as a unit number",
   pickCount(searchPicks("567", ctx)) === 0, nums(searchPicks("567", ctx)));
ok("…and the same digits in a unit number still find it",
   nums(searchPicks("12", ctx)).includes("TR-12"), nums(searchPicks("12", ctx)));
ok("a truck with no make is not broken by a make search",
   !nums(searchPicks("kenworth", ctx)).includes("TR-12"));
ok("nothing matching is nothing", pickCount(searchPicks("zzzz", ctx)) === 0);
ok("…and Enter on it picks nothing", topPick(searchPicks("zzzz", ctx)) === "");

console.log("\nthe value it hands back, unchanged from the old list:");
/* A draft saved before this existed holds these exact strings. */
ok("a truck is its id", topPick(searchPicks("899", ctx)) === "d");
ok("shop time is shop: and the name", shopValue("Training") === "shop:Training");
ok("…and reads back", isShopValue("shop:Training") && shopNameOf("shop:Training") === "Training");
ok("a truck id is not shop time", !isShopValue("d") && shopNameOf("d") === "");

console.log("\nwhat the box says once something is chosen:");
ok("a truck reads as its number and what it is",
   labelFor("a", ctx) === "DT-881 — Kenworth T880", labelFor("a", ctx));
ok("…and one with no make is just the number",
   labelFor("f", ctx) === "TR-12", labelFor("f", ctx));
ok("shop time reads as itself", labelFor("shop:Training", ctx) === "Training");
ok("nothing chosen reads as nothing", labelFor("", ctx) === "" && labelFor(null, ctx) === "");
/* A truck taken off the fleet leaves its id on old drafts. */
ok("an id nobody recognises does not print undefined",
   labelFor("gone", ctx) === "", labelFor("gone", ctx));

console.log("\nnothing falls over on nothing:");
ok("no vehicles", searchPicks("881", { shopWork }).units.length === 0);
ok("no shop work", searchPicks("parts", { vehicles }).shop.length === 0);
ok("no context at all", pickCount(searchPicks("881")) === 0);
ok("no arguments at all", searchPicks().empty === true);
ok("counting nothing is nothing", pickCount(null) === 0 && pickCount({}) === 0);

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
