/* The Driving tab, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-driveline.mjs holds the rules. This holds the part
   only a browser can answer: that the tab is there behind the PIN
   with the rest of somebody's own hours, that the clock does not run
   until a truck is picked, that stopping it puts the trip on the card
   without anybody pressing Save — and, the point of the whole design,
   that what reaches the database is an ORDINARY time entry.

   That last one is why this test exists at all. If driving were ever
   written as its own kind of record, the card total, the approval and
   the payroll export would each have to learn about it, and the first
   one somebody forgot would be hours that never reached payroll.

   The first version of this screen asked for eight things before it
   would take a trip. It asked way too much, and the test it needed was
   this one: pick the truck, press Start, press Stop, and nothing else.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-driveboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const MECH = { id: "m1", name: "Donald Bradley", email: "donald_bradley@theallen.com" };

const rows = {
  tw_vehicles: [{ id: "v1", number: "DT-898", make: "Peterbilt", model: "567",
    model_year: "2023", division: "DT", axle_config: "dump12", motive_vehicle_id: null,
    motive_asset_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" },
    /* A second truck, so starting on the wrong one can be put right. */
    { id: "v2", number: "DT-889", make: "Kenworth", model: "T880",
    model_year: "2022", division: "DT", axle_config: "dump12", motive_vehicle_id: null,
    motive_asset_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  tw_mechanics: [{ id: MECH.id, name: MECH.name, email: MECH.email,
    active: true, pin_set: true }],
  tw_cost_codes: [
    { code: "880", name: "Repair", active: true, group: "Labour", code_group: "Labour" },
    { code: "SHOP-CF", name: "Clays Ferry Shop", active: true, group: "Shop", code_group: "Shop" },
  ],
  tw_parts: [], tw_parts_reorder: [],
  tw_shifts: [], tw_shift_days: [], tw_on_clock: [], tw_timecard_days: [],
  /* A shop line already on the card. The Driving tab has to leave it
     alone: a tab that listed the whole day would look right until the
     day somebody tried to edit a gearbox rebuild from it. */
  tw_time_entries: [{ id: "e-shop", mechanic_id: MECH.id, work_date: new Date().toISOString().slice(0, 10),
    vehicle_id: "v1", unit_label: null, where_worked: "shop", hours: 3,
    cost_code: "880", work_order: null, note: "Gearbox out", defect_id: null,
    work_types: ["Repair"], unit_seconds: 0, stints: [], work_performed: null,
    job_location: null, pm_program_id: null,
    created_at: "2026-10-02", updated_at: "2026-10-02" }],
  tw_hours: [], tw_pm_programs: [],
  tw_work_log: [], tw_timecard_approvals: [], tw_defects: [], tw_work_orders: [],
  tw_work_order_crew: [], tw_defects_open: [], tw_pm_due: [], tw_tire_alerts: [],
  tw_tires_due_out: [], tw_part_requests: [], tw_time_entry_parts: [], tw_part_txns: [],
  tw_vendors: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  console.log("  node scripts/test-driveboard.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
/* A tablet on the fender, which is where this is used. */
const ctx = await browser.newContext({
  viewport: { width: 820, height: 1180 }, hasTouch: true });
await ctx.addInitScript(new Function(
  `localStorage.setItem("tirewear:who", ${JSON.stringify(MECH.email)});`
  + `sessionStorage.setItem("tirewear:timecard-unlocked", ${JSON.stringify(
      JSON.stringify({ id: MECH.id, name: MECH.name, email: MECH.email }))});`
));
const { writes } = await fakeRest(ctx, { rows });

/* The app reads the day back from tw_hours, which is a VIEW over
   tw_time_entries. The fake serves tables, so an insert into the table
   would never show up in the view and the screen would look as though
   nothing had saved — the opposite of the real database, and a lie
   that would hide exactly the bug this test is for.

   So the view is recomputed from the table whenever it is read, with
   the same joins the real one has. Registered after fakeRest so it is
   matched first, and falling through to it once the rows are right. */
await ctx.route("**/rest/v1/tw_hours*", async (route) => {
  if (route.request().method() !== "GET") return route.fallback();
  const mech = Object.fromEntries(rows.tw_mechanics.map((m) => [m.id, m]));
  const veh = Object.fromEntries(rows.tw_vehicles.map((v) => [v.id, v]));
  const code = Object.fromEntries(rows.tw_cost_codes.map((c) => [c.code, c]));
  rows.tw_hours = rows.tw_time_entries.map((t) => ({
    id: t.id, work_date: t.work_date, hours: t.hours, cost_code: t.cost_code,
    where_worked: t.where_worked, work_order: t.work_order, note: t.note,
    defect_id: t.defect_id,
    mechanic_id: t.mechanic_id,
    mechanic: mech[t.mechanic_id]?.name ?? null,
    mechanic_email: mech[t.mechanic_id]?.email ?? null,
    vehicle_id: t.vehicle_id,
    unit: veh[t.vehicle_id]?.number ?? t.unit_label ?? null,
    division: veh[t.vehicle_id]?.division ?? null,
    cost_code_name: code[t.cost_code]?.name ?? null,
    code_group: code[t.cost_code]?.code_group ?? null,
    work_types: t.work_types, unit_seconds: t.unit_seconds, stints: t.stints,
    work_performed: t.work_performed, created_at: t.created_at,
    job_location: t.job_location,
  }));
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
await page.getByRole("button", { name: "Timecard", exact: true }).first().click();
await page.waitForTimeout(1800);

console.log("── the tab ──");
const tab = page.getByRole("button", { name: "Driving", exact: true }).first();
ok("there is a Driving tab", (await tab.count()) > 0,
  (await page.getByRole("button").allTextContents()).join(" | ").slice(0, 300));
await tab.click();
await page.waitForTimeout(1200);

let t = await page.locator("body").innerText();
ok("it opens", /hours driving/i.test(t), t.slice(0, 300));
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));
/* Three hours of shop work are already on this card. This tab is
   about driving, so none of it belongs here. */
ok("the shop line already on the card is not on this tab",
  !/Gearbox out/.test(t), t.slice(0, 600));
ok("…and its hours are not counted as driving", /0\.00 hours driving/i.test(t),
  (t.match(/[^\n]*hours driving[^\n]*/i) || [""])[0]);

console.log("\n── the whole of it: a truck and a button ──");
/* What this screen was asked for. Anything beyond these two is the
   thing that made the last version wrong. */
const inputs = await page.locator("select:visible, input:visible, textarea:visible").count();
ok("one control to pick the truck, and nothing else to fill in",
  inputs === 1, `${inputs} inputs on the screen`);
/* Typed, not chosen from a list. A dropdown of 276 units is a
   spinning wheel on a phone with no way to jump to one, which is why
   the equipment card has this control and why driving uses the same
   one. */
const unit = page.getByLabel("Equipment").first();
ok("the truck is typed in, the way it is on the equipment card",
  (await unit.evaluate((el) => el.tagName)) === "INPUT",
  await unit.evaluate((el) => el.tagName));
const go = page.getByRole("button", { name: /^START$|^STOP$/ }).first();
ok("there is a Start button", (await go.count()) > 0);
/* Hours cannot be booked against nothing — the database will not take
   a row with no unit on it. */
ok("…which will not go until a truck is picked", await go.isDisabled());
ok("and it says so", /Pick the truck, then press Start/i.test(t), t.slice(0, 600));
ok("the clock reads nothing yet", /0:00:00/.test(t), t.slice(0, 600));

console.log("\n── start ──");
await unit.click();
await unit.fill("898");
await page.waitForTimeout(500);
t = await page.locator("body").innerText();
ok("typing part of the number finds the truck", /DT-898/.test(t), t.slice(0, 600));
await unit.press("Enter");
await page.waitForTimeout(500);
ok("picking a truck arms it", !(await go.isDisabled()));
await go.click();
/* Long enough to be a real trip. Hours are real time now rather than
   rounded up to a quarter, so a clock that runs four seconds books
   nothing — which is tested on its own further down. */
await page.waitForTimeout(20000);
t = await page.locator("body").innerText();
ok("the clock is running", /the clock is running/i.test(t),
  (t.match(/[^\n]*clock is running[^\n]*/i) || [""])[0]);
ok("…against the truck picked", /DT-898/.test(t), t.slice(0, 500));
ok("…and it is counting", /0:00:(0[1-9]|[1-5]\d)/.test(t), (t.match(/\d:\d\d:\d\d/) || [""])[0]);
ok("the button now says Stop",
  /STOP/.test(await page.getByRole("button", { name: /^START$|^STOP$/ }).first().innerText()));
/* Started on the wrong truck. Putting it right must not cost the
   minutes already driven — the equipment card lets the unit be
   changed under a running clock and so does this. */
ok("the truck can still be corrected under a running clock",
  !(await page.getByLabel("Equipment").first().isDisabled()));
const ran = (await page.locator("body").innerText()).match(/\d:\d\d:\d\d/)?.[0];
await page.getByLabel("Equipment").first().fill("889");
await page.waitForTimeout(400);
await page.getByLabel("Equipment").first().press("Enter");
await page.waitForTimeout(700);
t = await page.locator("body").innerText();
ok("…and the trip follows the truck that was really driven",
  /DT-889/.test(t), t.slice(0, 600));
ok("…without the clock being reset", /0:00:(0[1-9]|[1-5]\d)/.test(t),
  [ran, (t.match(/\d:\d\d:\d\d/) || [])[0]].join(" → "));
/* Back to the one this test books against. */
await page.getByLabel("Equipment").first().fill("898");
await page.waitForTimeout(400);
await page.getByLabel("Equipment").first().press("Enter");
await page.waitForTimeout(500);
/* Nothing is written until the clock stops. */
ok("nothing is on the card yet",
  writes.filter((w) => w.table === "tw_time_entries" && w.method === "POST").length === 0,
  JSON.stringify(writes.map((w) => w.method + " " + w.table)));

console.log("\n── stop ──");
await page.getByRole("button", { name: /^STOP$/ }).first().click();
await page.waitForTimeout(1600);

const posted = writes.filter((w) => w.table === "tw_time_entries" && w.method === "POST");
/* Stopping is the save. A trip nobody saved is a trip that did not
   get paid. */
ok("stopping puts it on the card with no Save to press", posted.length === 1,
  JSON.stringify(writes.map((w) => w.method + " " + w.table)));
const body = Array.isArray(posted[0]?.body) ? posted[0].body[0] : posted[0]?.body;
/* The whole design: an ordinary time entry. Everything downstream —
   the card total, the approval, payroll — reads these already. */
ok("as an ordinary time entry, not a new kind of record",
  body?.mechanic_id === "m1" && Number(body?.hours) > 0, JSON.stringify(body));
ok("…marked as driving", (body?.work_types || []).includes("Driving"),
  JSON.stringify(body?.work_types));
ok("…against the truck that was driven", body?.vehicle_id === "v1", JSON.stringify(body));
ok("…booked as driving, not as a road call",
  body?.where_worked === "driving", body?.where_worked);
/* Real time, not a quarter hour. Twenty seconds books a hundredth of
   an hour, which is as fine as tw_time_entries.hours goes. */
ok("…for the time actually driven, not a rounded-up quarter",
  Number(body?.hours) > 0 && Number(body?.hours) < 0.25, body?.hours);
/* So a supervisor can see a clock was really run rather than a figure
   typed in afterwards. */
ok("…with the seconds actually run kept behind it",
  Number(body?.unit_seconds) > 0, body?.unit_seconds);
ok("…and the stint that produced them", (body?.stints || []).length === 1,
  JSON.stringify(body?.stints));
/* Nobody was asked for this. It is the one thing payroll cannot do
   without, so it is guessed from what they have already charged. */
ok("the cost code was filled in rather than asked for",
  body?.cost_code === "880", body?.cost_code);

console.log("\n── and after ──");
t = await page.locator("body").innerText();
ok("the trip is on the list", /DT-898/.test(t), t.slice(0, 700));
ok("…and counted at the top", /0\.0\d hours driving/i.test(t),
  (t.match(/[^\n]*hours driving[^\n]*/i) || [""])[0]);
ok("the clock is back to nothing", /0:00:00/.test(t), t.slice(0, 700));
/* The next thing a mechanic does is usually drive it back. */
ok("…but the truck stays picked", /DT-898/.test(t), t.slice(0, 700));

console.log("\n── a trip too short to be one ──");
/* Real time means a press of Start and Stop books nothing: under
   eighteen seconds there is no hundredth of an hour to write and the
   database refuses nought hours. */
const beforeShort = writes.filter((w) => w.table === "tw_time_entries").length;
await page.getByRole("button", { name: /^START$/ }).first().click();
await page.waitForTimeout(900);
await page.getByRole("button", { name: /^STOP$/ }).first().click();
await page.waitForTimeout(1300);
t = await page.locator("body").innerText();
ok("a few seconds books nothing",
  writes.filter((w) => w.table === "tw_time_entries").length === beforeShort,
  JSON.stringify(writes.filter((w) => w.table === "tw_time_entries").length));
ok("…and it says why rather than failing quietly",
  /too short to put on your card/i.test(t), t.slice(0, 700));

console.log("\n── changing where it charges ──");
/* Asked for after the fact, on the finished line, rather than put in
   front of a clock. */
const codeBox = page.locator("tbody select").first();
ok("the cost code can be changed on the line", (await codeBox.count()) > 0);
await codeBox.selectOption("SHOP-CF");
await page.waitForTimeout(1400);
const patched = writes.filter((w) => w.table === "tw_time_entries" && w.method === "PATCH");
ok("…and it saves", patched.some((w) => w.body?.cost_code === "SHOP-CF"),
  JSON.stringify(patched.map((w) => w.body?.cost_code)));

/* The hours are on the card, not in a corner of their own: this is
   the whole reason a driving line is an ordinary time entry. */
await page.getByRole("button", { name: "Today", exact: true }).first().click();
await page.waitForTimeout(1600);
t = await page.locator("body").innerText();
/* Three hours of shop work already on the card, plus the trip just
   clocked — real time, so a hundredth rather than a quarter. */
ok("the driving hours are on the timecard itself", /3\.0\d hours on/.test(t),
  (t.match(/[^\n]*hours on[^\n]*/i) || [""])[0]);
ok("…added to the shop hours already there, not instead of them",
  /Gearbox out/.test(t), t.slice(0, 900));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));
ok("no rejected requests at all", rest400.length === 0, rest400.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
