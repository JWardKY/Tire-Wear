/* The Driving tab, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-driveline.mjs holds the rules. This holds the part
   only a browser can answer: that the tab is there behind the PIN
   with the rest of somebody's own hours, that a trip cannot be saved
   half-written, and — the point of the whole design — that what
   reaches the database is an ORDINARY time entry.

   That last one is why this test exists at all. If driving were ever
   written as its own kind of record, the card total, the approval and
   the payroll export would each have to learn about it, and the first
   one somebody forgot would be hours that never reached payroll. So
   the assertion to break is the one about the insert landing in
   tw_time_entries with hours and a cost code on it.

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
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  tw_mechanics: [{ id: MECH.id, name: MECH.name, email: MECH.email,
    active: true, pin_set: true }],
  tw_cost_codes: [{ code: "880", name: "Repair", active: true,
    group: "Labour", code_group: "Labour" }],
  tw_parts: [], tw_parts_reorder: [],
  tw_shifts: [], tw_shift_days: [], tw_on_clock: [], tw_timecard_days: [],
  /* A shop line already on the card. The Driving tab has to leave it
     alone: a tab that listed the whole day would look right until the
     day somebody tried to edit a gearbox rebuild from it. */
  tw_time_entries: [{ id: "e-shop", mechanic_id: MECH.id, work_date: new Date().toISOString().slice(0, 10),
    vehicle_id: "v1", unit_label: null, where_worked: "shop", hours: 3,
    cost_code: "880", work_order: null, note: "Gearbox out", defect_id: null,
    work_types: ["Repair"], unit_seconds: 0, stints: [], work_performed: null,
    job_location: null, pm_program_id: null, drove_from: null, drove_to: null,
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
    drove_from: t.drove_from, drove_to: t.drove_to,
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
ok("…and says what it is for when there is nothing on it",
  /Shuttling a truck, a parts run/i.test(t), t.slice(0, 400));
/* Three hours of shop work are already on this card. This tab is
   about driving, so none of it belongs here — and the hours at the
   top are the driving hours, not the day's. */
ok("the shop line already on the card is not on this tab",
  !/Gearbox out/.test(t), t.slice(0, 600));
ok("…and its hours are not counted as driving", /0\.00 hours driving/i.test(t),
  (t.match(/[^\n]*hours driving[^\n]*/i) || [""])[0]);
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));

console.log("\n── a trip cannot be saved half-written ──");
const add = page.getByRole("button", { name: /ADD IT TO THE CARD/i }).first();
ok("the button is there", (await add.count()) > 0);
ok("…and will not go yet", await add.isDisabled());
t = await page.locator("body").innerText();
/* Each gap says what is missing rather than leaving a dead button. */
ok("it says which unit is wanted first", /Say which unit was driven/i.test(t), t.slice(0, 500));

await page.getByLabel(/Which unit/i).first().selectOption("v1");
await page.waitForTimeout(300);
t = await page.locator("body").innerText();
ok("…then where it started", /Say where the trip started/i.test(t), t.slice(0, 500));
await page.getByLabel(/^From/i).first().fill("Clays Ferry Shop");
await page.waitForTimeout(250);
t = await page.locator("body").innerText();
ok("…then where it ended", /Say where it ended/i.test(t), t.slice(0, 500));
await page.getByLabel(/^To/i).first().fill("Clover Bottom Shop");
await page.waitForTimeout(250);
t = await page.locator("body").innerText();
/* Driving a truck to a quarry is chargeable to that quarry; driving
   one to the dealer is shop overhead. The app does not guess. */
ok("…then what to charge it to", /Choose what to charge the driving to/i.test(t), t.slice(0, 500));
await page.getByLabel(/Charge it to/i).first().selectOption("880");
await page.waitForTimeout(250);
t = await page.locator("body").innerText();
ok("…and last the hours", /Put the hours on it/i.test(t), t.slice(0, 500));
ok("still not saveable", await add.isDisabled());

const hrs = page.getByLabel(/^Hours/i).first();
await hrs.click();
await page.keyboard.type("1.5");
await page.waitForTimeout(400);
ok("with everything on it, it can be saved", !(await add.isDisabled()));

console.log("\n── what reaches the database ──");
await add.click();
await page.waitForTimeout(1400);

const posted = writes.filter((w) => w.table === "tw_time_entries" && w.method === "POST");
ok("it is written", posted.length === 1, JSON.stringify(writes.map((w) => w.table)));
const body = Array.isArray(posted[0]?.body) ? posted[0].body[0] : posted[0]?.body;
/* The whole design: an ordinary time entry. Everything downstream —
   the card total, the approval, payroll — reads these already. */
ok("as an ordinary time entry, not a new kind of record",
  Number(body?.hours) === 1.5 && body?.cost_code === "880"
  && body?.mechanic_id === "m1", JSON.stringify(body));
ok("…marked as driving", (body?.work_types || []).includes("Driving"),
  JSON.stringify(body?.work_types));
ok("…against the truck that was driven", body?.vehicle_id === "v1", JSON.stringify(body));
ok("…carrying both ends of the trip",
  body?.drove_from === "Clays Ferry Shop" && body?.drove_to === "Clover Bottom Shop",
  JSON.stringify(body));
/* Not "road": that already means an outside service call on the Now
   board, the hours split and the payroll export. */
ok("…and booked as driving, not as a road call",
  body?.where_worked === "driving", body?.where_worked);

console.log("\n── and it shows up ──");
t = await page.locator("body").innerText();
ok("the trip is on the list", /Clays Ferry Shop → Clover Bottom Shop/.test(t), t.slice(0, 600));
ok("…with its hours", /1\.50/.test(t), t.slice(0, 600));
ok("…and counted at the top", /1\.50 hours driving/i.test(t),
  (t.match(/[^\n]*hours driving[^\n]*/i) || [""])[0]);

console.log("\n── the way back ──");
/* Saving does not wipe the form. Somebody who drove a truck down is
   usually about to log the trip back, and should not retype the unit,
   both ends and the cost code to do it. */
ok("the trip is still in the form after saving",
  (await page.getByLabel(/^From/i).first().inputValue()) === "Clays Ferry Shop",
  await page.getByLabel(/^From/i).first().inputValue());
ok("…but its hours are cleared, so nothing is booked twice",
  (await page.getByLabel(/^Hours/i).first().inputValue()) === "",
  await page.getByLabel(/^Hours/i).first().inputValue());
/* Hours typed but not yet saved, so turning the trip round has
   something to drop. The way back took as long as it took. */
await page.getByLabel(/^Hours/i).first().click();
await page.keyboard.type("2");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Turn it round/i }).first().click();
await page.waitForTimeout(400);
ok("the ends swap over",
  (await page.getByLabel(/^From/i).first().inputValue()) === "Clover Bottom Shop"
  && (await page.getByLabel(/^To/i).first().inputValue()) === "Clays Ferry Shop",
  [await page.getByLabel(/^From/i).first().inputValue(),
   await page.getByLabel(/^To/i).first().inputValue()].join(" / "));
/* The hours do not come with it: the way back took as long as it took. */
ok("…without carrying the hours over",
  (await page.getByLabel(/^Hours/i).first().inputValue()) === "",
  await page.getByLabel(/^Hours/i).first().inputValue());

/* The hours are on the card, not in a corner of their own: this is
   the whole reason a driving line is an ordinary time entry. */
await page.getByRole("button", { name: "Today", exact: true }).first().click();
await page.waitForTimeout(1600);
t = await page.locator("body").innerText();
ok("the driving hours are on the timecard itself", /4\.5/.test(t),
  (t.match(/[^\n]*hours on[^\n]*/i) || [""])[0]);
ok("…added to the shop hours that were already there, not instead of them",
  /Gearbox out/.test(t), t.slice(0, 900));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));
ok("no rejected requests at all", rest400.length === 0, rest400.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
