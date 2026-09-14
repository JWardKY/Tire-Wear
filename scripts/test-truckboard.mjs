/* The truck file, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-truckfile.mjs holds the two things that are arithmetic:
   finding the unit somebody means, and adding the file up. This holds
   the page — twelve reads across eleven tables, six cards, and a date
   range that must narrow the history without ever making a tire or an
   open defect disappear.

   `npm run build` passes on an undefined global, and the fake database
   refuses any column the real schema does not have. That second part is
   the point here: this page selects more columns from more tables than
   anything else in the app.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-truckboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const V = "v881";
const rows = {
  tw_vehicles: [
    { id: V, number: "DT-881", make: "Mack", model: "Granite", model_year: 2019,
      division: "DT", axle_config: "dump12", motive_vehicle_id: "mv1", active: true,
      notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
    { id: "v1881", number: "DT-1881", make: "Mack", model: "Granite", model_year: 2021,
      division: "DT", axle_config: "dump12", motive_vehicle_id: null, active: true,
      notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
    { id: "v864", number: "DT-864", make: "Mack", model: "Granite", model_year: 2017,
      division: "DT", axle_config: "dump12", motive_vehicle_id: null, active: true,
      notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
  ],
  tw_vehicle_meter: [
    { vehicle_id: V, truck: "DT-881", current_odometer: 412350,
      odometer_date: "2026-09-01", odometer_source: "motive" },
  ],
  tw_tires: [
    { id: "t1", vehicle_id: V, position: "1L", brand: "Continental", model: "HSR",
      size: "425/65R22.5", tire_type: "virgin", wheel_material: "aluminum",
      casing_id: null, mounted_date: "2026-02-01", mounted_odometer: 380000,
      mounted_depth: 28, cost: 620, removed_date: null, removed_odometer: null,
      removed_reason: null, notes: "Sidewall plug", created_by: null, created_at: "2026-02-01" },
    { id: "t2", vehicle_id: V, position: "4RO", brand: "Bridgestone", model: null,
      size: "11R24.5", tire_type: "retread", wheel_material: null, casing_id: null,
      mounted_date: "2025-06-01", mounted_odometer: 300000, mounted_depth: 22,
      cost: 310, removed_date: "2026-03-15", removed_odometer: 386000,
      removed_reason: "Worn out", notes: null, created_by: null, created_at: "2025-06-01" },
  ],
  tw_defects: [
    { id: "d1", vehicle_id: V, unit_number: "DT-881", state: "open", safety: "unsafe",
      category: "Brake Accessories", note: "Chamber leaking air", driver: "R. Hall",
      source: "motive", defect_key: "k1", first_reported: "2026-09-11T08:00:00Z",
      last_reported: "2026-09-11T08:00:00Z", report_count: 3, priority: "now",
      work_order: "WO-26-0024", claimed_by: null, claimed_at: null, repaired_by: null,
      repaired_at: null, repair_note: null, repair_hours: null, closed_at: null,
      location: null, severity: "major", created_at: "2026-09-11T08:00:00Z",
      created_by: null, updated_at: "2026-09-11T08:00:00Z" },
    { id: "d2", vehicle_id: V, unit_number: "DT-881", state: "repaired", safety: "safe",
      category: "Lights", note: "Marker out", driver: "R. Hall", source: "motive",
      defect_key: "k2", first_reported: "2026-08-01T08:00:00Z",
      last_reported: "2026-08-01T08:00:00Z", report_count: 1, priority: "today",
      work_order: "", claimed_by: null, claimed_at: null, repaired_by: "Dylan Barnes",
      repaired_at: "2026-08-03T15:00:00Z", repair_note: "New marker", repair_hours: 0.5,
      closed_at: "2026-08-03T15:00:00Z", location: null, severity: "minor",
      created_at: "2026-08-01T08:00:00Z", created_by: null, updated_at: "2026-08-03T15:00:00Z" },
    /* Synced for a unit the roster has not matched: text only, no
       vehicle_id. Reading on vehicle_id alone would lose it. */
    { id: "d3", vehicle_id: null, unit_number: "DT-881", state: "open", safety: "safe",
      category: "Heater", note: "Blower noisy", driver: "R. Hall", source: "motive",
      defect_key: "k3", first_reported: "2026-09-12T08:00:00Z",
      last_reported: "2026-09-12T08:00:00Z", report_count: 1, priority: "", work_order: "",
      claimed_by: null, claimed_at: null, repaired_by: null, repaired_at: null,
      repair_note: null, repair_hours: null, closed_at: null, location: null,
      severity: "minor", created_at: "2026-09-12T08:00:00Z", created_by: null,
      updated_at: "2026-09-12T08:00:00Z" },
  ],
  tw_work_orders: [
    { id: "w1", vehicle_id: V, unit_number: "DT-881", wo_number: "WO-26-0024",
      kind: "repair", title: "Brake chamber", detail: "Left rear leaking",
      priority: "now", state: "in progress", created_at: "2026-09-11T09:00:00Z",
      started_at: "2026-09-11T10:00:00Z", completed_at: null, completed_by: null,
      completion_note: null, assigned_to: "m1", assigned_name: "Dylan Barnes",
      assigned_at: "2026-09-11T09:30:00Z", hold_reason: "Waiting on parts",
      hold_since: "2026-09-12T09:00:00Z", source_key: null, created_by: null,
      updated_at: "2026-09-12T09:00:00Z" },
    { id: "w2", vehicle_id: V, unit_number: "DT-881", wo_number: "WO-26-0009",
      kind: "repair", title: "Marker light", detail: "", priority: "today",
      state: "done", created_at: "2026-08-01T09:00:00Z", started_at: "2026-08-03T09:00:00Z",
      completed_at: "2026-08-03T15:00:00Z", completed_by: "Dylan Barnes",
      completion_note: "Replaced", assigned_to: "m1", assigned_name: "Dylan Barnes",
      assigned_at: "2026-08-01T09:30:00Z", hold_reason: null, hold_since: null,
      source_key: null, created_by: null, updated_at: "2026-08-03T15:00:00Z" },
  ],
  tw_pm_due: [
    { vehicle_id: V, truck: "DT-881", division: "DT", program_id: "g1", program: "A service",
      category: "Engine", level: "over", due_date: "2026-09-01", due_at_odometer: 410000,
      miles_remaining: -2350, days_remaining: -12, interval_miles: 15000,
      interval_months: null, lead_miles: 1000, lead_days: 7, est_hours: 2,
      last_date: "2026-06-01", last_odometer: 395000, last_by: "Will Strong",
      last_engine_hours: null, current_odometer: 412350, odometer_date: "2026-09-01" },
    { vehicle_id: V, truck: "DT-881", division: "DT", program_id: "g2", program: "Greasing",
      category: "Chassis", level: "ok", due_date: "2026-11-01", due_at_odometer: 430000,
      miles_remaining: 17650, days_remaining: 48, interval_miles: 20000,
      interval_months: null, lead_miles: 1000, lead_days: 7, est_hours: 1,
      last_date: "2026-08-01", last_odometer: 410000, last_by: "Dylan Barnes",
      last_engine_hours: null, current_odometer: 412350, odometer_date: "2026-09-01" },
  ],
  tw_pm_programs: [
    { id: "g1", name: "A service", category: "Engine" },
    { id: "g2", name: "Greasing", category: "Chassis" },
  ],
  tw_pm_completions: [
    { id: "c1", vehicle_id: V, program_id: "g1", done_date: "2026-06-01",
      done_odometer: 395000, engine_hours: 9100, hours: 2.5, done_by: "Will Strong",
      note: "Oil and filters", created_at: "2026-06-01T12:00:00Z" },
    { id: "c2", vehicle_id: V, program_id: "g2", done_date: "2026-08-01",
      done_odometer: 410000, engine_hours: null, hours: 1, done_by: "Dylan Barnes",
      note: "", created_at: "2026-08-01T12:00:00Z" },
  ],
  tw_hours: [
    { id: "h1", work_date: "2026-08-03", hours: 3.5, cost_code: "800",
      cost_code_name: "Brake System", code_group: "Equipment", where_worked: "shop",
      job_location: null, work_order: "WO-26-0009", note: null,
      work_performed: "Replaced marker light", work_types: ["Repair"],
      mechanic: "Dylan Barnes", mechanic_id: "m1", unit: "DT-881", vehicle_id: V },
    { id: "h2", work_date: "2026-08-03", hours: 2, cost_code: "800",
      cost_code_name: "Brake System", code_group: "Equipment", where_worked: "shop",
      job_location: null, work_order: "WO-26-0009", note: "Second pair of hands",
      work_performed: null, work_types: [], mechanic: "Will Strong", mechanic_id: "m2",
      unit: "DT-881", vehicle_id: V },
    { id: "h3", work_date: "2026-09-12", hours: 4.25, cost_code: "600",
      cost_code_name: "Tires", code_group: "Equipment", where_worked: "road",
      job_location: "Danville yard", work_order: "WO-26-0024", note: null,
      work_performed: "Chased an air leak", work_types: ["Road call"],
      mechanic: "Dylan Barnes", mechanic_id: "m1", unit: "DT-881", vehicle_id: V },
    /* Booked against the typed label with no roster match. */
    { id: "h4", work_date: "2026-07-04", hours: 1.25, cost_code: "600",
      cost_code_name: "Tires", code_group: "Equipment", where_worked: "shop",
      job_location: null, work_order: "", note: "Swapped a recap",
      work_performed: null, work_types: ["Tires"], mechanic: "Will Strong",
      mechanic_id: "m2", unit: "DT-881", vehicle_id: null },
    /* Another truck entirely. It must not land in this file. */
    { id: "h9", work_date: "2026-09-12", hours: 8, cost_code: "600",
      cost_code_name: "Tires", code_group: "Equipment", where_worked: "shop",
      job_location: null, work_order: "", note: "Not this truck",
      work_performed: null, work_types: [], mechanic: "Dylan Barnes",
      mechanic_id: "m1", unit: "DT-864", vehicle_id: "v864" },
  ],
  tw_part_txns: [
    { id: "x1", part_id: "p1", qty_delta: -2, kind: "issue", who: "Dylan Barnes",
      work_order: "WO-26-0009", note: null, created_at: "2026-08-03T14:00:00Z",
      vehicle_id: V },
    { id: "x2", part_id: "p2", qty_delta: 40, kind: "receive", who: "Store",
      work_order: null, note: null, created_at: "2026-08-04T14:00:00Z", vehicle_id: V },
  ],
  tw_parts: [
    { id: "p1", part_number: "LMP-441", name: "Marker lamp, amber", category: "Lighting",
      uom: "each", unit_cost: 12.4 },
    { id: "p2", part_number: "OIL-15W40", name: "Engine oil", category: "Fluids",
      uom: "gal", unit_cost: 9.1 },
  ],
  tw_odometer_log: [
    { id: "o1", vehicle_id: V, reading_date: "2026-09-01", odometer: 412350,
      source: "motive", recorded_by: null },
    { id: "o2", vehicle_id: V, reading_date: "2026-06-01", odometer: 395000,
      source: "inspection", recorded_by: "Will Strong" },
  ],
  tw_work_history: [
    { at: "2026-09-12T13:00:00Z", kind: "hours", what: "Hours booked", unit: "DT-881",
      vehicle_id: V, summary: "4.25h · 600 · chased an air leak", who: "Dylan Barnes",
      work_order: "WO-26-0024", hours: 4.25, source_id: "h3" },
    { at: "2026-08-03T15:00:00Z", kind: "defect", what: "Defect repaired", unit: "DT-881",
      vehicle_id: V, summary: "Lights — New marker", who: "Dylan Barnes",
      work_order: "", hours: 0.5, source_id: "d2" },
    { at: "2026-08-03T14:00:00Z", kind: "parts", what: "Parts issued", unit: "DT-881",
      vehicle_id: V, summary: "2 × LMP-441 — Marker lamp, amber", who: "Dylan Barnes",
      work_order: "WO-26-0009", hours: null, source_id: "x1" },
    { at: "2026-06-01T12:00:00Z", kind: "pm", what: "Service completed", unit: "DT-881",
      vehicle_id: V, summary: "A service at 395000 miles", who: "Will Strong",
      work_order: null, hours: 2.5, source_id: "c1" },
  ],
  tw_mechanics: [], tw_tread_readings: [], tw_tire_wear: [], tw_tire_brands: [],
  tw_settings: [], tw_cost_codes: [], tw_part_requests: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  console.log("  VITE_SUPABASE_URL=https://example.supabase.co \\");
  console.log("  VITE_SUPABASE_ANON_KEY=placeholder npm run build");
  console.log("  npx vite preview --port 4173 &");
  console.log("  node scripts/test-truckboard.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
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
await page.getByRole("button", { name: "Truck file", exact: true }).first().click();
await page.waitForTimeout(1200);

console.log("── typing a truck number ──");
let t = await page.locator("body").innerText();
ok("the page loads", /which truck/i.test(t));

await page.locator('input[placeholder*="881"]').fill("881");
await page.waitForTimeout(500);
t = await page.locator("body").innerText();
ok("both 881 trucks are offered", /DT-881/.test(t) && /DT-1881/.test(t));

await page.getByRole("button", { name: /^DT-881/ }).first().click();
await page.waitForTimeout(2000);
t = await page.locator("body").innerText();

console.log("\n── the header ──");
ok("no 'does not exist' banner", !/does not exist/i.test(t));
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));
ok("nothing was written", writes.length === 0, JSON.stringify(writes.slice(0, 2)));
ok("the truck is named", /Mack Granite 2019/.test(t));
ok("the odometer is there", /412,350 mi/.test(t));
/* Motive typing a DVIR defect "major" is not a roadside inspector's
   order, and the app used to turn one into the other. It says what it
   has instead. */
ok("it says a major defect is open", /MAJOR DEFECT/i.test(t));
ok("it does not call the truck out of service", !/out of service/i.test(t));
/* h1 3.5 + h2 2 + h3 4.25 + h4 1.25 = 11.00, and NOT the 8 hours
   booked to DT-864. */
ok("the labour total is this truck's only", /11\.00/.test(t), "wanted 11.00 hours");
ok("both mechanics are counted", /MECHANICS ON IT\s*2/i.test(t));
ok("the tires are counted", /TIRES ON IT\s*1/i.test(t));
/* The header and the Parts table filter separately — one in rollUp,
   one in the component — so they are asserted separately. A header
   that counts the 40 gallons of oil the shelf took in as parts put on
   this truck would be wrong and look fine. */
ok("only the issued part is counted up top", /PARTS ISSUED\s*1/i.test(t));
ok("…and its money, not the shelf's", /\$24\.80/.test(t), "2 x 12.40");

console.log("\n── right now ──");
ok("the open defect is listed", /Chamber leaking air/.test(t));
/* Some of what lands on this page is a date column and some a
   timestamp. Handing a timestamp to the date formatter printed
   "09/11T08:00:00Z/26", which reads as a rendering glitch rather than a
   bug and survived being looked at. */
ok("every date reads as a date", !/T\d\d:\d\d/.test(t),
  (t.match(/\S*T\d\d:\d\d\S*/) || [""])[0]);
ok("the defect's date is formatted", /09\/11\/26/.test(t));
/* Synced with no vehicle_id — read on that alone and it vanishes. */
ok("the text-only defect is listed too", /Blower noisy/.test(t));
ok("the repaired one is not in Right now", !/Marker out/.test(t));
ok("the open job is listed", /WO-26-0024/.test(t));
ok("…with why it is stuck", /Waiting: Waiting on parts/.test(t));
ok("the service that is over shows", /A service/.test(t) && /Over/.test(t));
ok("a service that is fine does not", !/Greasing[\s\S]{0,80}Due soon/.test(t));

console.log("\n── mechanic time ──");
ok("both mechanics are listed", /Dylan Barnes/.test(t) && /Will Strong/.test(t));
ok("the road call says where", /Danville yard/.test(t));
ok("what was done is shown", /Chased an air leak/.test(t));
ok("the other truck's hours are nowhere", !/Not this truck/.test(t));
ok("the unmatched-label entry is here", /Swapped a recap/.test(t));

console.log("\n── tires, services, parts ──");
ok("the mounted tire is on", /Continental/.test(t));
ok("the note on it carries", /Sidewall plug/.test(t));
ok("the pulled tire is listed", /Bridgestone/.test(t) && /Worn out/.test(t));
ok("…with the miles it ran", /86,000/.test(t), "386000 - 300000");
ok("the services are listed", /Oil and filters/.test(t));
ok("the part issued is listed", /LMP-441/.test(t));
ok("a receive is not a part on the truck", !/OIL-15W40/.test(t));

console.log("\n── everything, in order ──");
ok("the timeline is there", /Everything that has happened/i.test(t));
ok("it carries all four kinds",
  /Hours booked/.test(t) && /Defect repaired/.test(t)
  && /Parts issued/.test(t) && /Service completed/.test(t));

await page.getByRole("button", { name: "Service", exact: true }).first().click();
await page.waitForTimeout(500);
const hist = await page.locator("#truck-history").innerText();
ok("filtering the timeline narrows it",
  /Service completed/.test(hist) && !/Hours booked/.test(hist));
await page.getByRole("button", { name: "All", exact: true }).first().click();
await page.waitForTimeout(400);

console.log("\n── a date range ──");
await page.locator('input[type="date"]').first().fill("2026-09-01");
await page.waitForTimeout(900);
t = await page.locator("body").innerText();
/* Only h3 falls in September. */
ok("the hours narrow", /4\.25/.test(t));
ok("…and August's drop out", !/Replaced marker light/.test(t));
/* The whole reason this is asserted: a range must never make a tire or
   an open defect disappear. That reading sends somebody out on an
   truck with a major fault on it. */
ok("the tire is still on it", /Continental/.test(t));
ok("the open defect is still open", /Chamber leaking air/.test(t));
ok("it still says a major defect is open", /MAJOR DEFECT/i.test(t));
ok("…and still does not say out of service", !/out of service/i.test(t));
ok("the service still reads as over", /Over/.test(t));
ok("still no rejected reads", rest400.length === 0, rest400.join("\n    "));
ok("still nothing written", writes.length === 0);

console.log("\n── another truck ──");
await page.getByRole("button", { name: /Another truck/i }).click();
await page.waitForTimeout(400);
await page.locator('input[placeholder*="881"]').fill("864");
await page.waitForTimeout(500);
await page.getByRole("button", { name: /^DT-864/ }).first().click();
await page.waitForTimeout(1800);
t = await page.locator("body").innerText();
ok("the other truck's file opens", /DT-864/.test(t));
ok("…with its own hours", /Not this truck/.test(t));
ok("…and none of DT-881's", !/Chamber leaking air/.test(t));
ok("a truck with no tires says so", /No tires entered for this unit/.test(t));

console.log("\npage errors:", errors.length ? errors : "none");
bad += errors.length;
await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
