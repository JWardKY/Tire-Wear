/* The replacement forecast, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-tireforecast.mjs holds the arithmetic. This holds what
   only the screen can answer: that the forecast is on the Analysis tab,
   that it reads from the same tires, gauges and odometer the rest of
   the app does, and — the part that matters for an order — that a tire
   held back for checking is visibly NOT in the totals somebody buys
   from.

   The fixture is a small copy of what the real fleet threw up:
     DT-892 4LI at its pull point            → now
     DT-891 3LI gauged twice, low            → within a month
     DT-899 4RI gauged twice                 → a few months out
     DT-1810 4LO mounted at 21, gauged once at 12, 3,174 mi
                                              → check before ordering
     DT-1801 1L gauged once, 600 mi          → too few miles to trust
     DT-1802 2LO never gauged since mount    → needs a second reading
   …with each truck's odometer read daily at 150 miles a day.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-forecastboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";
import { todayISO } from "../src/day.js";

const URL_ = process.env.APP_URL || "http://localhost:4173/";
let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const TODAY = todayISO();
const day = (n) => new Date(Date.parse(TODAY + "T12:00:00Z") - n * 86400000).toISOString().slice(0, 10);

const VEH = ["DT-892", "DT-891", "DT-899", "DT-1810", "DT-1801", "DT-1802"];
const vehicles = VEH.map((num, i) => ({ id: `v${i}`, number: num, make: "Mack", model: "Granite",
  model_year: "2022", division: "DT", axle_config: "dump12", motive_vehicle_id: null,
  motive_asset_id: null, active: true, notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" }));
const vid = (num) => vehicles.find((v) => v.number === num).id;

/* Ninety days of odometer, 150 miles a day, ending today. */
const odos = [];
vehicles.forEach((v) => {
  for (let i = 90; i >= 0; i -= 1) {
    odos.push({ id: `${v.id}-${i}`, vehicle_id: v.id, reading_date: day(i),
      odometer: 100000 + (90 - i) * 150, source: "motive", created_at: day(i) });
  }
});

const tire = (id, veh, pos, size, depth, mountOdo) => ({
  id, vehicle_id: vid(veh), position: pos, brand: "Continental", model: "HDC3", size,
  tire_type: "virgin", wheel_material: "aluminum", casing_id: null,
  mounted_date: day(80), mounted_odometer: mountOdo, mounted_depth: depth,
  cost: 600, removed_date: null, removed_odometer: null, removed_reason: null,
  notes: null, created_by: null, created_at: day(80), retread_count: null, model_id: null,
});
const tires = [
  tire("t-past", "DT-892", "4LI", "11R24.5", 28, 90000),
  tire("t-soon", "DT-891", "3LI", "11R24.5", 28, 90000),
  tire("t-mid", "DT-899", "4RI", "11r24.5", 28, 90000),
  tire("t-suspect", "DT-1810", "4LO", "11R24.5", 21, 100000),
  tire("t-young", "DT-1801", "1L", "11R22.5", 28, 112900),
  tire("t-none", "DT-1802", "2LO", "425/65 R22.5", 28, 100000),
];
const rd = (id, t, odo, d) => ({ id, tire_id: t, reading_date: day(10), odometer: odo,
  depth_32nds: d, created_by: null, created_at: day(10) });
const readings = [
  rd("r1", "t-past", 110000, 4),
  rd("r2", "t-soon", 100000, 10), rd("r3", "t-soon", 104000, 6),
  rd("r4", "t-mid", 100000, 15), rd("r5", "t-mid", 106000, 9),
  rd("r6", "t-suspect", 103174, 12),
  rd("r7", "t-young", 113500, 25),
];

const rows = {
  tw_vehicles: vehicles, tw_tires: tires, tw_tread_readings: readings,
  tw_tire_wear: [], tw_tire_models: [], tw_odometer_log: odos,
  tw_tire_brands: [{ id: "b1", name: "Continental", sort_order: 1, active: true }],
  tw_settings: [{ id: true, pull_steer_32nds: 6, pull_other_32nds: 4, default_new_depth: 28,
    dual_match_32nds: 4, alert_emails: [], updated_at: "2026-01-01" }],
  tw_mechanics: [], tw_cost_codes: [], tw_time_entries: [], tw_hours: [], tw_work_log: [],
  tw_tire_alerts: [], tw_tires_due_out: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  console.log("  node scripts/test-forecastboard.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1400 } });
await ctx.addInitScript(new Function(
  `localStorage.setItem("tirewear:who", "jason_ward@theallen.com");`));
await fakeRest(ctx, { rows });

/* The app reads wear rates from tw_tire_wear, a VIEW the fake does not
   compute. Built here from the readings, the same way the database
   does it, so the screen sees what it would see for real. */
await ctx.route("**/rest/v1/tw_tire_wear*", async (route) => {
  if (route.request().method() !== "GET") return route.fallback();
  rows.tw_tire_wear = tires.map((t) => {
    const pts = [{ odo: t.mounted_odometer, d: t.mounted_depth },
      ...readings.filter((r) => r.tire_id === t.id).map((r) => ({ odo: r.odometer, d: r.depth_32nds }))]
      .sort((a, b) => a.odo - b.odo);
    const a = pts[0], b = pts[pts.length - 1];
    const miles = b.odo - a.odo, worn = a.d - b.d;
    return { tire_id: t.id, point_count: pts.length, first_odometer: a.odo, first_depth: a.d,
      last_odometer: b.odo, last_depth: b.d, miles_run: miles, worn_32nds: worn,
      miles_per_32nd: miles > 0 && worn > 0 ? miles / worn : null, miles_per_mil: null };
  });
  return route.fallback();
});

const page = await ctx.newPage();
const crashes = [], rest400 = [];
page.on("pageerror", (e) => crashes.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Tires", exact: true }).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Analysis", exact: true }).first().click();
await page.waitForTimeout(1800);

let t = await page.locator("body").innerText();
console.log("── the report ──");
ok("it is on the Analysis tab", /Tires to replace/i.test(t), t.slice(0, 400));
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));
/* The coverage line is the first thing under the heading, because a
   total that does not say what it leaves out reads as the whole bill. */
ok("it says how much of the fleet it covers", /Covers 3 of 6 tires/i.test(t),
  (t.match(/Covers[^\n]*/) || [""])[0]);
ok("…and calls the totals a floor", /floor, not the whole bill/i.test(t));

console.log("\n── now ──");
ok("one tire at the pull point now", /1\s+tire is at or past the pull point now/i.test(t),
  (t.match(/[^\n]*pull point now[^\n]*/i) || [""])[0]);
await page.getByRole("button", { name: /Show the 1 tire$/ }).first().click();
await page.waitForTimeout(500);
t = await page.locator("body").innerText();
ok("…which is DT-892 4LI", /DT-892\s+4LI/.test(t.replace(/\t/g, " ")),
  (t.match(/DT-892[^\n]*/) || [""])[0]);

console.log("\n── what to buy ──");
/* Running totals: the past tire, plus DT-891 within a month, plus
   DT-899 by three months. Sizes folded: 11r24.5 is 11R24.5. */
const sizeRow = (size) => (t.match(new RegExp(`${size.replace(/[/.]/g, "\\$&")}[^\\n]*`)) || [""])[0];
ok("11R24.5 in one row, including the one typed 11r24.5", !/11r24\.5/.test(t),
  sizeRow("11R24.5"));
/* Read from the purchasing table itself. The same size also appears in
   the "now" list opened above it, and reading body text would pick up
   whichever came first. */
const sizeTable = page.locator("table").filter({ hasText: "By 12 mo" }).first();
const r11 = (await sizeTable.locator("tr").filter({ hasText: /^11R24\.5/ }).first()
  .locator("td").allInnerTexts()).map((x) => x.trim());
ok("…with running totals that only go up",
  r11.slice(1).map(Number).every((n, i, a) => i === 0 || n >= a[i - 1]), r11.join(" "));
ok("…three to have by twelve months", r11[r11.length - 1] === "3", r11.join(" "));
ok("the all-sizes row agrees", /All sizes\s+1\s+2\s+3\s+3\s+3/.test(t.replace(/\t/g, " ")),
  (t.match(/All sizes[^\n]*/) || [""])[0]);

console.log("\n── held back ──");
/* The point. DT-1810's tire rests on one gauge against a mount depth
   that looks wrong, and would otherwise be on next month's order. */
ok("DT-1810 is listed to check before ordering", /Check before ordering\s*·\s*1/i.test(t),
  (t.match(/[^\n]*Check before ordering[^\n]*/i) || [""])[0]);
ok("…and the screen says it is not in the totals", /Not included in the totals above/i.test(t));
await page.getByRole("button", { name: /Show the 1 tires$/ }).first().click()
  .catch(() => {});
await page.waitForTimeout(400);
t = await page.locator("body").innerText();
ok("…naming the mount depth to check", /mount depth of 21/.test(t),
  (t.match(/[^\n]*mount depth of[^\n]*/) || [""])[0]);

console.log("\n── unknown, not fine ──");
ok("tires it cannot forecast are counted", /Cannot forecast yet\s*·\s*2/i.test(t),
  (t.match(/[^\n]*Cannot forecast yet[^\n]*/i) || [""])[0]);
ok("…as unknown, not as fine", /not counted as fine/i.test(t));
ok("…with the reason: too few miles", /Wear measured over too few miles/i.test(t));
ok("…and: needs a second reading", /needs a second reading/i.test(t));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));
await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
