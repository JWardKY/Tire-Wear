/* Pulling a tire nobody has gauged, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-pullodo.mjs holds the rules. This holds the part that
   only the screen shows, and it is the exact case that went wrong.

   DT-890, 30 September. Eight Continental drives, mounted on the 10th
   at 150,621, never gauged since. The truck had done 151,859 by then.
   The pull form filled "Odometer off" in from the tire's last known
   point — and the mount is the only point an ungauged tire has — so
   it offered 150,621, and eight casings went into the books having
   run no miles at all.

   No miles means no wear rate, and no wear rate means the casing is
   not in the brand comparison. They do not show up wrong on the
   Analysis page; they do not show up.

   So: the box opens on the truck's reading, a figure behind the mount
   will not save, and the miles the figure books are written out under
   it while it is being typed.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-pullboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const V = "v890";
const MOUNT = 150621, TRUCK = 151859;
const POS12 = ["1L", "1R", "2L", "2R", "3LI", "3LO", "3RI", "3RO",
               "4LI", "4LO", "4RI", "4RO"];

/* Every drive ungauged since it was mounted — exactly DT-890. Only the
   steers carry a reading, so the two paths can be told apart. */
const tires = [], readings = [], wear = [];
POS12.forEach((pos, i) => {
  const id = `t${i}`;
  const gauged = pos === "1L" || pos === "1R";
  tires.push({ id, vehicle_id: V, position: pos, brand: "Continental", model: "HDC3",
    size: "11R24.5", tire_type: "virgin", wheel_material: "aluminum", casing_id: null,
    mounted_date: "2026-09-10", mounted_odometer: MOUNT, mounted_depth: 12,
    cost: 655.24, removed_date: null, removed_odometer: null, removed_reason: null,
    notes: null, created_by: null, created_at: "2026-09-11" });
  if (gauged) {
    readings.push({ id: `r${i}`, tire_id: id, reading_date: "2026-09-20",
      depth_32nds: 11, odometer: 151388, created_at: "2026-09-20" });
    wear.push({ tire_id: id, vehicle_id: V, truck: "DT-890", position: pos,
      current_depth: 11, miles_run: 767, worn_32nds: 1, miles_per_32nd: 767,
      miles_per_mil: null });
  }
});

const rows = {
  tw_vehicles: [{ id: V, number: "DT-890", make: "Mack", model: "Gu713",
    model_year: 2022, division: "DT", axle_config: "dump12",
    motive_vehicle_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  tw_tires: tires, tw_tread_readings: readings, tw_tire_wear: wear,
  tw_odometer_log: [{ id: "o1", vehicle_id: V, reading_date: "2026-09-30",
    odometer: TRUCK, source: "motive", created_at: "2026-09-30" }],
  tw_tire_brands: [{ id: "b1", name: "Continental", sort_order: 1, active: true }],
  tw_settings: [{ id: true, pull_steer_32nds: 6, pull_other_32nds: 4,
    default_new_depth: 28, dual_match_32nds: 4, alert_emails: [],
    updated_at: "2026-01-01" }],
  tw_mechanics: [], tw_work_log: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1800 } });
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
await page.waitForTimeout(1800);
await page.getByText("DT-890").first().click();
await page.waitForTimeout(1400);
ok("the truck opens", /DT-890/.test(await page.locator("body").innerText()));
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));

/* Reloading between tires rather than dismissing the dialog: the
   modal's backdrop swallows clicks aimed at the wheel behind it, and a
   test that fights the overlay is testing the overlay. */
const openTruck = async () => {
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Tires", exact: true }).first().click();
  await page.waitForTimeout(1800);
  await page.getByText("DT-890").first().click();
  await page.waitForTimeout(1400);
};

const openPull = async (pos) => {
  await page.getByRole("button", { name: pos, exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Pull this tire off/i }).click();
  await page.waitForTimeout(600);
  return page.locator('div[style*="position: fixed"]').last();
};

/* ── the bug itself ───────────────────────────────────────────── */
console.log("\n── a drive tire nobody has gauged since it went on ──");
let form = await openPull("4RO");
const odo = form.getByLabel("Odometer off");
let v = await odo.inputValue();
ok("the box does not open on the reading it went on at",
   v !== String(MOUNT), `${v} (mounted at ${MOUNT})`);
ok("…it opens on the truck's current reading", v === String(TRUCK), v);

let t = await form.innerText();
ok("and it says what that books to the casing",
   /1,238 mi/.test(t), (t.match(/This casing[^\n]*/) || [""])[0]);

const pullBtn = page.getByRole("button", { name: "Pull tire", exact: true });
ok("it will save", await pullBtn.isEnabled());

/* ── the figure that cannot be right ──────────────────────────── */
console.log("\n── a reading behind the one it went on at ──");
await odo.fill("150000");
await page.waitForTimeout(400);
t = await form.innerText();
ok("it will not save", await pullBtn.isDisabled());
ok("…and says what it went on at", /150,621/.test(t),
   (t.match(/went on at[^\n]*/) || [""])[0]);
ok("…and does not offer a mileage it cannot have", !/This casing/.test(t));

/* ── the zero-mile pull, allowed but named ────────────────────── */
console.log("\n── the mount reading exactly, which is what happened ──");
await odo.fill(String(MOUNT));
await page.waitForTimeout(400);
t = await form.innerText();
ok("it saves — a tire taken straight back off really did run nothing",
   await pullBtn.isEnabled());
ok("…but it says the casing will show no miles", /no miles/i.test(t),
   (t.match(/no miles[^\n]*/) || [""])[0]);

/* ── a gauged tire still prefers the truck ────────────────────── */
console.log("\n── and a tire that has been gauged ──");
await openTruck();
form = await openPull("1L");
v = await form.getByLabel("Odometer off").inputValue();
ok("still opens on the truck, which is further along than the reading",
   v === String(TRUCK), `${v} (reading was 151388)`);

/* ── what actually gets written ───────────────────────────────── */
console.log("\n── and the figure that reaches the database ──");
await form.getByLabel("Odometer off").fill(String(TRUCK));
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Pull tire", exact: true }).click();
await page.waitForTimeout(1200);

const patch = writes.filter((w) => w.table === "tw_tires" && w.method === "PATCH");
ok("the pull was written", patch.length === 1, JSON.stringify(patch));
const body = patch[0] ? patch[0].body : {};
ok("…at the truck's reading, not the mount's",
   body.removed_odometer === TRUCK, JSON.stringify(body));
ok("…so the casing books real miles",
   body.removed_odometer - MOUNT === 1238, body.removed_odometer);

ok("nothing threw", crashes.length === 0, crashes.join(" | "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
