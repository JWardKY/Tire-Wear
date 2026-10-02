/* Why a tire came off, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-pullreason.mjs holds the rules. This holds the part
   only a browser can answer: that the two new reasons are on the
   dropdown where somebody pulling a tire will find them, that
   "Retread failure" is not offered on a virgin casing, and that the
   word that reaches the database is the word that was picked.

   The last one is the point of the whole thing. removed_reason is
   free text with no check constraint, so whatever this screen sends
   IS the record — there is nothing behind it to catch a mistake, and
   seventy tires already carry the six older words.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-reasonboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const V = "v890";
const tire = (id, pos, type, extra = {}) => ({
  id, vehicle_id: V, position: pos, brand: "Continental", model: "HDC3",
  size: "11R24.5", tire_type: type, wheel_material: "aluminum", casing_id: null,
  mounted_date: "2026-08-25", mounted_odometer: 100000,
  mounted_depth: type === "retread" ? 18 : 28, cost: 655.24,
  removed_date: null, removed_odometer: null, removed_reason: null,
  notes: null, created_by: null, created_at: "2026-08-25",
  retread_count: type === "retread" ? 2 : null, model_id: null, ...extra,
});

const rows = {
  tw_vehicles: [{ id: V, number: "DT-890", make: "Kenworth", model: "T880",
    model_year: "2022", division: "DT", axle_config: "dump12",
    motive_vehicle_id: null, motive_asset_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  /* One of each, on wheels that come off at different depths. */
  tw_tires: [tire("t1", "3LO", "virgin"), tire("t2", "4LO", "retread")],
  tw_tread_readings: [
    { id: "r1", tire_id: "t1", reading_date: "2026-09-20", odometer: 136000,
      depth_32nds: 20, recorded_by: null, created_at: "2026-09-20" },
    { id: "r2", tire_id: "t2", reading_date: "2026-09-20", odometer: 136000,
      depth_32nds: 12, recorded_by: null, created_at: "2026-09-20" },
  ],
  tw_tire_wear: [], tw_odometer_log: [],
  tw_tire_brands: [{ id: "b1", name: "Continental", sort_order: 1, active: true }],
  tw_tire_models: [],
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
  console.log("  node scripts/test-reasonboard.mjs");
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
await page.getByRole("button", { name: /DT-890/ }).first().click();
await page.waitForTimeout(1600);

const openPull = async (pos) => {
  await page.getByRole("button", { name: pos, exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /^Pull this tire off$/i }).first().click();
  await page.waitForTimeout(600);
};
/* The label wraps the select, so the accessible name carries every
   option with it — matched on the start of it, the same way the
   brand dropdown has to be. */
const reasonBox = () => page.getByLabel(/^Reason/).first();

console.log("── pulling a virgin casing ──");
await openPull("3LO");
ok("the pull form is open", (await reasonBox().count()) > 0,
  (await page.locator("body").innerText()).slice(0, 300));
let offered = await reasonBox().locator("option").allTextContents();
ok("a tire can have blown", offered.includes("Tire blew"), offered.join(" | "));
/* The rule: it is not a thing that can happen to a virgin casing. */
ok("…but a virgin casing cannot have a retread fail on it",
  !offered.includes("Retread failure"), offered.join(" | "));
ok("the six that were always there are still there",
  ["Worn out", "Road hazard", "Sidewall damage", "Irregular wear",
   "Rotated off", "Casing sent to retread"].every((r) => offered.includes(r)),
  offered.join(" | "));
ok("…and it still opens on worn out",
  (await reasonBox().inputValue()) === "Worn out", await reasonBox().inputValue());
/* Nothing said for the ordinary case. */
let t = await page.locator("body").innerText();
ok("a tire that wore out gets no commentary",
  !/cost per mile will read dearer/.test(t), t.slice(0, 300));

await reasonBox().selectOption("Tire blew");
await page.waitForTimeout(400);
t = await page.locator("body").innerText();
ok("choosing a blowout says what it means for the figures",
  /cost per mile will read dearer/.test(t),
  (t.match(/[^\n]*dearer[^\n]*/) || [""])[0]);

console.log("\n── and what reaches the database ──");
await page.getByRole("button", { name: /^Pull tire$/i }).first().click();
await page.waitForTimeout(1200);
let patched = writes.filter((w) => w.table === "tw_tires" && w.method === "PATCH");
ok("the tire is pulled", patched.length > 0, JSON.stringify(writes.map((w) => w.table)));
/* The word picked, character for character. There is no constraint
   behind this to catch a mistake. */
ok("…with the word that was picked, exactly",
  patched.some((w) => w.body?.removed_reason === "Tire blew"),
  JSON.stringify(patched.map((w) => w.body?.removed_reason)));

console.log("\n── pulling a retread ──");
await page.waitForTimeout(600);
const close = page.getByRole("button", { name: /^(Close|Done)$/i }).first();
if (await close.count()) { await close.click(); await page.waitForTimeout(600); }
await openPull("4LO");
offered = await reasonBox().locator("option").allTextContents();
ok("a cap can have come apart", offered.includes("Retread failure"), offered.join(" | "));
ok("…and it can still have blown", offered.includes("Tire blew"), offered.join(" | "));
ok("…and still be sent off to be capped again",
  offered.includes("Casing sent to retread"), offered.join(" | "));

await reasonBox().selectOption("Retread failure");
await page.waitForTimeout(400);
t = await page.locator("body").innerText();
/* The cap count is on the fixture at 2, and it is the fact that makes
   the record worth having. */
ok("it names which cap came apart", /2nd cap/.test(t),
  (t.match(/[^\n]*cap[^\n]*/) || [""])[0]);
ok("…and says what the record is for", /retread programme/i.test(t),
  (t.match(/[^\n]*programme[^\n]*/i) || [""])[0]);

await page.getByRole("button", { name: /^Pull tire$/i }).first().click();
await page.waitForTimeout(1200);
patched = writes.filter((w) => w.table === "tw_tires" && w.method === "PATCH");
ok("the cap's failure reaches the database as itself",
  patched.some((w) => w.body?.removed_reason === "Retread failure"),
  JSON.stringify(patched.map((w) => w.body?.removed_reason)));
/* Nothing invented along the way. */
ok("and nothing was written as a reason that was never picked",
  patched.every((w) => w.body?.removed_reason === undefined
    || ["Tire blew", "Retread failure"].includes(w.body.removed_reason)),
  JSON.stringify(patched.map((w) => w.body?.removed_reason)));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));
ok("no rejected requests", rest400.length === 0, rest400.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
