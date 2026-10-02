/* A catalog price reaching the tires already on the trucks.
   ─────────────────────────────────────────────────────────────────
   scripts/test-priceflow.mjs holds the rules. This holds the part
   only a browser can answer: that typing a price into the catalog
   offers to put it on the tires that row is fitted to, that the
   offer says what it is about to do before it does it, and — the one
   that matters — that the write goes to exactly those tires and no
   others.

   The fixture is six tires of one pattern in six different states,
   because each state is a different decision:

     two with no price, filed under the row      → written
     one mounted before the catalog existed,
       spelled "HDC 3", with no price            → written, by name
     one that already says $612                  → only if ticked
     one already off the truck                   → never
     the retread of the same pattern             → never

   The last two are the ones worth the test. A pulled tire's cost is
   part of what the fleet has already spent and its cost per mile is
   settled; a cap costs a fraction of a new casing and there are 59 of
   them on this fleet, so putting the virgin price on one is the most
   expensive single mistake this screen could make.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-priceboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const V = "v890";
const M1 = "m1";

/* [id, position, model spelling, type, cost, model_id, removed] */
const spec = [
  ["t1", "3LO", "HDC3",  "virgin",  null, M1,   null],
  ["t2", "3RO", "HDC3",  "virgin",  null, M1,   null],
  ["t3", "3LI", "HDC3",  "virgin",  612,  M1,   null],
  ["t4", "3RI", "HDC 3", "virgin",  null, null, null],
  ["t5", "4LO", "HDC3",  "virgin",  null, M1,   "2026-09-01"],
  ["t6", "4RO", "HDC3",  "retread", null, null, null],
];

const tires = spec.map(([id, pos, model, type, cost, modelId, off]) => ({
  id, vehicle_id: V, position: pos, brand: "Continental", model,
  size: "11R24.5", tire_type: type, wheel_material: "aluminum", casing_id: null,
  mounted_date: "2026-08-25", mounted_odometer: 100000, mounted_depth: type === "retread" ? 18 : 28,
  cost, removed_date: off, removed_odometer: off ? 160000 : null,
  removed_reason: off ? "worn out" : null, notes: null, created_by: null,
  created_at: "2026-08-25", retread_count: type === "retread" ? 1 : null,
  model_id: modelId,
}));

const rows = {
  tw_vehicles: [{ id: V, number: "DT-890", make: "Kenworth", model: "T880",
    model_year: "2022", division: "DT", axle_config: "dump12",
    motive_vehicle_id: null, motive_asset_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  tw_tires: tires,
  tw_tire_models: [{ id: M1, brand: "Continental", model: "HDC3", size: "11R24.5",
    tire_type: "virgin", new_depth_32nds: 28, cost: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  tw_tread_readings: [], tw_tire_wear: [], tw_odometer_log: [],
  tw_tire_brands: [{ id: "b1", name: "Continental", sort_order: 1, active: true }],
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
  console.log("  node scripts/test-priceboard.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));
const { writes } = await fakeRest(ctx, { rows });

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
await page.getByRole("button", { name: "Tire catalog", exact: true }).first().click();
await page.waitForTimeout(900);

let t = await page.locator("body").innerText();
ok("the catalog opens", /Continental/.test(t) && /HDC3/.test(t), t.slice(0, 200));
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));

console.log("\n── before there is a price on the row ──");
/* Nothing to put on anything, so nothing to offer. A button that
   opens a dialog to say "there is nothing to do" is a button that
   teaches people not to press it. */
ok("there is no button to price the fitted tires yet",
  (await page.getByRole("button", { name: /^Price \d+ fitted/ }).count()) === 0);

console.log("\n── typing the price in ──");
/* The price box is the second one in the row; the first is the depth. */
const row = page.locator("tbody tr").filter({ hasText: "HDC3" }).first();
const price = row.locator("input").nth(1);
ok("the price box is there", (await price.count()) > 0);
await price.click();
await page.keyboard.type("655.24");
await page.keyboard.press("Tab");
await page.waitForTimeout(1400);

console.log("\n── what it offers ──");
t = await page.locator("body").innerText();
ok("it offers to put it on the tires already fitted",
  /Put this price on the tires already fitted\?/i.test(t), t.slice(0, 400));
/* Three with no price: the two filed under the row, and the one
   spelled "HDC 3" that predates the catalog. */
ok("it counts the ones with no price",
  /3 tires on the trucks have no price on them/.test(t),
  (t.match(/[^\n]*no price on them[^\n]*/) || [""])[0]);
ok("…and the one that disagrees, separately",
  /1 tire says something different/.test(t),
  (t.match(/[^\n]*something different[^\n]*/) || [""])[0]);
/* The rule stated on the screen, not only in the code. */
ok("it says it will not touch a tire that has come off",
  /Only tires still on a truck/i.test(t), t.slice(0, 600));
/* The price and nothing else. A tire's mount depth was read off that
   wheel with a gauge; the catalog's depth is what a new one has. */
ok("…and that it is the price only, not the tread",
  /tread depth on a tire is not touched/i.test(t), t.slice(0, 700));
/* The money it is about to commit to, before the button. */
ok("it says what that comes to", /\$1,965\.72/.test(t),
  (t.match(/[^\n]*of rubber[^\n]*/) || [""])[0]);

const fitBtn = page.getByRole("button", { name: /^PUT IT ON/ }).first();
ok("the button says how many", /PUT IT ON 3/.test(await fitBtn.innerText()),
  await fitBtn.innerText());

console.log("\n── the one that already says something else ──");
const tick = page.locator('input[type="checkbox"]').first();
ok("it is offered", (await tick.count()) > 0);
ok("…and is not ticked to start with", !(await tick.isChecked()));
ok("…and the screen shows what it would overwrite", /DT-890 3LI \$612\.00/.test(t),
  (t.match(/[^\n]*3LI[^\n]*/) || [""])[0]);
await tick.check();
await page.waitForTimeout(400);
ok("ticking it takes the fourth tire too",
  /PUT IT ON 4/.test(await fitBtn.innerText()), await fitBtn.innerText());
await tick.uncheck();
await page.waitForTimeout(400);
ok("…and unticking puts it back", /PUT IT ON 3/.test(await fitBtn.innerText()),
  await fitBtn.innerText());

console.log("\n── what it writes ──");
await fitBtn.click();
await page.waitForTimeout(1400);

const wrote = writes.filter((w) => w.table === "tw_tires" && w.method === "PATCH");
ok("it writes to the tires", wrote.length > 0, JSON.stringify(writes.map((w) => w.table)));
const filter = wrote.map((w) => w.filter || "").join(" ");
const body = wrote[0]?.body || {};
ok("at the price typed", Number(body.cost) === 655.24, JSON.stringify(body));
/* Filed under the row while it is in there, so the next price change
   finds it by id rather than by spelling. */
ok("…and files them under the catalog row", body.model_id === M1, JSON.stringify(body));
/* Said on the dialog and true in the write: the price and the row it
   came off, and nothing else. A mount depth is what somebody read off
   that wheel with a gauge, and the catalog's depth is what a new one
   has — writing one over the other would put every wear figure on the
   tire wrong. */
ok("and the write carries nothing but the price and the row",
  Object.keys(body).sort().join() === "cost,model_id", Object.keys(body).sort());
ok("…so no tread depth goes anywhere near it",
  !/depth/i.test(JSON.stringify(body)), JSON.stringify(body));

ok("the two with no price are written", /t1/.test(filter) && /t2/.test(filter), filter);
/* The one the catalog could only reach by name. */
ok("…and the one that predates the catalog", /t4/.test(filter), filter);
ok("the one that already said $612 is left alone", !/t3/.test(filter), filter);
/* The two that would be real damage. */
ok("the tire already off the truck is not touched", !/t5/.test(filter), filter);
ok("…and neither is the cap", !/t6/.test(filter), filter);

t = await page.locator("body").innerText();
ok("the offer closes", !/Put this price on the tires already fitted\?/i.test(t));

console.log("\n── and the button beside Edit ──");
/* Three are done; the one that says $612 is still outstanding, so the
   row still offers to deal with it — from the row this time, without
   having to retype the price to trigger anything. */
const again = page.getByRole("button", { name: /^Price \d+ fitted/ }).first();
ok("the row carries a button for what is left", (await again.count()) > 0, t.slice(0, 400));
ok("…and it says how many", /Price 1 fitted/.test(await again.innerText()),
  await again.innerText());
await again.click();
await page.waitForTimeout(700);
t = await page.locator("body").innerText();
ok("it opens the same offer", /Put this price on the tires already fitted\?/i.test(t),
  t.slice(0, 300));
ok("…with only the one left to decide on", /1 tire says something different/.test(t),
  (t.match(/[^\n]*something different[^\n]*/) || [""])[0]);
/* Nothing is blank any more, so with nothing ticked there is nothing
   to write and the button cannot be pressed. */
const left = page.getByRole("button", { name: /^PUT IT ON/ }).first();
ok("nothing is written until the tick is made", await left.isDisabled(),
  await left.innerText());
await page.locator('input[type="checkbox"]').first().check();
await page.waitForTimeout(400);
ok("…and then it can be", !(await left.isDisabled()), await left.innerText());
await left.click();
await page.waitForTimeout(1200);
const second = writes.filter((w) => w.table === "tw_tires" && w.method === "PATCH").slice(1);
ok("the overwrite reaches the one that disagreed",
  second.some((w) => /t3/.test(w.filter || "")), JSON.stringify(second.map((w) => w.filter)));
ok("…and still not the pulled tire or the cap",
  !second.some((w) => /t5|t6/.test(w.filter || "")), JSON.stringify(second.map((w) => w.filter)));

t = await page.locator("body").innerText();
ok("with every fitted tire priced, the button is gone",
  (await page.getByRole("button", { name: /^Price \d+ fitted/ }).count()) === 0, t.slice(0, 400));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));
ok("no rejected requests at all", rest400.length === 0, rest400.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
