/* What a tire costs — per 32nd and per mile.
   ─────────────────────────────────────────────────────────────────
   The page could say which tire lasts longest and could not say which
   tire is the better buy. A casing that runs 15% further and costs 40%
   more is a worse buy, and 625 of the 640 tires on this fleet carried
   no price at all, so there was never anything to divide by.

   Four things are worth more here than the arithmetic:

   Usable tread stops at the PULL POINT. A 28/32 drive pulled at 4/32
   gave 24/32, not 28. Dividing by the whole depth makes every tire
   look about 17% cheaper than it is and flatters a deep tire over a
   shallow one, which is exactly the comparison somebody is making.

   A group's figure is total cost over total miles, never the mean of
   each tire's own cost per mile. Averaging ratios lets a tire scrapped
   at 2,000 miles weigh as much as one that ran 180,000.

   A tire with no price is left out and said to be left out.

   And a tire still on a truck has a PROJECTED cost per mile — what it
   will have cost by the time it reaches the pull point at today's
   rate. A tire mounted last week has run almost nothing, and dividing
   its price by the miles it has done so far would price it at dollars
   a mile and put the newest tire on the fleet at the bottom of every
   chart.

   Needs nothing: no database, no browser.
*/
import { usableTread, lifeOf, costGroup, cheapestFirst, coverage, money }
  from "../src/tireCost.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};
const near = (a, b, e = 1e-6) => a != null && Math.abs(a - b) < e;

/* A Continental HDC3 off DT-890: $655.24, 28/32 new, on a drive wheel
   that comes off at 4/32, gauged at 20/32 having run 36,000 miles. */
const T = (x = {}) => ({ cost: 655.24, newDepth: 28, offDate: null, ...x });
const S = (x = {}) => ({ pull: 4, depth: 20, miles: 36000, remain: 72000,
  miPer32: 4500, ...x });

console.log("usable tread stops at the pull point:");
ok("28/32 pulled at 4/32 is 24 usable", usableTread(T(), S()) === 24);
/* The whole point of the rule: it is not 28. */
ok("…not the whole 28", usableTread(T(), S()) !== 28);
/* A steer comes off higher, so the same tire gives less. */
ok("the same tire on a steer gives 22", usableTread(T(), S({ pull: 6 })) === 22);
ok("a retread mounted at 14/32 gives 10", usableTread(T({ newDepth: 14 }), S()) === 10);
/* Mounted at or below the pull point: there is nothing to divide by,
   and a nought or a minus figure here would poison every total it
   landed in. */
ok("mounted at the pull point gives nothing", usableTread(T({ newDepth: 4 }), S()) === null);
ok("mounted below it gives nothing", usableTread(T({ newDepth: 3 }), S()) === null);
ok("no mount depth gives nothing", usableTread(T({ newDepth: null }), S()) === null);
ok("no pull point gives nothing", usableTread(T(), S({ pull: null })) === null);

console.log("\ncost per 32nd — needs no mileage at all:");
const L = lifeOf(T(), S());
ok("655.24 over 24 usable is 27.30 a 32nd", near(L.per32, 655.24 / 24), L.per32);
/* The figure that would come out if the pull point were ignored —
   proof the two are far enough apart to matter. */
ok("…and dividing by 28 instead would say 23.40",
  Math.round((655.24 / 28) * 100) / 100 === 23.4, Math.round((655.24 / 28) * 100) / 100);
/* Nearly four dollars a 32nd of daylight between the two sums, on one
   tire. Across 141 of them it is the difference between a right answer
   and a tidy one. */
ok("…which is 3.90 a 32nd adrift", near(655.24 / 24 - 655.24 / 28, 3.9002, 1e-4),
  655.24 / 24 - 655.24 / 28);
/* A tire gauged for the first time this morning has no rate, and must
   still get this figure: it is what two quotes are compared with. */
const fresh = lifeOf(T(), S({ miles: null, remain: null, miPer32: null }));
ok("a tire with no wear rate still has a cost per 32nd",
  near(fresh.per32, 655.24 / 24), fresh.per32);
ok("…but no cost per mile", fresh.perMile === null, fresh.perMile);
ok("…and says which one is missing", fresh.why === "no wear rate yet", fresh.why);

console.log("\ncost per mile:");
/* 36,000 run and 72,000 left is 108,000 of life — which is also 24
   usable times 4,500 miles a 32nd, the same sum from the other end. */
ok("miles so far plus miles left", L.lifeMiles === 108000, L.lifeMiles);
ok("…which is usable tread times the wear rate", 24 * 4500 === L.lifeMiles);
ok("655.24 over 108,000 is six tenths of a cent",
  near(L.perMile, 655.24 / 108000), L.perMile);
ok("a tire still on a truck is marked as a projection", L.projected === true);

/* The trap this rule exists for: a tire mounted last week. Its cost
   per mile so far would be 655.24 / 900 = 73 cents a mile, which would
   bury the newest tire on the fleet at the bottom of every chart. */
const newTire = lifeOf(T(), S({ depth: 27.5, miles: 900, remain: 106200 }));
ok("a tire mounted last week is not priced on the miles it has done",
  newTire.perMile < 0.01, newTire.perMile);
ok("…because its projection carries the miles still in it",
  newTire.lifeMiles === 107100, newTire.lifeMiles);

console.log("\na tire already off the truck:");
/* No projection: it ran what it ran, whatever depth it came off at.
   A casing pulled early for a sidewall cut genuinely did cost more a
   mile, and saying otherwise would hide the cut. */
const off = lifeOf(T({ offDate: "2026-09-01" }), S({ miles: 60000, remain: 48000 }));
ok("it is priced on the miles it actually ran", off.lifeMiles === 60000, off.lifeMiles);
ok("…not on what was left in it", off.lifeMiles !== 108000);
ok("…and is not marked a projection", off.projected === false);
const scrapped = lifeOf(T({ offDate: "2026-09-01" }), S({ miles: null }));
ok("one with no miles against it says so",
  scrapped.perMile === null && scrapped.why === "no miles recorded against it", scrapped);

console.log("\nno price means no figure, and a reason:");
const free = lifeOf(T({ cost: null }), S());
ok("no cost per 32nd", free.per32 === null);
ok("no cost per mile", free.perMile === null);
ok("…and it says why", free.why === "no price on it", free.why);
/* Nought is a price. A tire somebody wrote 0 against is a tire that
   cost nothing, not a tire nobody has priced — a warranty replacement
   is the real case, and it should drag the brand's average down. */
const warranty = lifeOf(T({ cost: 0 }), S());
ok("a nought price is a price, not a gap", warranty.per32 === 0 && warranty.why === "", warranty);
ok("…and prices the miles at nothing", warranty.perMile === 0, warranty.perMile);

console.log("\na group is total over total, never the mean of ratios:");
/* The trap, with the numbers that show it. One tire scrapped at 2,000
   miles beside one that ran 180,000, both $600.
     mean of ratios : (0.30 + 0.0033) / 2 = 0.1517 a mile
     total over total: 1,200 / 182,000       = 0.0066 a mile
   The honest answer is the second: the pair cost $1,200 and covered
   182,000 miles. */
const pair = [
  { t: T({ cost: 600, offDate: "2026-02-01" }), s: S({ miles: 2000 }) },
  { t: T({ cost: 600, offDate: "2026-02-01" }), s: S({ miles: 180000 }) },
];
const [g] = costGroup(pair, () => "Continental");
ok("the pair cost 1,200", g.cost === 1200, g.cost);
ok("…over 182,000 miles", g.miles === 182000, g.miles);
ok("…which is 0.0066 a mile", near(g.perMile, 1200 / 182000), g.perMile);
ok("…and not the 0.1517 the mean of the ratios would give",
  !near(g.perMile, (600 / 2000 + 600 / 180000) / 2, 1e-4), g.perMile);

console.log("\nwhat a group leaves out, and counts:");
const mixed = [
  { t: T({ cost: 655.24 }), s: S() },
  { t: T({ cost: 655.24 }), s: S() },
  { t: T({ cost: null }), s: S() },            // no price — left out
  { t: T({ cost: 655.24, newDepth: null }), s: S() },  // priced, no usable tread
];
const [mg] = costGroup(mixed, () => "Continental");
ok("every tire is counted", mg.n === 4, mg.n);
ok("…but only the priced ones carry money", mg.priced === 3, mg.priced);
ok("…and the unpriced one adds nothing to the total",
  near(mg.cost, 655.24 * 3), mg.cost);
/* The one with no mount depth has a price but no tread to divide it
   by, so it belongs in the per-mile figure and not in the per-32nd
   one. */
ok("a priced tire with no mount depth stays out of the per-32nd",
  near(mg.usable, 48), mg.usable);
ok("…while its miles still count in the per-mile", mg.milesPriced === 3, mg.milesPriced);
/* And the half of this that is easy to get wrong: its PRICE has to
   stay out of the per-32nd too. One cost total divided by whichever
   denominator is being asked for reads tidily and lies — it would put
   three tires' money over two tires' tread and make the group look
   50% dearer a 32nd than it is. */
ok("…and so does its price",
  near(mg.per32, (655.24 * 2) / 48), [mg.per32, (655.24 * 2) / 48]);
ok("…which is not three tires' money over two tires' tread",
  !near(mg.per32, (655.24 * 3) / 48), mg.per32);

/* The same trap the other way round, and the one the fleet will
   actually hit: a tire bought and mounted this morning. It has a
   price and no miles, and its money must not land on a group's
   cost-per-mile while its miles sit at nought — the brand would read
   dearer for having been bought recently. */
const freshBuy = [
  { t: T({ cost: 600, offDate: "2026-02-01" }), s: S({ miles: 90000 }) },
  { t: T({ cost: 500 }), s: S({ miles: null, remain: null, miPer32: null }) },
];
const [fb] = costGroup(freshBuy, () => "Continental");
ok("a tire with no miles yet does not inflate the cost per mile",
  near(fb.perMile, 600 / 90000), fb.perMile);
ok("…though its money is still in the group's spend", fb.cost === 1100, fb.cost);
ok("…and it does count towards the cost per 32nd",
  near(fb.per32, 1100 / 48), fb.per32);

console.log("\ncheapest first, and nothing unpriced at the top:");
const groups = [
  { name: "Bandag", perMile: 0.0041, per32: 14.2 },
  { name: "Continental", perMile: 0.0061, per32: 27.3 },
  { name: "Michelin", perMile: 0.0052, per32: 31.0 },
  { name: "Unpriced", perMile: null, per32: null },
];
const sorted = cheapestFirst(groups);
ok("cheapest a mile comes first",
  sorted.map((x) => x.name).join() === "Bandag,Michelin,Continental",
  sorted.map((x) => x.name));
/* The one that would be a trap: a line with no figure must not sort
   as nought and sit at the top of a chart about price. */
ok("a line with no figure is dropped, not sorted as nought",
  !sorted.some((x) => x.name === "Unpriced"), sorted.map((x) => x.name));
ok("it can sort by the 32nd instead",
  cheapestFirst(groups, "per32").map((x) => x.name).join() === "Bandag,Continental,Michelin",
  cheapestFirst(groups, "per32").map((x) => x.name));
/* The two orders genuinely disagree — Michelin is dearer a 32nd and
   cheaper a mile. That disagreement is the whole reason both figures
   are on the page. */
ok("…and the two orders are not the same",
  cheapestFirst(groups).map((x) => x.name).join()
  !== cheapestFirst(groups, "per32").map((x) => x.name).join());

console.log("\nhow much of the screen the money covers:");
const c = coverage(mixed);
ok("three of four", c.priced === 3 && c.total === 4 && c.missing === 1, c);
ok("…as a percentage", c.pct === 75, c.pct);
ok("…and as a sentence somebody can read",
  /3 of 4 tires here have a price on them/.test(c.say), c.say);
ok("all priced says so plainly",
  /^Every one of these 2 tires/.test(coverage([mixed[0], mixed[1]]).say),
  coverage([mixed[0], mixed[1]]).say);
ok("…and says it in a whole sentence when one is left out",
  /the other one is left out/.test(c.say), c.say);
ok("none priced says that instead",
  /^This tire has no price on it/.test(coverage([mixed[2]]).say), coverage([mixed[2]]).say);
ok("…and in the plural when there are several",
  /^None of these 2 tires/.test(coverage([mixed[2], mixed[2]]).say),
  coverage([mixed[2], mixed[2]]).say);
ok("one priced tire is not 'every one of these 1'",
  coverage([mixed[0]]).say === "This tire has a price on it", coverage([mixed[0]]).say);
ok("nothing at all does not crash", coverage([]).say === "Nothing here yet");
/* The same rule as lifeOf, in the place that counts rather than
   divides: a warranty tire written down as 0 is priced, and must not
   show up in "the other N are left out". */
ok("a nought price counts as priced here too",
  coverage([{ t: T({ cost: 0 }), s: S() }]).priced === 1,
  coverage([{ t: T({ cost: 0 }), s: S() }]));

console.log("\nmoney, said the way the shop says it:");
ok("a price keeps its cents", money(655.24) === "$655.24", money(655.24));
ok("a cost per 32nd keeps them too", money(27.3) === "$27.30", money(27.3));
ok("a total drops them", money(90423.12) === "$90,423", money(90423.12));
/* Cost per mile lives under a dollar, and rounding it to the penny
   would show 0.004 and 0.0061 as the same number — which over a
   100,000-mile casing is a $200 difference. */
ok("cost per mile keeps enough of itself to compare",
  money(0.0061) === "$0.006" && money(0.004) === "$0.004",
  [money(0.0061), money(0.004)]);
ok("…and those two are not the same string", money(0.0061) !== money(0.004));
ok("nothing is a dash, not a nought", money(null) === "—" && money(undefined) === "—");
ok("a nought is a nought", money(0) === "$0.000", money(0));

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
