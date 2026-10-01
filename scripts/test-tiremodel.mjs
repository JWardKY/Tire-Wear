/* The tire catalog.
   ─────────────────────────────────────────────────────────────────
   Brand, model, size and type were free text on every mount. 640
   tires later the fleet holds "HDC3", "HDC 3", "hdc3", "Hdc3" and
   "Conti HDC 3" for one tire, nine spellings of 425/65R22.5, and
   CR976A entered as a brand on some rows and as a model on others.
   Each spelling is its own line on the Analysis page, so the tire
   somebody is trying to compare is split five ways and none of the
   five has enough behind it to mean anything.

   The other half: how deep a new one is and what it costs were typed
   from memory at the wheel or left out. 625 of 640 tires carry no
   cost at all, which is why cost per mile has never said anything.

   So the key is the squashed text rather than the text — "HDC 3" and
   "hdc3" are one tire and cannot both be added — and the same rule is
   a unique index in the database so the two cannot drift.

   Needs nothing: no database, no browser.
*/
import {
  modelKey, sameModel, labelOf, missing, sayMissing, isReady,
  checkModel, findModels, specFrom, TYPES,
} from "../src/tireModel.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

const M = (o) => ({ id: o.id ?? Math.random(), brand: "", model: "", size: "",
                    type: "virgin", newDepth: null, cost: null, active: true, ...o });

console.log("one tire, however it was spelled:");
/* Every one of these is a real spelling off the fleet. */
const hdc3 = { brand: "Continental", model: "HDC3", size: "11R24.5", type: "virgin" };
for (const spelling of [
  { brand: "Continental", model: "HDC 3", size: "11R24.5", type: "virgin" },
  { brand: "continental", model: "hdc3", size: "11r24.5", type: "virgin" },
  { brand: "CONTINENTAL", model: "Hdc3", size: "11 R 24.5", type: "virgin" },
]) ok(`${spelling.model} / ${spelling.size} is the same tire`, sameModel(hdc3, spelling), modelKey(spelling));
/* Nine spellings of one size, every one off the fleet. The size keys
   on its digits because the R is there or not depending on who typed
   it — "425/65/22.5" has no R at all, and under the first rule it came
   out of the seeding as a second Continental steer tire. */
for (const size of ["425/65R22.5", "425/65 R22.5", "425/65r22.5", "425/65r/22.5",
                    "425/65/22.5", "425/6522.5", "425/65 22.5"])
  ok(`size ${size}`, sameModel({ brand: "C", size: "425/65R22.5", type: "virgin" },
                               { brand: "C", size, type: "virgin" }), modelKey({ brand: "C", size }));

console.log("\nand the ones that are genuinely different:");
/* The normalisation must not go further than case and punctuation —
   these are four different tires that look alike. */
ok("HDC is not HDC3", !sameModel(hdc3, { ...hdc3, model: "HDC" }));
ok("HDC2 is not HDC3", !sameModel(hdc3, { ...hdc3, model: "HDC 2" }));
ok("a retread is not the virgin of the same name",
  !sameModel(hdc3, { ...hdc3, type: "retread" }));
ok("11R22.5 is not 11R24.5", !sameModel(hdc3, { ...hdc3, size: "11R22.5" }));
/* 425/62 is probably a typo for 425/65, but guessing that would merge
   two sizes on a hunch. */
/* Digits only must not go so far that two real sizes merge. */
ok("11R22.5 and 11R24.5 stay apart",
  !sameModel({ brand: "C", size: "11R22.5" }, { brand: "C", size: "11R24.5" }));
ok("295/75 and 295/80 stay apart",
  !sameModel({ brand: "C", size: "295/75R22.5" }, { brand: "C", size: "295/80R22.5" }));
ok("425/62 is left alone as its own size",
  !sameModel({ brand: "C", size: "425/65R22.5" }, { brand: "C", size: "425/62R22.5" }));
ok("a missing model is not a wildcard",
  !sameModel({ brand: "Maxam", model: "", size: "11R24.5", type: "virgin" },
             { brand: "Maxam", model: "MX300L", size: "11R24.5", type: "virgin" }));

console.log("\nwhat it is called:");
ok("brand, model, size and type",
  labelOf(hdc3) === "Continental HDC3 · 11R24.5 · Virgin", labelOf(hdc3));
ok("a retread says so", /Retread$/.test(labelOf({ ...hdc3, type: "retread" })));
/* Four seeded rows have no model at all. */
ok("no model still reads", labelOf({ brand: "Maxam", size: "11R24.5", type: "virgin" })
  === "Maxam · 11R24.5 · Virgin", labelOf({ brand: "Maxam", size: "11R24.5" }));
ok("nothing at all does not crash", typeof labelOf({}) === "string");

console.log("\nwhat is still missing:");
ok("a fresh row needs both", missing(M({ brand: "C" })).join() === "depth,price");
ok("…and says so in one sentence",
  sayMissing(M({ brand: "C" })) === "No depth or price on it yet", sayMissing(M({ brand: "C" })));
ok("depth alone", sayMissing(M({ cost: 600 })) === "No depth on it yet");
ok("price alone", sayMissing(M({ newDepth: 28 })) === "No price on it yet");
ok("a finished row says nothing", sayMissing(M({ newDepth: 28, cost: 600 })) === "");
ok("…and is ready", isReady(M({ newDepth: 28, cost: 600 })));
/* Zero is a real price — a tire off a warranty claim — and must not
   read as "not filled in". Nought depth is not a tire, and the
   checker refuses it separately. */
ok("a price of nought is a filled-in price", isReady(M({ newDepth: 28, cost: 0 })), missing(M({ newDepth: 28, cost: 0 })));

console.log("\nwhat a row will not be saved as:");
ok("no brand", checkModel({ brand: " ", type: "virgin" }) !== "");
ok("no type", checkModel({ brand: "C", type: "" }) !== "");
ok("a type nobody has heard of", checkModel({ brand: "C", type: "recap" }) !== "");
/* A made-up depth sets mount readings wrong fleet-wide, which this app
   has already paid for twice. */
ok("a depth of nought", checkModel({ brand: "C", type: "virgin", newDepth: 0 }) !== "");
ok("a depth past any tire", checkModel({ brand: "C", type: "virgin", newDepth: 41 }) !== "");
ok("…but 40 is allowed, because off-road drives are deep",
  checkModel({ brand: "C", type: "virgin", newDepth: 40 }) === "");
ok("a minus price", checkModel({ brand: "C", type: "virgin", cost: -5 }) !== "");
ok("a row with nothing but a brand and a type is fine",
  checkModel({ brand: "C", type: "virgin" }) === "");

console.log("\n…and the clash it exists to stop:");
const shelf = [M({ id: "a", ...hdc3 })];
const clash = checkModel({ brand: "continental", model: "hdc 3", size: "11r24.5", type: "virgin" }, shelf);
ok("the same tire spelled differently is refused", clash !== "");
ok("…and the message names the one already there",
  /Continental HDC3/.test(clash), clash);
ok("editing a row does not clash with itself",
  checkModel({ id: "a", ...hdc3, cost: 700 }, shelf) === "");
ok("a genuinely different tire is fine",
  checkModel({ brand: "Michelin", model: "XDN2", size: "11R24.5", type: "virgin" }, shelf) === "");

console.log("\nfinding one by typing:");
const shelf2 = [
  M({ id: 1, brand: "Continental", model: "HDC3", size: "11R24.5", type: "virgin", newDepth: 28, cost: 655 }),
  M({ id: 2, brand: "Continental", model: "HAC3", size: "425/65R22.5", type: "virgin" }),
  M({ id: 3, brand: "Michelin", model: "XDN2", size: "11R24.5", type: "virgin", newDepth: 30, cost: 700 }),
  M({ id: 4, brand: "Bridgestone", model: "M726", size: "425/65R22.5", type: "retread", active: false }),
];
ok("by model", findModels(shelf2, "hdc3").map((m) => m.id).join() === "1");
/* Typed the way it is written on the tire, with a space. */
ok("…however it is spaced", findModels(shelf2, "hdc 3").map((m) => m.id).join() === "1");
ok("by brand", findModels(shelf2, "michelin").map((m) => m.id).join() === "3");
ok("by size", findModels(shelf2, "425").map((m) => m.id).join() === "2");
/* Every word has to land, so a second word narrows. */
ok("two words narrow rather than widen",
  findModels(shelf2, "continental 425").map((m) => m.id).join() === "2",
  findModels(shelf2, "continental 425").map((m) => m.id));
ok("nothing typed offers everything live", findModels(shelf2, "").length === 3);
ok("a retired row is not offered", !findModels(shelf2, "").some((m) => m.id === 4));
ok("…nor found by name", !findModels(shelf2, "m726").length);
/* A row that will fill the form in beats one that still needs work. */
ok("finished rows come first",
  findModels(shelf2, "continental").map((m) => m.id).join() === "1,2",
  findModels(shelf2, "continental").map((m) => m.id));
ok("the type can be narrowed to", findModels(shelf2, "", "virgin").length === 3);

console.log("\nwhat mounting one fills in:");
const sp = specFrom(shelf2[0]);
ok("brand, model, size and type", sp.brand === "Continental" && sp.model === "HDC3"
  && sp.size === "11R24.5" && sp.type === "virgin", sp);
ok("the new depth", sp.newDepth === 28);
ok("the price", sp.cost === 655);
ok("and which row it came off", sp.modelId === 1);
/* Depth and price are copied rather than linked: a price list that
   changes in March must not rewrite what a tire cost in January. */
ok("a row with gaps fills in what it has and no more",
  specFrom(shelf2[1]).newDepth === null && specFrom(shelf2[1]).cost === null
  && specFrom(shelf2[1]).brand === "Continental", specFrom(shelf2[1]));
ok("nothing at all does not crash", typeof specFrom({}).brand === "string");
ok("both types are offered", TYPES.join() === "virgin,retread");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
