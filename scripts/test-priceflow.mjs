/* A price typed once, reaching the tires already out there.
   ─────────────────────────────────────────────────────────────────
   The catalog was built so a price is typed once and every tire
   mounted off that row carries it. That left the tires already on the
   trucks — 490 of the 640 on this fleet went in with no cost at all —
   and the obvious alternative, putting $655.24 on a hundred and forty
   tires by hand, is the thing the catalog exists to stop.

   Three rules decide what this is allowed to touch, and each one is
   here because getting it wrong costs something real:

   ONLY TIRES STILL ON A TRUCK. A tire that has come off is history.
   What it cost is part of what the fleet spent last quarter, and the
   cost per mile on it is settled rather than projected. A price list
   changed this morning must not reach back into either.

   A TIRE THAT ALREADY SAYS SOMETHING IS A SEPARATE DECISION. A blank
   is a gap. $612 typed off an invoice by somebody holding the tire is
   better information than a list price, so changing it is a tick
   somebody has to make rather than something that happens quietly.

   AND A ROW REACHES TIRES THAT PREDATE IT. The 141 HDC3s carry their
   catalog row; the twelve HAC3s were mounted long before the catalog
   existed and have to be reachable by name, or the catalog only ever
   helps with tires bought after the catalog.

   Needs nothing: no database, no browser.
*/
import { onThisRow, planPrice, sayPlan, idsFor, spendAfter, worthAsking }
  from "../src/priceFlow.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};
const money = (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`);

const ROW = { id: "m1", brand: "Continental", model: "HDC3", size: "11R24.5",
  type: "virgin", cost: 655.24 };

/* The fleet as it actually is: some tires filed under the row, some
   mounted long before it existed, some priced, some not, some off. */
const T = (id, x = {}) => ({ id, veh: "DT-890", pos: "3LO",
  brand: "Continental", model: "HDC3", size: "11R24.5", type: "virgin",
  modelId: "m1", cost: null, offDate: null, ...x });

const fleet = [
  T("a"),                                   // filed under the row, no price
  T("b"),                                   // same
  T("c", { cost: 655.24 }),                 // already says it
  T("d", { cost: 612 }),                    // says something else
  T("e", { offDate: "2026-09-01" }),        // off the truck
  T("f", { modelId: null, model: "HDC 3" }),// mounted before the catalog
  T("g", { modelId: null, model: "HAC3" }), // a different tire
  T("h", { modelId: null, type: "retread" }),// the cap, not the casing
];

console.log("which tires a row is fitted to:");
const fitted = onThisRow(ROW, fleet).map((t) => t.id).sort().join();
ok("the ones filed under it", /a/.test(fitted) && /b/.test(fitted), fitted);
/* The rule that makes the catalog worth anything on an existing
   fleet: a tire mounted before the catalog existed, spelled
   differently, is still this tire. */
ok("…and the ones that predate it, by name", /f/.test(fitted), fitted);
ok("not a different model", !/g/.test(fitted), fitted);
/* A cap costs a fraction of a new casing. Putting the virgin price on
   one would be the most expensive single mistake this screen could
   make — 59 of them on this fleet. */
ok("not the retread of the same pattern", !/h/.test(fitted), fitted);
ok("and not one that has come off", !/e/.test(fitted), fitted);

console.log("\nwhat putting the price on them would do:");
const plan = planPrice(ROW, fleet, 655.24);
ok("the ones with no price are counted on their own",
  plan.blank.map((t) => t.id).sort().join() === "a,b,f", plan.blank.map((t) => t.id));
ok("…the ones that disagree separately",
  plan.differs.map((t) => t.id).join() === "d", plan.differs.map((t) => t.id));
ok("…and the ones already saying it are neither",
  plan.same.map((t) => t.id).join() === "c", plan.same.map((t) => t.id));
ok("four tires would change at most", plan.total === 4, plan.total);

console.log("\nwhat it writes:");
/* The default. A gap filled is plainly right; a figure replaced is
   not, so it takes a tick. */
ok("by default only the blank ones", idsFor(plan).sort().join() === "a,b,f", idsFor(plan));
ok("…and the one that disagrees is left alone", !idsFor(plan).includes("d"), idsFor(plan));
ok("ticked, it takes that one too",
  idsFor(plan, true).sort().join() === "a,b,d,f", idsFor(plan, true));
/* Never, either way. */
ok("the pulled tire is never written", !idsFor(plan, true).includes("e"));
ok("nor the cap", !idsFor(plan, true).includes("h"));
ok("nor the one already saying it — there is nothing to write",
  !idsFor(plan, true).includes("c"));

console.log("\nwhat it commits to, before the button:");
ok("three tires at 655.24", Math.abs(spendAfter(plan) - 3 * 655.24) < 0.01, spendAfter(plan));
ok("…four with the tick", Math.abs(spendAfter(plan, true) - 4 * 655.24) < 0.01,
  spendAfter(plan, true));

console.log("\nwhen it is not worth asking:");
ok("nothing to change", !worthAsking(planPrice(ROW, [T("c", { cost: 655.24 })], 655.24)));
ok("no tires at all", !worthAsking(planPrice(ROW, [], 655.24)));
/* Clearing a price must not quietly blank a hundred and forty tires.
   Taking a figure away is not the same act as putting one on. */
ok("a price cleared from the catalog writes nothing",
  !worthAsking(planPrice(ROW, fleet, null)), planPrice(ROW, fleet, null).total);
/* Pinned at the plan rather than only at the question. Taking a
   figure away is not the same act as putting one on, and a plan that
   quietly held 140 tires waiting for a null to be written onto them
   is one callsite away from blanking the fleet. */
ok("…and does not even gather them up",
  planPrice(ROW, fleet, null).blank.length === 0
  && planPrice(ROW, fleet, null).total === 0, planPrice(ROW, fleet, null));
ok("…so there is nothing for a caller to write", idsFor(planPrice(ROW, fleet, null), true).length === 0);
ok("…nor an empty box", !worthAsking(planPrice(ROW, fleet, "")));
/* Nought is a price — a warranty replacement — and it is worth
   asking about. */
ok("a nought price is still worth asking", worthAsking(planPrice(ROW, fleet, 0)),
  planPrice(ROW, fleet, 0).total);

console.log("\nwhat it says before it does it:");
const said = sayPlan(plan, money);
ok("it counts the blanks", /3 tires on the trucks have no price on them/.test(said), said);
ok("…and the ones that disagree", /1 tire says something different/.test(said), said);
ok("…and mentions the ones already right", /1 tire already says \$655\.24/.test(said), said);
/* One tire says, two tires say. */
ok("the verbs agree with the counts",
  /3 tires on the trucks have no price on them/.test(said)
  && !/tires says|tire say\b|tire have/.test(said), said);
const plural = sayPlan(planPrice(ROW, [T("x", { cost: 1 }), T("y", { cost: 1 })], 655.24), money);
ok("…in the plural too", /2 tires say something different/.test(plural), plural);
const one = sayPlan(planPrice(ROW, [T("z")], 655.24), money);
ok("…and for a single blank", /1 tire on the trucks has no price on it/.test(one), one);
/* "Update 141 records" is a sentence about a database. */
ok("it is a sentence about tires, not rows", !/record|row|database/i.test(said), said);
const onlyBlanks = sayPlan(planPrice(ROW, [T("a"), T("b")], 655.24), money);
ok("with nothing to overwrite it does not mention overwriting",
  !/different/.test(onlyBlanks), onlyBlanks);
ok("nothing to do says nothing at all", sayPlan(planPrice(ROW, [], 655.24)) === "");

console.log("\na price that moves:");
/* The real second visit: the list goes up, and the tires on the
   trucks all say the old figure. Every one of them is a deliberate
   change, not a gap. */
const atOld = [T("a", { cost: 655.24 }), T("b", { cost: 655.24 }), T("c", { cost: 655.24 })];
const rise = planPrice(ROW, atOld, 689.5);
ok("nothing is a blank", rise.blank.length === 0, rise.blank.length);
ok("all three are a decision", rise.differs.length === 3, rise.differs.length);
ok("…so the default writes nothing", idsFor(rise).length === 0, idsFor(rise));
ok("…and the tick writes all three", idsFor(rise, true).length === 3, idsFor(rise, true));

console.log("\nrounding, because money is typed as text:");
/* "655.2400" and 655.24 are the same price and must not show up as a
   tire that disagrees. */
ok("a trailing nought is the same price",
  planPrice(ROW, [T("a", { cost: "655.2400" })], 655.24).same.length === 1);
ok("half a cent apart is the same price",
  planPrice(ROW, [T("a", { cost: 655.242 })], 655.24).same.length === 1);
ok("a cent apart is not", planPrice(ROW, [T("a", { cost: 655.25 })], 655.24).differs.length === 1);

ok("nothing at all does not crash", planPrice({}, [], null).total === 0);

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
