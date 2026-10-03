/* The clock on a tread walk-around, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-jobclock.mjs holds the arithmetic. This holds the part
   only a browser can answer: that pressing Record tread starts the
   clock, that it can be stopped and started again, and — the whole
   point of it — that saving the readings puts the time on the
   mechanic's own timecard as an ordinary time entry.

   Two failures are kept apart on purpose. The readings and the hours
   are separate writes: a mechanic whose hours would not book must
   still have their readings saved, and must be told which half went
   wrong. A screen that said "that did not save" over a save that did
   is how somebody gauges a truck twice.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-treadclock.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const WHO = "donald_bradley@theallen.com";
const V = "v898";

const tire = (id, pos) => ({
  id, vehicle_id: V, position: pos, brand: "Continental", model: "HDC3",
  size: "11R24.5", tire_type: "virgin", wheel_material: "aluminum", casing_id: null,
  mounted_date: "2026-08-25", mounted_odometer: 100000, mounted_depth: 28,
  cost: 655.24, removed_date: null, removed_odometer: null, removed_reason: null,
  notes: null, created_by: null, created_at: "2026-08-25", retread_count: null,
  model_id: null,
});

const rows = {
  tw_vehicles: [{ id: V, number: "DT-898", make: "Peterbilt", model: "567",
    model_year: "2023", division: "DT", axle_config: "single6",
    motive_vehicle_id: null, motive_asset_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  tw_tires: [tire("t1", "1L"), tire("t2", "1R")],
  tw_tread_readings: [], tw_tire_wear: [], tw_tire_models: [],
  tw_odometer_log: [{ id: "o1", vehicle_id: V, reading_date: "2026-10-01",
    odometer: 120000, source: "hand", created_at: "2026-10-01" }],
  tw_tire_brands: [{ id: "b1", name: "Continental", sort_order: 1, active: true }],
  tw_settings: [{ id: true, pull_steer_32nds: 6, pull_other_32nds: 4,
    default_new_depth: 28, dual_match_32nds: 4, alert_emails: [],
    updated_at: "2026-01-01" }],
  tw_mechanics: [{ id: "m1", name: "Donald Bradley", email: WHO,
    active: true, pin_set: true }],
  tw_cost_codes: [
    { code: "878", name: "Tire Group", active: true, group: "Vehicle", code_group: "Vehicle" },
    { code: "SHOP-CF", name: "Clays Ferry Shop", active: true, group: "Shop", code_group: "Shop" },
  ],
  tw_time_entries: [], tw_hours: [], tw_work_log: [],
  tw_tire_alerts: [], tw_tires_due_out: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  console.log("  node scripts/test-treadclock.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
await ctx.addInitScript(new Function(
  `localStorage.setItem("tirewear:who", ${JSON.stringify(WHO)});`));
/* The PIN check, as the database answers it. 1234 is Donald's. */
const { writes } = await fakeRest(ctx, {
  rows,
  rpc: {
    tw_mechanic_check_pin: (b) => (b?.p_pin === "1234"
      ? { ok: true, name: "Donald Bradley", role: "mechanic" }
      : { ok: false, error: "That PIN was not right." }),
  },
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
await page.waitForTimeout(1800);
await page.getByRole("button", { name: /DT-898/ }).first().click();
await page.waitForTimeout(1400);

console.log("── before the walk-around ──");
let t = await page.locator("body").innerText();
ok("the truck opens", /DT-898/.test(t), t.slice(0, 200));
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));
/* No clock until there is a job to clock. */
ok("there is no clock sitting on the screen", !/0:00:0/.test(t), t.slice(0, 400));

console.log("\n── Record tread starts it ──");
await page.getByRole("button", { name: "Record tread", exact: true }).first().click();
/* Long enough to be a real job. Hours are real time now rather than
   rounded up to a quarter, so a clock that runs four seconds books
   nothing — which is tested on its own further down. */
await page.waitForTimeout(12000);
t = await page.locator("body").innerText();
/* Pressing Record tread IS starting the job. A clock somebody has to
   remember to start separately is a clock that mostly reads nought. */
ok("the clock is running already", /on the clock/i.test(t),
  (t.match(/[^\n]*on the clock[^\n]*/i) || [""])[0]);
ok("…and counting", /0:00:(0[1-9]|[1-5]\d)/.test(t), (t.match(/\d:\d\d:\d\d/) || [""])[0]);
const stopBtn = page.getByRole("button", { name: /^STOP$|^START$/ }).first();
ok("it can be stopped", /STOP/.test(await stopBtn.innerText()), await stopBtn.innerText());

console.log("\n── stop and start again ──");
await stopBtn.click();
await page.waitForTimeout(1200);
t = await page.locator("body").innerText();
ok("stopping says what would go on the card", /to your card/i.test(t),
  (t.match(/[^\n]*to your card[^\n]*/i) || [""])[0]);
/* In words, because "0.08" on a card is not a thing anybody
   recognises. */
ok("…in seconds or minutes, not a decimal", /\d+ (second|minute)s? to your card/i.test(t),
  (t.match(/[^\n]*to your card[^\n]*/i) || [""])[0]);
const held = (t.match(/\d:\d\d:\d\d/) || [""])[0];
await page.waitForTimeout(2000);
t = await page.locator("body").innerText();
/* Pulled off the truck for a road call: the gap must not be paid. */
ok("a stopped clock does not keep counting",
  (t.match(/\d:\d\d:\d\d/) || [""])[0] === held,
  `${held} → ${(t.match(/\d:\d\d:\d\d/) || [""])[0]}`);
await page.getByRole("button", { name: /^START$/ }).first().click();
await page.waitForTimeout(11000);
t = await page.locator("body").innerText();
ok("…and starting again carries on from where it was",
  /on the clock/i.test(t) && (t.match(/\d:\d\d:\d\d/) || [""])[0] !== "0:00:00",
  (t.match(/\d:\d\d:\d\d/) || [""])[0]);

console.log("\n── the readings, and the hours ──");
/* Gauge both tires. */
for (const [pos, depth] of [["1L", "17"], ["1R", "16"]]) {
  const box = page.getByLabel(new RegExp(`^${pos}\\b`, "i")).first();
  if (await box.count()) { await box.click(); await box.fill(depth); }
  else {
    const anyBox = page.locator("input[inputmode='decimal'], input[type='number']");
    await anyBox.nth(pos === "1L" ? 1 : 2).fill(depth);
  }
  await page.waitForTimeout(200);
}
await page.waitForTimeout(400);
await page.getByRole("button", { name: /^Save \d+ reading/ }).first().click();
await page.waitForTimeout(2200);

const readings = writes.filter((w) => w.table === "tw_tread_readings");
ok("the readings saved", readings.length > 0,
  JSON.stringify(writes.map((w) => w.method + " " + w.table)));

console.log("\n── the hours wait for a PIN ──");
/* The badge these screens run on is a line in localStorage that
   anybody at the tablet can change. Right for "who gauged this tire",
   wrong for "whose pay is this". */
ok("nothing is booked on the badge alone",
  writes.filter((w) => w.table === "tw_time_entries").length === 0,
  JSON.stringify(writes.map((w) => w.method + " " + w.table)));
t = await page.locator("body").innerText();
ok("it asks for one", /Put \d+ (second|minute)s? on a card/i.test(t), t.slice(0, 500));
ok("…naming whose hours it thinks they are", /Donald Bradley/.test(t), t.slice(0, 500));

/* A wrong PIN books nothing and does not throw the hour away. */
for (const k of ["9", "9", "9", "9"]) {
  await page.getByRole("button", { name: k, exact: true }).first().click();
  await page.waitForTimeout(120);
}
await page.waitForTimeout(900);
t = await page.locator("body").innerText();
ok("a wrong PIN is refused", /not right/i.test(t), t.slice(0, 500));
ok("…and books nothing",
  writes.filter((w) => w.table === "tw_time_entries").length === 0,
  JSON.stringify(writes.map((w) => w.method + " " + w.table)));

/* Closing it must not lose an hour somebody has worked. */
/* The modal closes on its backdrop; there is no X. */
await page.mouse.click(8, 8);
await page.waitForTimeout(900);
t = await page.locator("body").innerText();
ok("closing leaves the hours waiting rather than dropping them",
  /waiting to\s+go on a card|are waiting/i.test(t.replace(/\s+/g, " ")), t.slice(0, 600));
await page.getByRole("button", { name: /PUT THE HOURS ON A CARD/i }).first().click();
await page.waitForTimeout(800);

for (const k of ["1", "2", "3", "4"]) {
  await page.getByRole("button", { name: k, exact: true }).first().click();
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1600);

const booked = writes.filter((w) => w.table === "tw_time_entries" && w.method === "POST");
/* The point of the whole thing. */
ok("the right PIN books them", booked.length === 1,
  JSON.stringify(writes.map((w) => w.method + " " + w.table)));
const body = Array.isArray(booked[0]?.body) ? booked[0].body[0] : booked[0]?.body;
ok("…as an ordinary time entry", Number(body?.hours) > 0 && !!body?.cost_code,
  JSON.stringify(body));
/* On whoever put the PIN in, which is the only proof the app has of
   who was actually standing there. */
ok("…on the mechanic whose PIN it was", body?.mechanic_id === "m1",
  JSON.stringify(body?.mechanic_id));
ok("…against the truck it was done on", body?.vehicle_id === V, JSON.stringify(body));
ok("…marked as tire work", (body?.work_types || []).includes("Tires"),
  JSON.stringify(body?.work_types));
ok("…saying what was done", /2 tires gauged/.test(body?.work_performed || ""),
  body?.work_performed);
ok("…with the seconds actually clocked behind it", Number(body?.unit_seconds) > 0,
  body?.unit_seconds);
/* Two stints, because the clock was stopped and started again. */
ok("…and both stints that produced them", (body?.stints || []).length === 2,
  JSON.stringify(body?.stints));
/* Nobody was asked for a cost code, and the one it picks is not a
   guess: gauging tread is tire work, and the shop books tire work to
   878 by hand. Charging it to a shop code — which is what the first
   version did, because it borrowed the Driving tab's "whatever you
   charged earlier" rule — buried tire time in shop overhead where
   the fleet could never add it up. */
ok("tread time charges to the tire code", body?.cost_code === "878", body?.cost_code);
ok("…not to shop time", body?.cost_code !== "SHOP-CF", body?.cost_code);

console.log("\n── and it says so ──");
t = await page.locator("body").innerText();
ok("the screen says the hours went on a card", /went on Donald Bradley/i.test(t),
  (t.match(/[^\n]*timecard[^\n]*/i) || [""])[0]);
/* The real clock in words, and the decimal payroll will see. */
ok("…how long it actually ran", /\d+ seconds went on/i.test(t),
  (t.match(/[^\n]*went on[^\n]*/i) || [""])[0]);
ok("…and what that is in hours", /as 0\.0\d hours/.test(t),
  (t.match(/[^\n]*went on[^\n]*/i) || [""])[0]);
ok("…and what it charged to, by name", /878 Tire Group/.test(t), t.slice(0, 500));
ok("the clock is gone once the job is done", !/on the clock/i.test(t), t.slice(0, 400));

console.log("\n── and it does not ask twice ──");
/* The unlock is the same proof the timecard takes, so a mechanic who
   has just put their PIN in is not asked again two minutes later. */
await page.getByRole("button", { name: "Record tread", exact: true }).first().click();
/* Again long enough to be a real job — see above. */
await page.waitForTimeout(20000);
const box2 = page.locator("input[inputmode='decimal'], input[type='number']").nth(1);
await box2.fill("15");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /^Save \d+ reading/ }).first().click();
await page.waitForTimeout(2200);
t = await page.locator("body").innerText();
ok("the second walk-around books without asking again",
  !/Put .* hours on a card/i.test(t), t.slice(0, 500));
ok("…and says so", /went on Donald Bradley/i.test(t),
  (t.match(/[^\n]*timecard[^\n]*/i) || [""])[0]);
ok("…with a second entry written",
  writes.filter((w) => w.table === "tw_time_entries" && w.method === "POST").length === 2,
  JSON.stringify(writes.filter((w) => w.table === "tw_time_entries").length));

console.log("\n── a walk-around too short to be one ──");
/* Real time means a press of Start and Stop books nothing: under
   eighteen seconds there is no hundredth of an hour to write, and the
   database refuses nought hours. Said rather than swallowed. */
const before2 = writes.filter((w) => w.table === "tw_time_entries").length;
await page.getByRole("button", { name: "Record tread", exact: true }).first().click();
await page.waitForTimeout(900);
await page.getByRole("button", { name: /^STOP$/ }).first().click();
await page.waitForTimeout(400);
const box3 = page.locator("input[inputmode='decimal'], input[type='number']").nth(1);
await box3.fill("14");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /^Save \d+ reading/ }).first().click();
await page.waitForTimeout(1600);
t = await page.locator("body").innerText();
ok("a few seconds books nothing",
  writes.filter((w) => w.table === "tw_time_entries").length === before2,
  JSON.stringify(writes.filter((w) => w.table === "tw_time_entries").length));
ok("…and it says why rather than failing quietly",
  /too short to put on a card/i.test(t), t.slice(0, 600));
ok("…while the readings still saved", /The readings saved/i.test(t), t.slice(0, 600));

console.log("\n── a walk-around nobody clocked ──");
/* Cancel throws the clock away. Starting again and saving with the
   clock never run books no hours — the feature never invents them. */
const before = writes.filter((w) => w.table === "tw_time_entries").length;
await page.getByRole("button", { name: "Record tread", exact: true }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /^STOP$/ }).first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /^Cancel$/ }).first().click();
await page.waitForTimeout(800);
ok("cancelling books nothing",
  writes.filter((w) => w.table === "tw_time_entries").length === before,
  JSON.stringify(writes.filter((w) => w.table === "tw_time_entries").length));
t = await page.locator("body").innerText();
ok("…and takes the clock away with it", !/on the clock/i.test(t), t.slice(0, 300));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));
ok("no rejected requests at all", rest400.length === 0, rest400.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
