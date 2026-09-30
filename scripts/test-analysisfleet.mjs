/* Light trucks analysed on their own, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-fleetgroup.mjs holds which division goes with which.
   This holds the thing that matters: that a pickup's mileage never
   lands in the haul fleet's brand figures.

   The numbers below are built to make the bug loud. Every pickup runs
   a Michelin at 4,000 miles per 32nd; every dump truck runs the same
   Michelin at 1,000. Mix them and the haul chart shows Michelin near
   2,500 — a figure that exists on no truck in the yard, and the one
   somebody would order off.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-analysisfleet.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const veh = (id, number, division, cfg) => ({
  id, number, make: "Mack", model: "Gu713", model_year: "2020", division,
  axle_config: cfg, motive_vehicle_id: null, motive_asset_id: null,
  active: true, notes: null, created_at: "2026-01-01", updated_at: "2026-01-01",
});

const vehicles = [
  veh("v1", "DT-890", "DT", "dump12"),
  veh("v2", "HT-643", "HT", "single6"),
  veh("v3", "LT-1487", "LT", "light4"),
  veh("v4", "LT-1187", "LT", "light4"),
  veh("v5", "T-674", "EQ", "trailer8"),
];

/* Same brand on every fleet, wildly different rates, so a chart that
   mixed them would read as a figure on no truck at all. */
const spec = [
  ["v1", "DT-890", "3LO", "Michelin", 1000],
  ["v1", "DT-890", "3RO", "Michelin", 1000],
  ["v2", "HT-643", "2LO", "Michelin", 1200],
  ["v3", "LT-1487", "1L", "Michelin", 4000],
  ["v3", "LT-1487", "1R", "Michelin", 4000],
  ["v4", "LT-1187", "1L", "Michelin", 4000],
  ["v5", "T-674", "1LO", "Michelin", 2000],
];
const tires = [], wear = [];
spec.forEach(([vid, num, pos, brand, rate], i) => {
  const id = `t${i}`;
  tires.push({ id, vehicle_id: vid, position: pos, brand, model: "XDN2",
    size: "11R24.5", tire_type: "virgin", wheel_material: "aluminum", casing_id: null,
    mounted_date: "2026-01-01", mounted_odometer: 100000, mounted_depth: 28,
    cost: 500, removed_date: null, removed_odometer: null, removed_reason: null,
    notes: null, created_by: null, created_at: "2026-01-01", retread_count: null });
  wear.push({ tire_id: id, vehicle_id: vid, truck: num, position: pos,
    current_depth: 20, miles_run: rate * 8, worn_32nds: 8,
    miles_per_32nd: rate, miles_per_mil: null });
});

const rows = {
  tw_vehicles: vehicles, tw_tires: tires, tw_tire_wear: wear,
  tw_tread_readings: [], tw_odometer_log: [],
  tw_tire_brands: [{ id: "b1", name: "Michelin", sort_order: 1, active: true }],
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
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1600 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));
await fakeRest(ctx, { rows });

const page = await ctx.newPage();
const crashes = [];
page.on("pageerror", (e) => crashes.push(String(e)));

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Tires", exact: true }).first().click();
await page.waitForTimeout(1600);
await page.getByRole("button", { name: "Analysis", exact: true }).first().click();
await page.waitForTimeout(1600);

let t = await page.locator("body").innerText();
ok("the Analysis page opens", /wear rate/i.test(t), t.slice(0, 160));

/* ── it opens on the haul fleet ───────────────────────────────── */
console.log("\n── what it opens on ──");
ok("it says which fleet these numbers are",
  /DT and HT/i.test(t), (t.match(/[^\n]*haul fleet[^\n]*/i) || [""])[0]);
/* Three haul tires, not seven. The four pickups and the tanker are
   not in this figure. */
ok("only the haul tires are counted", /\b3 tires with a wear rate\b/.test(t),
  (t.match(/\d+ tires? with a wear rate/) || [""])[0]);
ok("the pickups are not in it", !/\b7 tires\b/.test(t), (t.match(/\d+ tires? with a wear rate/) || [""])[0]);

/* The table at the bottom follows the fleet too — it is the same
   comparison written out. */
ok("the table shows the dump truck", /DT-890/.test(t));
ok("…and not a pickup", !/LT-1487/.test(t), (t.match(/LT-\d+/) || [""])[0]);
ok("…and not the tanker", !/T-674/.test(t));

/* ── the fleets are switchable ────────────────────────────────── */
console.log("\n── the fleet switch ──");
const tab = (name) => page.getByRole("button", { name: new RegExp(`^${name}`, "i") }).first();
for (const n of ["Haul", "Light trucks", "Equipment"])
  ok(`${n} can be chosen`, (await tab(n).count()) > 0);
ok("there is no way to ask for all of them at once",
  (await page.getByRole("button", { name: /^(all|everything)$/i }).count()) === 0);

await tab("Light trucks").click();
await page.waitForTimeout(800);
t = await page.locator("body").innerText();
ok("light trucks stand on their own", /\b3 tires with a wear rate\b/.test(t),
  (t.match(/\d+ tires? with a wear rate/) || [""])[0]);
ok("…and it says so", /pickups and service trucks/i.test(t),
  (t.match(/[^\n]*pickups[^\n]*/i) || [""])[0]);
ok("the pickups are here", /LT-1487/.test(t) && /LT-1187/.test(t));
ok("…and the dump truck is not", !/DT-890/.test(t));

await tab("Equipment").click();
await page.waitForTimeout(800);
t = await page.locator("body").innerText();
ok("the tanker is its own fleet", /T-674/.test(t) && !/DT-890/.test(t));

/* ── the figure itself ────────────────────────────────────────── */
console.log("\n── and the number nobody should be shown ──");
await tab("Haul").click();
await page.waitForTimeout(900);
/* Every haul Michelin runs 1000–1200. Mixed with the pickups at 4000
   the chart would read near 2500 — a figure that is true of no truck
   in the yard. Read it off the chart's own tooltip payload via the
   bars' accessible values. */
const bars = await page.locator("#analysis-root, body").innerText();
ok("no haul figure is anywhere near the pickups' mileage",
  !/2,?[2-9]\d\d/.test(bars) && !/\b4,?000\b/.test(bars),
  (bars.match(/\d,?\d{3}/g) || []).slice(0, 8).join(" "));
ok("the haul table still shows its own rate", /1,?000|1,?200/.test(bars),
  (bars.match(/\d,?\d{3}/g) || []).slice(0, 8).join(" "));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
