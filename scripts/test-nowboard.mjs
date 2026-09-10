/* The Now board's per-mechanic detail, in a real browser.
   ─────────────────────────────────────────────────────────────────
   This suite exists because `npm run build` passes on an undefined
   global and on a column that is not there. The Now board shipped
   asking tw_hours for a job_location it did not have, and the fake
   database of the day answered anyway — so the checks were green and
   Jason got the error banner. _fakerest.mjs now refuses a column the
   fixture does not define, which is what makes this test able to fail.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-nowboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

/* The shop's date, not UTC. todayISO() is Eastern, and the first run of
   a test like this used the UTC date — at 00:38 UTC that is tomorrow in
   the shop, the hours vanished, and it looked like an app bug. */
const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();

let bad = 0;
const ok = (label, v) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${label}`); };

const rows = {
  tw_on_clock: [
    { id: "s1", mechanic_id: "m1", mechanic: "Dylan Barnes", mechanic_email: null,
      started_at: ago(190), started_on: iso, stale: false, note: null },
    { id: "s2", mechanic_id: "m2", mechanic: "Will Strong",
      mechanic_email: "will_strong@theallen.com",
      started_at: ago(95), started_on: iso, stale: false, note: null },
  ],
  tw_work_orders: [
    { id: "w1", wo_number: "WO-26-0024", unit_number: "DT-881", title: "Tires",
      detail: "Outside recap separating", priority: "now", state: "in progress",
      started_at: ago(100), hold_reason: null },
    { id: "w2", wo_number: "WO-26-0031", unit_number: "HT-1373", title: "Gauges",
      detail: "", priority: "today", state: "in progress",
      started_at: null, hold_reason: "Waiting on parts" },
  ],
  /* Both of them on the tyre job — that is the crew, and it has to show
     on both cards. Only Dylan is on the gauges. */
  tw_work_order_crew: [
    { id: "c1", work_order: "w1", mechanic_id: "m1", mechanic_name: "Dylan Barnes",
      added_at: ago(180) },
    { id: "c2", work_order: "w1", mechanic_id: "m2", mechanic_name: "Will Strong",
      added_at: ago(90) },
    { id: "c3", work_order: "w2", mechanic_id: "m1", mechanic_name: "Dylan Barnes",
      added_at: ago(60) },
  ],
  /* Claimed under an email, the older spelling — the name-only match
     used to drop these. */
  tw_defects: [
    { id: "d1", state: "claimed", unit_number: "DT-870",
      category: "Brake Accessories", note: "Chamber leaking air", safety: "safe",
      claimed_by: "will_strong@theallen.com", claimed_at: ago(30), work_order: "" },
    { id: "d2", state: "open", unit_number: "DT-868", category: "Heater",
      note: "Nobody has this one", safety: "safe", claimed_by: null,
      claimed_at: null, work_order: "" },
  ],
  /* A road call. job_location is the column that was missing. */
  tw_hours: [
    { id: "h1", mechanic_id: "m2", unit: "DT-896", hours: 2.5, cost_code: "800",
      cost_code_name: "Brake System", note: "Changed a chamber", work_order: null,
      where_worked: "road", job_location: "Danville yard", work_date: iso,
      vehicle_id: null },
  ],
  tw_defects_open: [], tw_pm_due: [], tw_tire_alerts: [], tw_tires_due_out: [],
  tw_timecard_days: [], tw_shifts: [], tw_vehicles: [], tw_mechanics: [],
};

/* No column overrides: the fake checks every select against
   scripts/schema-columns.json, which is the database's own shape. */

/* Skipped when the app is not being served. Exit 3, not 0: the runner
   reports "did not run" as itself, because a skip counted as a pass is
   how a suite quietly stops testing anything. */
try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  console.log("  VITE_SUPABASE_URL=https://example.supabase.co \\");
  console.log("  VITE_SUPABASE_ANON_KEY=placeholder npm run build");
  console.log("  npx vite preview --port 4173 &");
  console.log("  node scripts/test-nowboard.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));
await fakeRest(ctx, { rows });

const page = await ctx.newPage();
const errors = [];
const rest400 = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
let t = await page.locator("body").innerText();

console.log("── the cards ──");
/* The banner the shipped bug produced. Checked by name, because this is
   the exact failure this suite was written for. */
ok("no 'does not exist' banner", !/does not exist/i.test(t));
ok("no rejected reads at all", rest400.length === 0);
if (rest400.length) console.log("    " + rest400.join("\n    "));
ok("the assigned job is on the card", /DT-881 · Tires/.test(t));
ok("a shared job says so on the line", /DT-881 · Tires \(\+1\)/.test(t));
ok("booked hours show", /2\.50 hr booked/.test(t));
ok("nothing reads as idle", !/idle/i.test(t));
ok("an unclaimed defect is not on anybody", !/DT-868/.test(t));

console.log("\n── opening Dylan Barnes ──");
await page.getByText("Dylan Barnes").first().click();
await page.waitForTimeout(900);
t = await page.locator("body").innerText();
ok("both of his jobs are listed", /WO-26-0024/.test(t) && /WO-26-0031/.test(t));
ok("the hold reason is surfaced", /Waiting: Waiting on parts/.test(t));
ok("the shared job names the crew", /Sharing it with 1 other/.test(t));
ok("the draft-clock caveat is there", /draft on their phone/i.test(t));
ok("he has booked nothing, and it says so", /Nothing saved yet/.test(t));
await page.mouse.click(8, 8);
await page.waitForTimeout(700);

console.log("\n── opening Will Strong ──");
await page.getByText("Will Strong").first().click();
await page.waitForTimeout(900);
t = await page.locator("body").innerText();
ok("the email-claimed defect is his", /DT-870 · Brake Accessories/.test(t));
/* The whole point of the missing column: a road call that can say where. */
ok("the road call names the place", /Danville yard/.test(t));
ok("his hours are on it", /2\.50 hr · DT-896/.test(t));

console.log("\npage errors:", errors.length ? errors : "none");
if (errors.length) bad += errors.length;
await browser.close();

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
