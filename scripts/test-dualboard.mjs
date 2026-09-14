/* Mismatched duals on the Tires screen, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-duals.mjs holds the rule. This holds the part that
   matters to somebody in a shop: that a truck with a bad pair is
   findable without opening all 134, and that when they open it the
   screen says which two wheels and by how much.

   `npm run build` passes on an undefined global, and the fake database
   refuses any column the real schema does not have.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-dualboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const POS12 = ["1L", "1R", "2L", "2R",
  "3LI", "3LO", "3RI", "3RO", "4LI", "4LO", "4RI", "4RO"];

/* DT-881 as it actually was: 4RI at 27/32 beside 4RO at 15/32.
   DT-864 is measured and fine. */
const DEPTH = {
  "DT-881": { "1L": 12, "1R": 12, "2L": 20, "2R": 20,
    "3LI": 22, "3LO": 22, "3RI": 18, "3RO": 18,
    "4LI": 24, "4LO": 24, "4RI": 27, "4RO": 15 },
  "DT-864": Object.fromEntries(POS12.map((p) => [p, 20])),
};

const tires = [], wear = [], readings = [];
for (const [truck, depths] of Object.entries(DEPTH)) {
  const vid = `v${truck.slice(3)}`;
  POS12.forEach((pos, i) => {
    const id = `${vid}-${i}`;
    tires.push({ id, vehicle_id: vid, position: pos, brand: "Continental",
      model: null, size: "11R24.5", tire_type: "virgin", wheel_material: null,
      casing_id: null, mounted_date: "2026-01-05", mounted_odometer: 380000,
      mounted_depth: 28, cost: 500, removed_date: null, removed_odometer: null,
      removed_reason: null, notes: null, created_by: null, created_at: "2026-01-05" });
    /* A depth needs a reading behind it — the app takes current tread
       from the wear view, which is built from readings. */
    readings.push({ id: `r-${id}`, tire_id: id, reading_date: "2026-09-01",
      odometer: 412000, depth_32nds: depths[pos], recorded_by: "Will Strong",
      created_at: "2026-09-01T12:00:00Z" });
    wear.push({ tire_id: id, point_count: 2, first_odometer: 380000, first_depth: 28,
      last_odometer: 412000, last_depth: depths[pos], miles_run: 32000,
      worn_32nds: 28 - depths[pos], miles_per_32nd: 2000, miles_per_mil: 64 });
  });
}

const veh = (num, id) => ({ id, number: num, make: "Mack", model: "Granite",
  model_year: 2019, division: "DT", axle_config: "dump12", motive_vehicle_id: null,
  active: true, notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" });

const rows = {
  tw_vehicles: [veh("DT-881", "v881"), veh("DT-864", "v864")],
  tw_tires: tires,
  tw_tread_readings: readings,
  tw_tire_wear: wear,
  tw_odometer_log: [
    { id: "o1", vehicle_id: "v881", reading_date: "2026-09-01", odometer: 412000,
      source: "inspection", recorded_by: "Will Strong", created_at: "2026-09-01" },
  ],
  tw_tire_brands: [{ id: "b1", name: "Continental", sort_order: 1, active: true }],
  tw_settings: [{ id: true, pull_steer_32nds: 6, pull_other_32nds: 4,
    default_new_depth: 28, dual_match_32nds: 4, alert_emails: [],
    updated_at: "2026-01-01" }],
  tw_mechanics: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  console.log("  VITE_SUPABASE_URL=https://example.supabase.co \\");
  console.log("  VITE_SUPABASE_ANON_KEY=placeholder npm run build");
  console.log("  npx vite preview --port 4173 &");
  console.log("  node scripts/test-dualboard.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));
const { writes } = await fakeRest(ctx, { rows });

const page = await ctx.newPage();
const errors = [], rest400 = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Tires", exact: true }).first().click();
await page.waitForTimeout(2000);

console.log("── finding it without opening every truck ──");
let t = await page.locator("body").innerText();
ok("no 'does not exist' banner", !/does not exist/i.test(t));
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));
ok("the bad truck is called out on the way in", /1 mismatched pair/i.test(t));
ok("…and the truck is named", /DT-881/.test(t));
/* The truck that is measured and fine must not be in the list, or the
   list is just the fleet again. */
ok("the truck that is fine is not flagged",
  !/DT-864[\s\S]{0,80}mismatched/i.test(t));

console.log("\n── opening the truck ──");
await page.getByText("DT-881").first().click();
await page.waitForTimeout(1500);
t = await page.locator("body").innerText();

ok("the banner says a pair does not match", /A pair of duals does not match/i.test(t));
ok("…which end", /4R\b/.test(t));
ok("…how far apart", /12\/32 apart/.test(t));
ok("…and which wheel is which", /4RO at 15\/32 beside 4RI at 27\/32/.test(t));
ok("…and why it matters", /deeper tire carries the load/i.test(t));
ok("it says where the number comes from", /Anything over 4\/32 is flagged/i.test(t));

/* Both wheels of the pair are ringed on the diagram, and nothing else
   is — a ring on the wrong wheel sends somebody to the wrong tire. */
const ringed = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("div")) {
    const sh = getComputedStyle(el).boxShadow || "";
    if (!/rgb\(201, 138, 18\)/.test(sh)) continue;
    const badge = el.querySelector("div");
    if (badge) out.push(badge.textContent.trim());
  }
  return out;
});
ok("both wheels of the pair are ringed",
  ringed.includes("4RI") && ringed.includes("4RO"), ringed.join(","));
ok("…and only those two", ringed.length === 2, `${ringed.length}: ${ringed.join(",")}`);

console.log("\n── the wheel positions table ──");
ok("the row says how far off its pair it is", /12\/32 above 4RO/.test(t));
ok("…and the other way for the shallow one", /12\/32 below 4RI/.test(t));
/* A pair within spec must say nothing at all. */
ok("a pair that matches says nothing", !/0\/32 (above|below)/.test(t));

console.log("\n── a truck that is fine ──");
await page.getByText("DT-864").first().click();
await page.waitForTimeout(1500);
t = await page.locator("body").innerText();
ok("no banner on the good truck", !/duals does not match/i.test(t));
ok("…and nothing about being off a pair", !/off its pair|above 4|below 4/.test(t));

console.log("\n── changing where the line is ──");
await page.getByRole("button", { name: "Settings", exact: true }).first().click();
await page.waitForTimeout(1200);
const box = page.getByLabel(/Flag duals more than/i).or(
  page.locator('input[type="number"]').nth(3));
await box.fill("15");
await box.blur();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Fleet", exact: true }).first().click();
await page.waitForTimeout(1800);
t = await page.locator("body").innerText();
ok("a wider tolerance stops flagging the 12/32 pair", !/mismatched pair/i.test(t));

const saved = writes.filter((w) => w.table === "tw_settings");
ok("the threshold was saved", saved.length === 1, `${saved.length} writes`);
ok("…as the column the schema has", saved[0]?.body?.dual_match_32nds === 15,
  JSON.stringify(saved[0]?.body));

console.log("\npage errors:", errors.length ? errors : "none");
bad += errors.length;
await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
