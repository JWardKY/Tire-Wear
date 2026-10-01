/* What a tire costs, on the Analysis page, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-tirecost.mjs holds the arithmetic. This holds the
   thing only a browser can answer: that the figures reach the screen,
   that the catalog's spellings collapse into one bar, and that the
   page says out loud what it is leaving out.

   The numbers below are picked so every figure on the screen can be
   checked by hand:

     Continental HDC3, $655.24, on at 28/32, drive wheel pulled at
     4/32 → 24/32 usable → $27.30 a 32nd. Gauged at 20/32 having run
     36,000 miles → 4,500 miles a 32nd → 108,000 miles of life →
     $0.006 a mile.

     Bandag BDR cap, $310, on at 22/32 → 18/32 usable → $17.22 a 32nd,
     72,000 miles of life → $0.004 a mile.

   So the cap is the better buy on both counts, and it has to come
   first on a chart where LOWER is better — the opposite of every other
   chart on the page, which is exactly the trap this screen could set
   for somebody reading quickly.

   Two of the Continentals are spelled differently — "HDC3" and
   "HDC 3" — and must be one bar. That is the catalog reaching the
   chart, and without it the 141 HDC3s on the real fleet are five bars
   none of which means anything.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-costboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const V = "v890";
const LT = "v1487";

/* [id, position, brand, model, type, cost, mount depth, now, miles, rate, off] */
const spec = [
  ["t1", "3LO", "Continental", "HDC3",  "virgin",  655.24, 28, 20, 36000, 4500, null],
  ["t2", "3RO", "Continental", "HDC 3", "virgin",  655.24, 28, 20, 36000, 4500, null],
  ["t3", "4LO", "Bandag",      "BDR",   "retread", 310,    22, 14, 32000, 4000, null],
  ["t4", "4RO", "Toyo",        "M655",  "virgin",  null,   28, 20, 36000, 4500, null],
  /* Already off the truck: it ran what it ran, so its cost per mile
     is settled rather than projected. */
  ["t5", "2LO", "Goodyear",    "G572",  "virgin",  600,    28, 4,  90000, 3750, "2026-09-01"],
  /* Mounted this morning and never gauged since, so it has no wear
     rate and never will have one until somebody walks round it. It
     still has a cost per 32nd — $500 over 24 usable — and that figure
     is the one two quotes are compared with, so it must reach the
     chart. */
  ["t6", "5LO", "Michelin",    "XZY3",  "virgin",  500,    28, 28, null,  null, null],
];

/* A pickup tire, on a pickup. $220 over 10/32 of usable tread is
   $22 a 32nd and about a third of a cent a mile — it would walk to
   the top of a chart about dump truck tires, and it is not one. The
   mileage charts already refuse to mix the fleets; the money charts
   have to refuse the same way or the cheapest tire in the yard is
   always whatever is on a half-ton. */
const ltTire = {
  id: "lt1", vehicle_id: LT, position: "1L", brand: "Firestone",
  model: "Transforce", size: "LT265/70R17", tire_type: "virgin",
  wheel_material: "steel", casing_id: null, mounted_date: "2026-01-02",
  mounted_odometer: 40000, mounted_depth: 14, cost: 220, removed_date: null,
  removed_odometer: null, removed_reason: null, notes: null, created_by: null,
  created_at: "2026-01-02", retread_count: null, model_id: null,
};

const tires = [], wear = [], readings = [];
spec.forEach(([id, pos, brand, model, type, cost, on, now, miles, rate, off]) => {
  tires.push({ id, vehicle_id: V, position: pos, brand, model, size: "11R24.5",
    tire_type: type, wheel_material: "aluminum", casing_id: null,
    mounted_date: "2026-01-02", mounted_odometer: 100000, mounted_depth: on,
    cost, removed_date: off, removed_odometer: off ? 190000 : null,
    removed_reason: off ? "worn out" : null, notes: null, created_by: null,
    created_at: "2026-01-02", retread_count: type === "retread" ? 1 : null,
    model_id: null });
  if (rate == null) return;   // never gauged: no row in the wear view
  wear.push({ tire_id: id, point_count: 2,
    first_odometer: 100000, first_depth: on,
    last_odometer: 100000 + miles, last_depth: now,
    miles_run: miles, worn_32nds: on - now,
    miles_per_32nd: rate, miles_per_mil: null });
  /* The walk-around the rate is built from. Without it the only point
     on the tire is its mount, and "miles left" quietly becomes the
     whole depth again — which is how the first run of this test
     showed $0.005 for a tire that costs $0.006 a mile. */
  readings.push({ id: `r${id}`, tire_id: id, reading_date: "2026-06-01",
    odometer: 100000 + miles, depth_32nds: now, recorded_by: null,
    created_at: "2026-06-01" });
});

tires.push(ltTire);
wear.push({ tire_id: "lt1", point_count: 2, first_odometer: 40000, first_depth: 14,
  last_odometer: 60000, last_depth: 10, miles_run: 20000, worn_32nds: 4,
  miles_per_32nd: 5000, miles_per_mil: null });
readings.push({ id: "rlt1", tire_id: "lt1", reading_date: "2026-06-01",
  odometer: 60000, depth_32nds: 10, recorded_by: null, created_at: "2026-06-01" });

const rows = {
  tw_vehicles: [{ id: V, number: "DT-890", make: "Kenworth", model: "T880",
    model_year: "2022", division: "DT", axle_config: "dump12",
    motive_vehicle_id: null, motive_asset_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" },
    { id: LT, number: "LT-1487", make: "Ford", model: "F-250",
    model_year: "2024", division: "LT", axle_config: "light4",
    motive_vehicle_id: null, motive_asset_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  tw_tires: tires, tw_tire_wear: wear,
  tw_tread_readings: readings, tw_odometer_log: [],
  tw_tire_models: [], tw_tire_brands: [
    { id: "b1", name: "Continental", sort_order: 1, active: true },
    { id: "b2", name: "Bandag", sort_order: 2, active: true },
  ],
  tw_settings: [{ id: true, pull_steer_32nds: 6, pull_other_32nds: 4,
    default_new_depth: 28, dual_match_32nds: 4, alert_emails: [],
    updated_at: "2026-01-01" }],
  tw_mechanics: [], tw_work_log: [], tw_tire_alerts: [], tw_tires_due_out: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  console.log("  node scripts/test-costboard.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1700 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));
await fakeRest(ctx, { rows });

const page = await ctx.newPage();
const crashes = [], rest400 = [];
page.on("pageerror", (e) => crashes.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Tires", exact: true }).first().click();
await page.waitForTimeout(1600);
await page.getByRole("button", { name: "Analysis", exact: true }).first().click();
await page.waitForTimeout(1600);

let t = await page.locator("body").innerText();
ok("the Analysis page opens", /wear rate/i.test(t), t.slice(0, 160));
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));

console.log("\n── the money block ──");
ok("there is one", /What it costs/.test(t), t.slice(0, 300));
/* Four of the five have a price. The page must say so rather than
   letting the charts read as the whole fleet. */
ok("it says what it is leaving out",
  /5 of 6 tires here have a price on them/.test(t),
  (t.match(/[^\n]*price on them[^\n]*/) || [""])[0]);
ok("…in a whole sentence", /the other one is left out/.test(t),
  (t.match(/[^\n]*left out[^\n]*/) || [""])[0]);
/* The trap: every other chart on this page is "higher is better". */
ok("it says which way is good", /lower is better/i.test(t));
ok("…and the mileage charts still say the opposite", /higher is better/i.test(t));

/* The card, not the line of text inside it: the innermost div that
   holds both the title and the chart it belongs to. */
const card = (title) => page.locator("div")
  .filter({ hasText: new RegExp(`^${title}`) })
  .filter({ has: page.locator("svg") })
  .last();

console.log("\n── cost per mile ──");
const byTire = card("By tire");
let c = await byTire.innerText();
ok("the Continental is on it", /Continental HDC3/.test(c), c.slice(0, 300));
/* Two spellings, one bar. This is the catalog reaching the chart. */
ok("…once, not once per spelling",
  (c.match(/Continental HDC/g) || []).length === 1,
  (c.match(/Continental HDC\S*/g) || []).join(" | "));
ok("the cap is marked as one", /Bandag BDR cap/.test(c), c.slice(0, 300));
ok("the Continental is six tenths of a cent a mile", /\$0\.006/.test(c), c.slice(0, 400));
ok("the cap is four tenths", /\$0\.004/.test(c), c.slice(0, 400));
/* The unpriced Michelin must not appear as a nought — a bar at zero
   would be the cheapest tire on the chart. */
ok("the tire with no price is not on the chart at all",
  !/Toyo/.test(c), c.slice(0, 400));
/* It has a price but no mileage, so it has no cost per mile. A bar
   here would have to be made up. */
ok("nor is the one nobody has gauged yet", !/Michelin/.test(c), c.slice(0, 400));
/* The fleet rule, applied to money. A $220 pickup tire is the
   cheapest thing in the yard per mile and has nothing to do with what
   a dump truck should be running. */
ok("and the pickup's tire is not in the haul fleet's money",
  !/Firestone/.test(c), c.slice(0, 400));

/* Cheapest first, which is the opposite of the charts above. Read off
   the axis in the order the chart draws it. */
const axisOrder = await byTire.locator("svg text").allTextContents();
const firstTire = axisOrder.find((x) => /Bandag|Continental|Goodyear/.test(x));
ok("the cheapest a mile is first", /Bandag/.test(firstTire || ""), axisOrder.join(" | "));

console.log("\n── and per 32nd ──");
await page.getByRole("button", { name: "$ / 32nd", exact: true }).first().click();
await page.waitForTimeout(900);
c = await card("By tire").innerText();
ok("the note says what the figure is",
  /per 32nd of usable tread/i.test(await page.locator("body").innerText()));
/* 655.24 over 24 usable — not over 28. The pull point is the whole
   rule, and $23.40 would be the figure if it were ignored. */
ok("the Continental is $27.30 a 32nd", /\$27\.30/.test(c), c.slice(0, 400));
ok("…not the $23.40 that ignoring the pull point would give",
  !/\$23\.40/.test(c), c.slice(0, 400));
ok("the cap is $17.22", /\$17\.22/.test(c), c.slice(0, 400));
/* The whole reason this figure is kept separate from cost per mile:
   a tire with no wear rate still has one, and it is what somebody
   holding two quotes is comparing. */
ok("the tire nobody has gauged is here, where it belongs",
  /Michelin XZY3/.test(c), c.slice(0, 400));
ok("…at $20.83 a 32nd", /\$20\.83/.test(c), c.slice(0, 400));

await page.getByRole("button", { name: "$ / mile", exact: true }).first().click();
await page.waitForTimeout(700);

console.log("\n── retread vs. virgin, in money ──");
/* The question the fleet is actually asking. */
const typeCards = await page.getByText("Retread vs. virgin").count();
ok("there is a money one as well as a mileage one", typeCards >= 2, String(typeCards));

/* What the bar is actually built from. Four of the five virgin tires
   on this fleet carry a price, so the tooltip must say four — a bar
   that quietly claims five is a bar somebody trusts more than they
   should. Hovered rather than read, because that is the only way the
   figure appears. */
const moneyType = page.locator("div")
  .filter({ hasText: /^Retread vs\. virgin\$ per/ })
  .filter({ has: page.locator("svg") }).last();
const bars = moneyType.locator(".recharts-rectangle");
const tips = [];
const barCount = await bars.count();
for (let i = 0; i < barCount; i++) {
  await bars.nth(i).hover({ force: true });
  await page.waitForTimeout(400);
  const tip = await moneyType.locator(".recharts-tooltip-wrapper").innerText();
  tips.push(tip.replace(/\s+/g, " ").trim());
  await page.mouse.move(5, 5);
  await page.waitForTimeout(150);
}
ok("both bars have a tooltip", barCount === 2, `${barCount} bars: ${tips.join(" / ")}`);
/* Five virgin tires are on this fleet and four of them carry a price.
   The bar is built from the four, so it has to say four. */
ok("the tooltip counts the tires it could price",
  tips.some((x) => /\b4 tires\b/.test(x)), tips.join(" / "));
ok("…and not the ones it had to leave out",
  !tips.some((x) => /\b5 tires\b/.test(x)), tips.join(" / "));
ok("the cap's bar counts the one cap", tips.some((x) => /\b1 tire\b/.test(x)), tips.join(" / "));

console.log("\n── the fleets keep their money apart ──");
await page.getByRole("button", { name: /^Light trucks/i }).first().click();
await page.waitForTimeout(1000);
let lt = await card("By tire").innerText();
ok("the pickup's tire is on its own fleet", /Firestone Transforce/.test(lt), lt.slice(0, 300));
ok("…and the dump truck's tires are not", !/Continental/.test(lt), lt.slice(0, 300));
ok("…and the coverage line follows the fleet",
  /This tire has a price on it/.test(await page.locator("body").innerText()),
  (await page.locator("body").innerText()).match(/[^\n]*price on it[^\n]*/)?.[0]);
await page.getByRole("button", { name: /^Haul/i }).first().click();
await page.waitForTimeout(1000);

console.log("\n── the table ──");
t = await page.locator("body").innerText();
ok("there is a cost per 32nd column", /\$ \/ 32nd/.test(t));
ok("…and a cost per mile column", /\$ \/ mile/.test(t));
const row = (truckPos) => page.locator("tr").filter({ hasText: truckPos }).last();
const conti = await row("3LO").innerText();
ok("the Continental's row carries both figures",
  /\$27\.30/.test(conti) && /\$0\.006/.test(conti), conti);
/* A tire still on a truck is a projection and says so. */
ok("…and says the per-mile figure is an estimate", /est\./.test(conti), conti);
const gone = await row("2LO").innerText();
ok("a tire already off is not an estimate", !/est\./.test(gone), gone);
ok("…and is priced on the miles it actually ran", /\$0\.007/.test(gone), gone);
/* Why, not a blank. */
const mich = await row("4RO").innerText();
ok("the unpriced tire says why its cost is blank", /no price on it/i.test(mich), mich);

ok("nothing threw", crashes.length === 0, crashes.join(" | "));
ok("no rejected requests at all", rest400.length === 0, rest400.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
