/* Fixing a missed punch, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-punch.mjs holds the arithmetic. This holds the three
   screens a person actually reaches for when somebody forgets to clock
   out, because the arithmetic being right is no use if nobody can find
   the box:

     1. The mechanic's own card, which has to come and find HIM — the
        forgotten punch is on yesterday, and nobody opens yesterday.
     2. The shop board's CLOSE IT, which used to stop the clock at now()
        and book a twenty-six hour day.
     3. The supervisor's card dialog, which could show the punches but
        not fix them, so a supervisor had to send the mechanic back into
        his own screen.

   `npm run build` passes on an undefined global, and the fake database
   refuses any column the real schema does not have, which is what makes
   this able to fail.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-punchboard.mjs
*/
import { spawnSync } from "node:child_process";

/* The shop's timezone, not the container's. A punch is typed as a wall
   clock time and stored as an instant, and the whole subject is which
   instant that is. Under UTC an Eastern bug reads as correct. */
if (!process.env.TZ) {
  const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], {
    stdio: "inherit", env: { ...process.env, TZ: "America/New_York" },
  });
  process.exit(r.status ?? 1);
}

const { chromium } = await import("playwright-core");
const { fakeRest, CHROME } = await import("./_fakerest.mjs");

const URL_ = process.env.APP_URL || "http://localhost:4173/";

const isoOf = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const TODAY = isoOf(new Date());
const YDAY = isoOf(new Date(Date.now() - 86400000));
/* Times are built the way the app builds them: a shop-local wall clock
   against a date, with no Z. */
const at = (dateISO, hm) => new Date(`${dateISO}T${hm}:00`).toISOString();

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const MECH = { id: "m1", name: "Dylan Barnes", email: "dylan_barnes@theallen.com" };
const SUP = { id: "m9", name: "Jason Ward", email: "jason_ward@theallen.com" };

/* The forgotten punch: in yesterday at 06:02, never out. */
const shifts = () => [{
  id: "s1", mechanic_id: MECH.id, started_at: at(YDAY, "06:02"), ended_at: null,
  note: null, lunch_minutes: 30, created_at: at(YDAY, "06:02"),
  updated_at: at(YDAY, "06:02"),
}];

const rows = {
  tw_shifts: shifts(),
  tw_mechanics: [
    { id: MECH.id, name: MECH.name, email: MECH.email, active: true, pin_set: true },
    { id: SUP.id, name: SUP.name, email: SUP.email, active: true, pin_set: true },
  ],
  tw_time_entries: [], tw_hours: [], tw_vehicles: [], tw_cost_codes: [],
  tw_parts: [], tw_pm_programs: [], tw_work_log: [], tw_timecard_approvals: [],
  tw_defects: [], tw_work_orders: [], tw_work_order_crew: [], tw_defects_open: [],
  tw_pm_due: [], tw_tire_alerts: [], tw_tires_due_out: [], tw_part_requests: [],
};

/* Stand in for the two views over tw_shifts, and for tw_timecard_days,
   the way the database maintains them — so what the screen reads back
   after a write is what a real one would hand it. */
function rebuild() {
  const hours = (s) => (s.ended_at
    ? Math.max(0, Math.round(((new Date(s.ended_at) - new Date(s.started_at)) / 60000
        - (s.lunch_minutes || 0)) / 60 * 100) / 100)
    : 0);
  const workDate = (s) => isoOf(new Date(s.started_at));
  const name = (id) => rows.tw_mechanics.find((m) => m.id === id)?.name || "";

  rows.tw_shift_days = rows.tw_shifts.map((s) => ({
    id: s.id, mechanic_id: s.mechanic_id, mechanic: name(s.mechanic_id),
    work_date: workDate(s), started_at: s.started_at, ended_at: s.ended_at,
    lunch_minutes: s.lunch_minutes, clock_hours: hours(s),
    open: s.ended_at === null, note: s.note, updated_at: s.updated_at,
  }));

  rows.tw_on_clock = rows.tw_shifts.filter((s) => s.ended_at === null).map((s) => ({
    id: s.id, mechanic_id: s.mechanic_id, mechanic: name(s.mechanic_id),
    mechanic_email: rows.tw_mechanics.find((m) => m.id === s.mechanic_id)?.email,
    started_at: s.started_at, note: s.note, started_on: workDate(s),
    stale: workDate(s) < TODAY,
  }));

  rows.tw_timecard_days = rows.tw_shift_days.map((d) => ({
    mechanic_id: d.mechanic_id, mechanic: d.mechanic, emp_no: "1041",
    work_date: d.work_date, clock_hours: d.clock_hours, booked_hours: 0,
    true_hours: d.clock_hours, difference: d.clock_hours, lines: 0,
    uncoded_lines: 0, uncoded_hours: 0, first_in: d.started_at, last_out: d.ended_at,
    still_open: d.open, approved: false, changed_since_approved: false,
    approved_by: null, approved_at: null, last_edit: d.updated_at,
  }));
}
rebuild();

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  console.log("  VITE_SUPABASE_URL=https://example.supabase.co \\");
  console.log("  VITE_SUPABASE_ANON_KEY=placeholder npm run build");
  console.log("  npx vite preview --port 4173 &");
  console.log("  node scripts/test-punchboard.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });

async function session(seed) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
  await ctx.addInitScript(seed);
  const { writes } = await fakeRest(ctx, {
    rows,
    /* The touch trigger and the two views, after every write. */
    after: (table) => {
      if (table !== "tw_shifts") return;
      for (const s of rows.tw_shifts) s.updated_at = new Date().toISOString();
      rebuild();
    },
  });
  const page = await ctx.newPage();
  const errors = [], rest400 = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => {
    if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
  });
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  return { ctx, page, writes, errors, rest400 };
}

const badge = (email) => `localStorage.setItem("tirewear:who", ${JSON.stringify(email)})`;
const unlock = (m) =>
  `sessionStorage.setItem("tirewear:timecard-unlocked", ${JSON.stringify(
    JSON.stringify({ id: m.id, name: m.name, email: m.email }))})`;
const supervisor = (m) =>
  `localStorage.setItem("tirewear:supervisor", ${JSON.stringify(
    JSON.stringify({ id: m.id, name: m.name, role: "admin", at: Date.now() }))})`;

const shiftNow = () => rows.tw_shifts.find((s) => s.id === "s1");

/* ── 1. The mechanic's own card ──────────────────────────────────── */
console.log("\n── the mechanic opens his card the next morning ──");
{
  const { ctx, page, writes, errors, rest400 } = await session(
    new Function(`${badge(MECH.email)};${unlock(MECH)}`));

  await page.getByRole("button", { name: "Timecard", exact: true }).first().click();
  await page.waitForTimeout(1500);
  let t = await page.locator("body").innerText();

  ok("no 'does not exist' banner", !/does not exist/i.test(t));
  ok("no rejected reads", rest400.length === 0, rest400.join(" "));
  /* The point of the whole banner: he is looking at TODAY, and the
     forgotten punch is on yesterday. */
  ok("today's card is what he is looking at", /hours on /i.test(t));
  ok("the forgotten punch comes and finds him", /still clocked in from/i.test(t));
  ok("it says when he punched in", /6:02|06:02/.test(t));
  ok("it does not claim to book hours", /only fixes the clock/i.test(t));

  await page.locator('input[type="time"]').first().fill("17:00");
  await page.getByRole("button", { name: /Fix it/i }).click();
  await page.waitForTimeout(1500);
  t = await page.locator("body").innerText();

  const s = shiftNow();
  ok("the punch is closed", s.ended_at !== null);
  ok("…at the time he typed, on the day he worked",
    s.ended_at === at(YDAY, "17:00"), s.ended_at);
  ok("…not at now()", s.ended_at < new Date().toISOString());
  ok("the banner is gone", !/still clocked in from/i.test(t));

  const logged = writes.filter((w) => w.table === "tw_work_log").flatMap((w) => w.body);
  ok("the correction is in the work log", logged.length === 1, `${logged.length} rows`);
  ok("…as a punch correction", logged[0]?.event_type === "shift_corrected");
  ok("…with his name on it", logged[0]?.actor_name === MECH.name, logged[0]?.actor_name);
  ok("…saying what it was before", /still on/.test(logged[0]?.summary || ""),
    logged[0]?.summary);

  console.log("page errors:", errors.length ? errors : "none");
  bad += errors.length;
  await ctx.close();
}

/* Put the forgotten punch back for the next two screens. */
rows.tw_shifts = shifts(); rebuild();

/* ── 2. The shop board ───────────────────────────────────────────── */
console.log("\n── a supervisor closes it from the board ──");
{
  const { ctx, page, writes, errors, rest400 } = await session(
    new Function(badge(SUP.email)));

  await page.waitForTimeout(1200);
  let t = await page.locator("body").innerText();
  ok("no rejected reads", rest400.length === 0, rest400.join(" "));
  ok("the stale shift is flagged on the board", /CLOSE IT/i.test(t));

  await page.getByRole("button", { name: "CLOSE IT", exact: true }).first().click();
  await page.waitForTimeout(800);
  t = await page.locator("body").innerText();
  ok("the dialog asks what time he left", /actually\s+leave/i.test(t));
  ok("…and will not save until it is told", 
    await page.getByRole("button", { name: /CLOSE THE SHIFT/i }).isDisabled());

  await page.locator('input[type="time"]').first().fill("17:00");
  await page.waitForTimeout(400);
  t = await page.locator("body").innerText();
  /* 06:02 to 17:00 less a 30 minute lunch. The dialog has to show the
     number before it writes it — that is the whole difference from the
     button that silently booked twenty-six hours. */
  ok("it shows what that works out to first", /10\.47 hr/.test(t));
  ok("the button says what it will do", /CLOSE IT AT 17:00/i.test(t));

  await page.getByRole("button", { name: /CLOSE IT AT/i }).click();
  await page.waitForTimeout(1500);

  const s = shiftNow();
  ok("the punch is closed at the typed time",
    s.ended_at === at(YDAY, "17:00"), s.ended_at);
  ok("…and not at now()", Math.abs(new Date(s.ended_at) - Date.now()) > 3600000);
  ok("the lunch went in with it", s.lunch_minutes === 30);

  const logged = writes.filter((w) => w.table === "tw_work_log").flatMap((w) => w.body);
  ok("it is in the work log with the supervisor's name",
    logged[0]?.actor_name === SUP.email, logged[0]?.actor_name);

  t = await page.locator("body").innerText();
  ok("he is off the board", !/CLOSE IT/i.test(t));

  console.log("page errors:", errors.length ? errors : "none");
  bad += errors.length;
  await ctx.close();
}

rows.tw_shifts = shifts(); rebuild();

/* ── 3. The supervisor's card dialog ─────────────────────────────── */
console.log("\n── a supervisor fixes it on the timecard ──");
{
  const { ctx, page, writes, errors, rest400 } = await session(
    new Function(`${badge(SUP.email)};${supervisor(SUP)}`));

  await page.getByRole("button", { name: "Supervisor", exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Timecards", exact: true }).first().click();
  await page.waitForTimeout(1500);
  let t = await page.locator("body").innerText();
  ok("no rejected reads", rest400.length === 0, rest400.join(" "));
  ok("the card is in the list", /Dylan Barnes/.test(t));

  await page.getByRole("button", { name: "Open", exact: true }).first().click();
  await page.waitForTimeout(1200);
  t = await page.locator("body").innerText();
  ok("the dialog opens on the punches", /Punches/i.test(t));
  ok("it says the punch is still running", /still on the clock/i.test(t));
  ok("it says the change carries his name", /with your name on them/i.test(t));

  /* The clock-out box, blank because there is no clock-out. */
  const outs = page.locator('input[type="time"]');
  await outs.nth(1).fill("17:00");
  await outs.nth(1).blur();
  await page.waitForTimeout(1600);

  const s = shiftNow();
  ok("the punch is closed at the typed time",
    s.ended_at === at(YDAY, "17:00"), s.ended_at);

  t = await page.locator("body").innerText();
  ok("the hours land on the dialog", /10\.47/.test(t));
  ok("it no longer reads as still on", !/still on the clock/i.test(t));

  const logged = writes.filter((w) => w.table === "tw_work_log").flatMap((w) => w.body);
  ok("it is in the work log with the supervisor's name",
    logged[0]?.actor_name === SUP.name, logged[0]?.actor_name);

  /* And the correction the cap is there to catch. */
  await outs.nth(1).fill("05:00");
  await outs.nth(1).blur();
  await page.waitForTimeout(1400);
  t = await page.locator("body").innerText();
  ok("a rolled-over typo is refused, in a sentence",
    /2\d\.\d hours on the clock\. Check the times/.test(t),
    (t.match(/.{0,60}hours on the clock.{0,60}/) || ["no such line"])[0]);
  ok("…and the good punch is left alone",
    shiftNow().ended_at === at(YDAY, "17:00"), shiftNow().ended_at);

  console.log("page errors:", errors.length ? errors : "none");
  bad += errors.length;
  await ctx.close();
}

await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
