/* The weekly tire-pressure screen, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-tpms.mjs holds the rule — only tires we have entered get
   a pressure — against a real week of readings. This one checks that
   the screen in front of a person actually does it: reads a pasted
   export, says out loud which trucks it is skipping and why, writes
   only the matched wheels, and puts the number back on the diagram.

   `npm run build` passes on an undefined global, so the only way to
   know a new screen renders at all is to load it. The fake database
   refuses any column the real schema does not have, which is what makes
   this able to fail.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-pressureboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (label, v) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${label}`); };

/* Two trucks entered, one not. DT-881 has all twelve wheels; DT-864 has
   only its steers, so the export's drive rows have nothing to land on. */
const POS12 = ["1L", "1R", "2L", "2R", "3LI", "3LO", "3RI", "3RO", "4LI", "4LO", "4RI", "4RO"];
const tires = [];
POS12.forEach((p, i) => tires.push({
  id: `t881-${i}`, vehicle_id: "v881", position: p, brand: "Continental",
  model: null, size: "11R24.5", tire_type: "virgin", wheel_material: null,
  casing_id: null, mounted_date: "2026-01-05", mounted_odometer: 100000,
  mounted_depth: 28, cost: null, removed_date: null, removed_odometer: null,
  removed_reason: null, notes: null, created_by: null, created_at: "2026-01-05",
}));
["1L", "1R"].forEach((p, i) => tires.push({
  id: `t864-${i}`, vehicle_id: "v864", position: p, brand: "Road X",
  model: null, size: "425/65R22.5", tire_type: "virgin", wheel_material: null,
  casing_id: null, mounted_date: "2026-02-01", mounted_odometer: 90000,
  mounted_depth: 28, cost: null, removed_date: null, removed_odometer: null,
  removed_reason: null, notes: null, created_by: null, created_at: "2026-02-01",
}));

const rows = {
  tw_vehicles: [
    { id: "v881", number: "DT-881", make: "Mack", model: "Granite", model_year: 2019,
      division: "DT", axle_config: "dump12", motive_vehicle_id: null, active: true,
      notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
    { id: "v864", number: "DT-864", make: "Mack", model: "Granite", model_year: 2017,
      division: "DT", axle_config: "dump12", motive_vehicle_id: null, active: true,
      notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
  ],
  tw_tires: tires,
  tw_tread_readings: [], tw_odometer_log: [], tw_tire_wear: [],
  tw_tire_brands: [{ id: "b1", name: "Continental", sort_order: 1, active: true }],
  tw_settings: [{ id: true, pull_steer_32nds: 6, pull_other_32nds: 4,
    default_new_depth: 28, alert_emails: [], updated_at: "2026-01-01" }],
  tw_tire_pressures: [],
  tw_tire_pressure_latest: [],
  tw_mechanics: [],
};

/* The view is one row per tire, newest first — the database does that
   with distinct on. Standing in for it here is what lets the screen be
   checked after the write, rather than only before it. */
const rebuildLatest = (table) => {
  if (table !== "tw_tire_pressures") return;
  const best = new Map();
  for (const r of rows.tw_tire_pressures) {
    const had = best.get(r.tire_id);
    if (!had || r.reading_date > had.reading_date) best.set(r.tire_id, r);
  }
  rows.tw_tire_pressure_latest = [...best.values()].map((r) => ({
    tire_id: r.tire_id, reading_date: r.reading_date, psi: r.psi,
    sensor_status: r.sensor_status, source: r.source,
  }));
};

/* A week's export, cut down. Three pressure columns, the truck numbers
   spelled the three ways the real file spells them, a wheel we have no
   tire for, a truck we have not entered at all, and a flat. */
const TSV = [
  ["Vehicle Name", "Tyre position", "Status", "Cold inflation pressure",
   "Compensated Pressure", "Pressure (non-compensated)"],
  ["DT-881", "1L", "No alerts", "110.0", "110.4", "108"],
  ["DT-881", "1R", "No alerts", "110.0", "110.2", "108"],
  ["DT-881", "3LO", "No alerts", "110.0", "111.1", "109"],
  ["DT-881", "4RO", "Very low pressure", "110.0", "44.2", "42"],
  ["DT-881", "2L", "No alerts", "110.0", "", ""],
  ["DT 864", "1L", "Low pressure", "110.0", "98.9", "97"],
  ["DT 864", "3RI", "No alerts", "110.0", "104.0", "103"],
  ["HT 1119", "1L", "No alerts", "110.0", "106.0", "104"],
  ["HT 1119", "1R", "No alerts", "110.0", "105.0", "103"],
].map((r) => r.join("\t")).join("\n");

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  console.log("  VITE_SUPABASE_URL=https://example.supabase.co \\");
  console.log("  VITE_SUPABASE_ANON_KEY=placeholder npm run build");
  console.log("  npx vite preview --port 4173 &");
  console.log("  node scripts/test-pressureboard.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));
const { writes } = await fakeRest(ctx, { rows, after: rebuildLatest });

const page = await ctx.newPage();
const errors = [];
const rest400 = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Tires", exact: true }).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Air pressure", exact: true }).first().click();
await page.waitForTimeout(900);

let t = await page.locator("body").innerText();
console.log("── the screen loads ──");
ok("no 'does not exist' banner", !/does not exist/i.test(t));
ok("no rejected reads at all", rest400.length === 0);
if (rest400.length) console.log("    " + rest400.join("\n    "));
ok("it says nothing is on record yet", /Nothing yet/.test(t));

console.log("\n── pasting the week's file ──");
await page.locator("textarea").first().fill(TSV);
await page.waitForTimeout(600);
t = await page.locator("body").innerText();
ok("the rows are counted", /9 rows read, 6 columns/.test(t));

/* The guess that matters. Cold inflation pressure is the target and
   compensated pressure is temperature-corrected; filing either as a
   measurement would be wrong on every wheel and look fine on screen. */
const psiSelect = page.locator("select").nth(2);
ok("the non-compensated column is the one picked",
  (await psiSelect.inputValue()) === "Pressure (non-compensated)",
  await psiSelect.inputValue());

await page.getByRole("button", { name: /See what this will record/ }).click();
await page.waitForTimeout(700);
t = await page.locator("body").innerText();

console.log("\n── what it says it will do ──");
ok("five pressures to record", /pressures to record\s*5/i.test(t));
ok("one wheel reported nothing", /sensor reported nothing\s*1/i.test(t));
ok("one wheel has no tire entered", /wheel not entered yet\s*1/i.test(t));
ok("one truck is skipped whole", /trucks with no tires entered\s*1/i.test(t));
ok("the skipped truck is named", /HT 1119 \(2\)/.test(t));
ok("it says why it skipped it", /no tires entered on the site for these trucks/i.test(t));
ok("'DT 864' was matched to DT-864", /DT-864/.test(t));
ok("the flat is shown as 42", /42 psi/.test(t));

console.log("\n── recording ──");
await page.getByRole("button", { name: /Record 5 pressures/ }).click();
await page.waitForTimeout(1600);
t = await page.locator("body").innerText();

const wrote = writes.filter((w) => w.table === "tw_tire_pressures" && w.method === "POST");
const sent = wrote.flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]));
ok("exactly five rows were written", sent.length === 5, `${sent.length}`);
ok("every row names a tire we have",
  sent.every((r) => tires.some((x) => x.id === r.tire_id)));
ok("nothing was written for the truck we have not entered",
  !sent.some((r) => String(r.tire_id).startsWith("ht")));
ok("the sensor's own words are kept",
  sent.some((r) => r.sensor_status === "Very low pressure"));
ok("it is marked as coming from the TPMS", sent.every((r) => r.source === "tpms"));
ok("the screen confirms the count", /pressures recorded\s*5/i.test(t));
ok("…and that a truck was skipped", /trucks skipped\s*1/i.test(t));
ok("the worst wheel is at the top of what is on record",
  t.indexOf("42 psi") < t.indexOf("108 psi"));

console.log("\n── back on the diagram ──");
await page.getByRole("button", { name: "Fleet", exact: true }).first().click();
await page.waitForTimeout(900);
await page.getByText("DT-881").first().click();
await page.waitForTimeout(1200);
t = await page.locator("body").innerText();
/* Only a tire card carries a title of this shape, so counting them
   counts the wheels actually showing a pressure on the diagram. */
const carded = () => page.locator('[title*="psi \u00b7"]').count();
ok("its four wheels with readings show them", (await carded()) === 4, `${await carded()}`);
ok("the flat is on its wheel", /42\s*psi/.test(t));
ok("the position table carries it", /42 psi/.test(t));
ok("it says where the air came from", /last TPMS file read for this wheel/i.test(t));

/* Opening the wheel reads its pressure history on its own — a column
   wrong there would only show up here. */
await page.getByRole("button", { name: "4RO", exact: true }).first().click();
await page.waitForTimeout(1200);
/* Read the history table itself, not the page — the position table
   behind the dialog says "42 psi" too, and asserting against the whole
   body would pass with no history table at all. */
const hist = page.locator("table").filter({ hasText: "What the sensor said" });
ok("the wheel's air history opens", (await hist.count()) === 1);
const histText = (await hist.count()) ? await hist.first().innerText() : "";
ok("the history reads back what was written", /42 psi/.test(histText));
ok("with the sensor's own words", /Very low pressure/.test(histText));
ok("still no rejected reads", rest400.length === 0);
if (rest400.length) console.log("    " + rest400.join("\n    "));
await page.mouse.click(8, 8);
await page.waitForTimeout(700);

/* The truck with two tires entered got one reading. The other eleven
   wheels must read as having no pressure, not as flat. */
await page.getByText("DT-864").first().click();
await page.waitForTimeout(1200);
t = await page.locator("body").innerText();
ok("only the one wheel with a reading shows one", (await carded()) === 1, `${await carded()}`);
ok("a wheel with no reading shows nothing, not zero", !/0 psi/.test(t));

console.log("\npage errors:", errors.length ? errors : "none");
if (errors.length) bad += errors.length;
await browser.close();

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
