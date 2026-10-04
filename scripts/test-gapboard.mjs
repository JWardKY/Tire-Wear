/* Closing a gap on somebody else's card, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-cardedit.mjs holds the rules. This holds the part only
   a browser can answer: that a supervisor can actually add, correct
   and remove a line on a mechanic's day — and that every one of those
   writes carries the supervisor's name into the work log.

   The card under test is Joshua's real one: 4.60 on the clock, 1.23
   booked, a gap of +3.37 that the app had no way to close. A board
   that shows a number nobody can act on is a report, not a tool.

   Two properties matter more than the buttons working:

     1. Hours cannot come off a card anonymously or silently. The log
        write is strict and the reason is required, because once the
        row is gone the reason is the only record it existed.
     2. Removing a line from an APPROVED card withdraws the approval.
        The view decides "still approved" by comparing the signature
        against the newest edit on the card — which works for an add
        and a correction, and cannot work for a removal: taking the
        newest line off makes the newest edit older. Without this a
        signed card could quietly lose hours and go on reading as
        approved.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-gapboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const BADGE = "jason_ward@theallen.com";
const BOSS = { id: "s1", name: "Jason Ward" };
const MECH = { id: "m1", name: "Joshua Sawyers", email: "joshua@theallen.com" };
const DATE = "2026-10-03";

/* 4.60 on the clock. */
const SHIFT = { id: "sh1", mechanic_id: MECH.id, work_date: DATE,
  started_at: `${DATE}T11:00:00.000Z`, ended_at: `${DATE}T16:06:00.000Z`,
  lunch_minutes: 30, clock_hours: 4.6, open: false,
  created_at: DATE, updated_at: `${DATE}T16:06:00.000Z` };

const entry = (o) => ({
  id: o.id, mechanic_id: MECH.id, work_date: DATE, vehicle_id: o.veh || null,
  unit_label: o.label || null, where_worked: "shop", hours: o.hours,
  cost_code: o.code, work_order: o.wo || null, note: o.note || null,
  defect_id: null, work_types: o.types || [], unit_seconds: o.secs || 0,
  stints: [], work_performed: o.did || null, job_location: null, pm_program_id: null,
  created_at: DATE, updated_at: o.at || `${DATE}T12:00:00.000Z`,
});

const rows = {
  tw_vehicles: [
    { id: "v1", number: "DT-861", make: "Peterbilt", model: "567", model_year: "2023",
      division: "DT", axle_config: "dump12", motive_vehicle_id: null, motive_asset_id: null,
      active: true, notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
    { id: "v2", number: "DT-1800", make: "Mack", model: "Granite", model_year: "2021",
      division: "DT", axle_config: "dump12", motive_vehicle_id: null, motive_asset_id: null,
      active: true, notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
  ],
  tw_mechanics: [
    { id: MECH.id, name: MECH.name, email: MECH.email, emp_no: "35601",
      active: true, pin_set: true },
    { id: BOSS.id, name: BOSS.name, email: BADGE, emp_no: "1",
      active: true, pin_set: true, role: "supervisor" },
    { id: "m2", name: "Tyler Coffey", email: "tyler@theallen.com", emp_no: "6340",
      active: true, pin_set: true },
  ],
  tw_cost_codes: [
    { code: "873", name: "Service", active: true, group: "Vehicle", code_group: "Vehicle" },
    { code: "878", name: "Tire Group", active: true, group: "Vehicle", code_group: "Vehicle" },
    { code: "SHOP-CF", name: "Clays Ferry Shop", active: true, group: "Shop", code_group: "Shop" },
  ],
  tw_shifts: [SHIFT], tw_shift_days: [SHIFT], tw_on_clock: [],
  tw_time_entries: [
    entry({ id: "e1", veh: "v1", hours: 1.23, code: "878",
      did: "Air up tires, 4LO and 4RO", types: ["Tires"] }),
    { ...entry({ id: "e2", veh: "v2", hours: 5, code: "873", did: "Brake job" }),
      mechanic_id: "m2" },
  ],
  tw_timecard_days: [],
  /* A card somebody has already signed. Removing a line from it is
     the case the view's own "is this still approved" test cannot
     catch, so the code has to withdraw the approval outright. */
  tw_timecard_approvals: [{ mechanic_id: "m2", work_date: DATE,
    approved_by: BOSS.name, approved_at: `${DATE}T20:00:00.000Z` }],
  tw_work_log: [],
  tw_hours: [], tw_parts: [], tw_parts_reorder: [], tw_pm_programs: [],
  tw_defects: [], tw_work_orders: [], tw_work_order_crew: [], tw_defects_open: [],
  tw_pm_due: [], tw_tire_alerts: [], tw_tires_due_out: [], tw_part_requests: [],
  tw_time_entry_parts: [], tw_part_txns: [], tw_vendors: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  console.log("  node scripts/test-gapboard.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addInitScript(new Function(
  `localStorage.setItem("tirewear:who", ${JSON.stringify(BADGE)});`
  /* Past the supervisor gate, which is a PIN against the same roster. */
  + `localStorage.setItem("tirewear:supervisor", ${JSON.stringify(
      JSON.stringify({ id: BOSS.id, name: BOSS.name, at: Date.now() }))});`
));
const { writes } = await fakeRest(ctx, { rows });

/* listDay reads tw_hours, another view over tw_time_entries. Without
   this the dialog's line table comes back empty however many rows
   were written, and the test would be checking an empty card. */
await ctx.route("**/rest/v1/tw_hours*", async (route) => {
  if (route.request().method() !== "GET") return route.fallback();
  const mech = Object.fromEntries(rows.tw_mechanics.map((m) => [m.id, m]));
  const veh = Object.fromEntries(rows.tw_vehicles.map((v) => [v.id, v]));
  const code = Object.fromEntries(rows.tw_cost_codes.map((c) => [c.code, c]));
  rows.tw_hours = rows.tw_time_entries.map((t) => ({
    id: t.id, work_date: t.work_date, hours: t.hours, cost_code: t.cost_code,
    where_worked: t.where_worked, work_order: t.work_order, note: t.note,
    defect_id: t.defect_id, mechanic_id: t.mechanic_id,
    mechanic: mech[t.mechanic_id]?.name ?? null,
    mechanic_email: mech[t.mechanic_id]?.email ?? null,
    vehicle_id: t.vehicle_id,
    unit: veh[t.vehicle_id]?.number ?? t.unit_label ?? null,
    division: veh[t.vehicle_id]?.division ?? null,
    cost_code_name: code[t.cost_code]?.name ?? null,
    code_group: code[t.cost_code]?.code_group ?? null,
    work_types: t.work_types, unit_seconds: t.unit_seconds, stints: t.stints,
    work_performed: t.work_performed, created_at: t.created_at, job_location: null,
  }));
  return route.fallback();
});

/* The board reads tw_timecard_days, which is a VIEW over the entries,
   the shifts and the approvals. The fake serves tables, so an insert
   into tw_time_entries would never move the gap and the screen would
   look as though nothing had saved — the opposite of the real
   database, and a lie that would hide exactly the bug this is for.
   Recomputed on every read with the same arithmetic the view has. */
await ctx.route("**/rest/v1/tw_timecard_days*", async (route) => {
  if (route.request().method() !== "GET") return route.fallback();
  const mech = Object.fromEntries(rows.tw_mechanics.map((m) => [m.id, m]));
  const veh = Object.fromEntries(rows.tw_vehicles.map((v) => [v.id, v]));
  const keys = new Map();
  rows.tw_time_entries.forEach((t) => keys.set(`${t.mechanic_id}|${t.work_date}`, t));
  rows.tw_shift_days.forEach((s) => keys.set(`${s.mechanic_id}|${s.work_date}`, s));
  rows.tw_timecard_days = [...keys.keys()].map((k) => {
    const [mid, date] = k.split("|");
    const es = rows.tw_time_entries.filter((t) => t.mechanic_id === mid && t.work_date === date);
    const shs = rows.tw_shift_days.filter((s) => s.mechanic_id === mid && s.work_date === date);
    const a = rows.tw_timecard_approvals.find((x) => x.mechanic_id === mid && x.work_date === date);
    const booked = Math.round(es.reduce((x, t) => x + Number(t.hours), 0) * 100) / 100;
    const clocked = Math.round(shs.reduce((x, s) => x + Number(s.clock_hours), 0) * 100) / 100;
    const lastEntry = es.map((t) => t.updated_at).sort().pop() || null;
    const lastShift = shs.map((s) => s.updated_at).sort().pop() || null;
    const lastEdit = [lastEntry, lastShift].filter(Boolean).sort().pop() || null;
    return {
      mechanic_id: mid, mechanic: mech[mid]?.name ?? null, emp_no: mech[mid]?.emp_no ?? null,
      work_date: date, clock_hours: clocked, booked_hours: booked,
      true_hours: Math.round(es.reduce((x, t) => x + Number(t.unit_seconds || 0), 0) / 36) / 100,
      difference: Math.round((clocked - booked) * 100) / 100,
      lines: es.length,
      uncoded_lines: es.filter((t) => !t.cost_code).length,
      uncoded_hours: es.filter((t) => !t.cost_code).reduce((x, t) => x + Number(t.hours), 0),
      first_in: shs[0]?.started_at ?? null, last_out: shs[shs.length - 1]?.ended_at ?? null,
      still_open: shs.some((s) => s.open),
      approved_by: a?.approved_by ?? null, approved_at: a?.approved_at ?? null,
      last_edit: lastEdit,
      approved: !!a && (!lastEdit || a.approved_at >= lastEdit),
      changed_since_approved: !!a && !!lastEdit && a.approved_at < lastEdit,
      units: es.map((t) => veh[t.vehicle_id]?.number ?? t.unit_label).filter(Boolean),
      cost_codes: es.map((t) => t.cost_code).filter(Boolean),
    };
  });
  return route.fallback();
});

const page = await ctx.newPage();
const crashes = [], rest400 = [];
page.on("pageerror", (e) => crashes.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

const logs = () => writes.filter((w) => w.table === "tw_work_log");
const bodyOf = (w) => (Array.isArray(w?.body) ? w.body[0] : w?.body);
const lastLog = () => bodyOf(logs()[logs().length - 1]);
const entryWrites = (m) =>
  writes.filter((w) => w.table === "tw_time_entries" && (!m || w.method === m));

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1400);
await page.getByRole("button", { name: "Supervisor", exact: true }).first().click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Timecards", exact: true }).first().click();
await page.waitForTimeout(1800);

console.log("── the board ──");
let t = await page.locator("body").innerText();
ok("the card is listed", /Joshua Sawyers/.test(t), t.slice(0, 400));
ok("…with the gap on it", /\+?3\.37/.test(t), (t.match(/[^\n]*3\.37[^\n]*/) || [""])[0]);
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));

await page.getByRole("button", { name: "Open", exact: true }).first().click();
await page.waitForTimeout(1200);
t = await page.locator("body").innerText();

console.log("\n── the card, opened ──");
ok("the dialog says what the gap is", /not booked to anything yet/i.test(t),
  (t.match(/[^\n]*booked to anything[^\n]*/i) || [""])[0]);
ok("…and how big", /3\.37/.test(t), (t.match(/[^\n]*3\.37[^\n]*/) || [""])[0]);
ok("the line already on the card is there", /DT-861/.test(t), t.slice(0, 600));
/* This is the whole point of the change: these used to be a
   read-only table with nothing under it but "delete this card". */
ok("a line can be corrected",
  (await page.getByRole("button", { name: "Edit", exact: true }).count()) > 0);
ok("…or taken off",
  (await page.getByRole("button", { name: "Remove", exact: true }).count()) > 0);
ok("…and one can be added",
  (await page.getByRole("button", { name: /Add a line/i }).count()) > 0);

console.log("\n── booking the missing hours ──");
await page.getByRole("button", { name: /Add a line/i }).first().click();
await page.waitForTimeout(1200);
t = await page.locator("body").innerText();
/* A supervisor must be able to see whose pay they are changing
   without looking away from the form. */
ok("the form says whose card it is", /Joshua Sawyers['’]s card/i.test(t),
  (t.match(/[^\n]*card — every hour[^\n]*/i) || [""])[0]);

await page.getByLabel("Truck").first().selectOption("v2");
await page.waitForTimeout(200);
await page.getByLabel("Cost code").first().selectOption("873");
await page.waitForTimeout(200);
await page.getByLabel("Hours").first().fill("3.37");
await page.waitForTimeout(200);
await page.getByRole("button", { name: /^Add hours$/ }).first().click();
await page.waitForTimeout(1800);

ok("the hours are written", entryWrites("POST").length === 1,
  JSON.stringify(writes.map((w) => w.method + " " + w.table)));
const added = bodyOf(entryWrites("POST")[0]);
ok("…against the mechanic whose card it is", added?.mechanic_id === MECH.id, added?.mechanic_id);
ok("…on the day the card is for", added?.work_date === DATE, added?.work_date);
ok("…with the cost code picked", added?.cost_code === "873", added?.cost_code);
ok("…and the hours typed", Number(added?.hours) === 3.37, added?.hours);

/* The audit trail is the reason this is allowed at all. */
ok("it goes to the work log", logs().length === 1,
  JSON.stringify(writes.map((w) => w.method + " " + w.table)));
let L = lastLog();
ok("…signed by the supervisor, not the badge",
  L?.actor_name === BOSS.name, `${L?.actor_name} (badge is ${BADGE})`);
ok("…naming the mechanic whose card changed",
  /Joshua Sawyers/.test(L?.summary || ""), L?.summary);
ok("…and what went on it", /3\.37 hr on DT-1800 to 873 added/.test(L?.summary || ""),
  L?.summary);

t = await page.locator("body").innerText();
ok("the gap closes on screen", /The clock and the card agree/i.test(t),
  (t.match(/[^\n]*(agree|booked to anything)[^\n]*/i) || [""])[0]);

console.log("\n── correcting a line ──");
await page.getByRole("button", { name: "Edit", exact: true }).first().click();
await page.waitForTimeout(1000);
await page.getByLabel("Hours").first().fill("1.50");
await page.waitForTimeout(200);
await page.getByRole("button", { name: /^Save changes$/ }).first().click();
await page.waitForTimeout(1600);
ok("the correction is written", entryWrites("PATCH").length === 1,
  JSON.stringify(writes.map((w) => w.method + " " + w.table)));
L = lastLog();
ok("…and logged as a change, with both sides",
  /hours 1\.23 → 1\.50/.test(L?.summary || ""), L?.summary);
ok("…signed by the supervisor", L?.actor_name === BOSS.name, L?.actor_name);

console.log("\n── taking hours off ──");
const beforeDelete = writes.filter((w) => w.method === "DELETE").length;
await page.getByRole("button", { name: "Remove", exact: true }).first().click();
await page.waitForTimeout(900);
t = await page.locator("body").innerText();
ok("it asks why", /Why are these hours coming off/i.test(t), t.slice(0, 500));
ok("…and says the log is the only record left",
  /only\s+record/i.test(t.replace(/\s+/g, " ")), t.slice(0, 900));
const go = page.getByRole("button", { name: /Remove these hours/i }).first();
ok("…and will not go without one", await go.isDisabled());
await page.getByLabel(/Why are these hours/i).first().fill("abc");
await page.waitForTimeout(400);
ok("…nor on three letters", await go.isDisabled());
await page.getByLabel(/Why are these hours/i).first().fill("booked twice");
await page.waitForTimeout(400);
ok("…and goes with a real one", !(await go.isDisabled()));
await go.click();
await page.waitForTimeout(1800);

ok("the hours come off", writes.filter((w) => w.method === "DELETE").length > beforeDelete,
  JSON.stringify(writes.map((w) => w.method + " " + w.table)));
const removeLog = logs().map(bodyOf).find((b) => /removed/.test(b?.summary || ""));
ok("…with the reason in the log sentence",
  /removed — booked twice/.test(removeLog?.summary || ""), removeLog?.summary);
ok("…signed by the supervisor", removeLog?.actor_name === BOSS.name, removeLog?.actor_name);
/* The row is gone; the sentence is all that is left of it, so it has
   to carry the figure as well as the reason. */
ok("…and the hours it took off", /1\.50 hr/.test(removeLog?.summary || ""),
  removeLog?.summary);

console.log("\n── a line off a card somebody has signed ──");
/* The view decides "still approved" by comparing the signature
   against the newest edit on the card. That works for an add and for
   a correction. It cannot work for a removal: taking the newest line
   off makes the newest edit OLDER than the signature, so a signed
   card could quietly lose hours and go on reading as approved — and
   payroll runs behind exactly that flag. */
await page.getByRole("button", { name: /^Close$|^✕$/ }).first().click()
  .catch(() => page.mouse.click(8, 8));
await page.waitForTimeout(1000);
const tylerRow = page.locator("tr").filter({ hasText: "Tyler Coffey" }).first();
await tylerRow.getByRole("button", { name: "Open", exact: true }).first().click();
await page.waitForTimeout(1400);
t = await page.locator("body").innerText();
ok("the signed card opens", /Tyler Coffey/.test(t), t.slice(0, 300));

const approvalDeletes = () => writes.filter((w) =>
  w.table === "tw_timecard_approvals" && w.method === "DELETE").length;
const before = approvalDeletes();
await page.getByRole("button", { name: "Remove", exact: true }).first().click();
await page.waitForTimeout(900);
t = await page.locator("body").innerText();
/* Said before they press it, not discovered afterwards. */
ok("it warns that the approval goes with it",
  /withdraws that approval/i.test(t), t.slice(0, 900));
await page.getByLabel(/Why are these hours/i).first().fill("wrong mechanic");
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Remove these hours/i }).first().click();
await page.waitForTimeout(2000);

ok("the approval is withdrawn", approvalDeletes() > before,
  JSON.stringify(writes.map((w) => w.method + " " + w.table)));
const pulled = logs().map(bodyOf).find((b) => b?.event_type === "timecard_unapproved");
ok("…and that is logged too, with why", /a line was removed/i.test(pulled?.summary || ""),
  pulled?.summary);
ok("…under the supervisor's name", pulled?.actor_name === BOSS.name, pulled?.actor_name);

ok("nothing threw", crashes.length === 0, crashes.join(" | "));
ok("no rejected requests at all", rest400.length === 0, rest400.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
