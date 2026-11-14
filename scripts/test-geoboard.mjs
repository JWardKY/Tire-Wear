/* Where a punch happened, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-geo.mjs holds the rules. This presses the actual Clock in
   and Clock out buttons with the browser's location granted, and again
   with it refused, and checks what reached the database — because the
   one way this feature can do harm is by standing between a mechanic
   and the clock.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-geoboard.mjs
*/
const { chromium } = await import("playwright-core");
const { fakeRest, CHROME } = await import("./_fakerest.mjs");

const URL_ = process.env.APP_URL || "http://localhost:4173/";
const isoOf = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const TODAY = isoOf(new Date());

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const MECH = { id: "m1", name: "Dylan Barnes", email: "dylan_barnes@theallen.com" };
const YARD = { latitude: 38.040612, longitude: -84.503712 };

const rows = {
  tw_shifts: [],
  tw_mechanics: [{ id: MECH.id, name: MECH.name, email: MECH.email, active: true, pin_set: true }],
  tw_time_entries: [], tw_hours: [], tw_vehicles: [], tw_cost_codes: [],
  tw_parts: [], tw_pm_programs: [], tw_work_log: [], tw_timecard_approvals: [],
  tw_defects: [], tw_work_orders: [], tw_work_order_crew: [], tw_defects_open: [],
  tw_pm_due: [], tw_tire_alerts: [], tw_tires_due_out: [], tw_part_requests: [],
};

const GEO = ["in_lat", "in_lng", "in_accuracy_m", "in_geo_note",
             "out_lat", "out_lng", "out_accuracy_m", "out_geo_note"];
function rebuild() {
  let n = 0;
  for (const s of rows.tw_shifts) {
    s.id ||= `s${++n}`;
    s.started_at ||= new Date(Date.now() - 3600000).toISOString();
    s.ended_at ??= null;
    s.lunch_minutes ??= 30;
    s.updated_at = new Date().toISOString();
  }
  const pick = (s, ks) => Object.fromEntries(ks.map((k) => [k, s[k] ?? null]));
  rows.tw_shift_days = rows.tw_shifts.map((s) => ({
    id: s.id, mechanic_id: s.mechanic_id, mechanic: MECH.name, work_date: TODAY,
    started_at: s.started_at, ended_at: s.ended_at, lunch_minutes: s.lunch_minutes,
    clock_hours: s.ended_at ? 0.5 : 0, open: s.ended_at === null, note: s.note ?? null,
    updated_at: s.updated_at, ...pick(s, GEO),
  }));
  rows.tw_on_clock = rows.tw_shifts.filter((s) => s.ended_at === null).map((s) => ({
    id: s.id, mechanic_id: s.mechanic_id, mechanic: MECH.name, mechanic_email: MECH.email,
    started_at: s.started_at, note: null, started_on: TODAY, stale: false,
    ...pick(s, GEO.slice(0, 4)),
  }));
  rows.tw_timecard_days = [];
}
rebuild();

/* tw_punch_out, the way the database does it. */
const rpc = {
  tw_punch_out: (b) => {
    const s = rows.tw_shifts.find((x) => x.mechanic_id === b.p_mechanic && x.ended_at === null);
    if (!s) return { ok: false, error: "Not on the clock." };
    Object.assign(s, { ended_at: new Date().toISOString(),
      out_lat: b.p_lat ?? null, out_lng: b.p_lng ?? null,
      out_accuracy_m: b.p_accuracy_m ?? null, out_geo_note: b.p_geo_note ?? null });
    rebuild();
    return { ok: true, id: s.id };
  },
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });

async function session(grant) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 },
    permissions: grant ? ["geolocation"] : [],
    geolocation: { ...YARD, accuracy: 14 } });
  if (!grant) {
    /* Refused, the way a phone refuses: the error callback, code 1. */
    await ctx.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_, no) =>
        setTimeout(() => no({ code: 1, message: "User denied Geolocation" }), 20);
    });
  }
  await ctx.addInitScript(new Function(
    `localStorage.setItem("tirewear:who", ${JSON.stringify(MECH.email)});` +
    `sessionStorage.setItem("tirewear:timecard-unlocked", ${JSON.stringify(
      JSON.stringify({ id: MECH.id, name: MECH.name, email: MECH.email }))})`));
  const { writes } = await fakeRest(ctx, { rows, rpc,
    after: (t) => { if (t === "tw_shifts") rebuild(); } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Timecard", exact: true }).first().click();
  await page.waitForTimeout(1200);
  return { ctx, page, writes, errors };
}

console.log("\n── location granted ──");
{
  const { ctx, page, writes, errors } = await session(true);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  await page.waitForTimeout(1500);
  const ins = writes.find((w) => w.table === "tw_shifts" && w.method === "POST");
  const body = [].concat(ins?.body || [])[0] || {};
  ok("clocked in", rows.tw_shifts.length === 1);
  ok("…with where", body.in_lat === YARD.latitude && body.in_lng === YARD.longitude,
    JSON.stringify(body));
  ok("…and how sure", body.in_accuracy_m === 14, body.in_accuracy_m);
  let t = await page.locator("body").innerText();
  ok("his card shows the pin", /In:\s*📍\s*Map/.test(t));

  await page.getByRole("button", { name: "Clock out", exact: true }).click();
  await page.waitForTimeout(1500);
  const out = writes.find((w) => w.rpc === "tw_punch_out");
  ok("clocked out with where", out?.body?.p_lat === YARD.latitude
    && out?.body?.p_lng === YARD.longitude, JSON.stringify(out?.body));
  t = await page.locator("body").innerText();
  ok("both pins on his card", /In:\s*📍\s*Map[\s\S]*Out:\s*📍\s*Map/.test(t));
  const href = await page.locator('a[href*="google.com/maps"]').first().getAttribute("href");
  ok("the pin opens a map at the spot", href?.includes("38.040612,-84.503712"), href);
  console.log("page errors:", errors.length ? errors : "none");
  bad += errors.length;
  await ctx.close();
}

rows.tw_shifts = []; rebuild();

console.log("\n── location refused ──");
{
  const { ctx, page, writes, errors } = await session(false);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  await page.waitForTimeout(1500);
  const ins = writes.find((w) => w.table === "tw_shifts" && w.method === "POST");
  const body = [].concat(ins?.body || [])[0] || {};
  ok("still clocked in", rows.tw_shifts.length === 1);
  ok("…with no pin", body.in_lat == null);
  ok("…saying why", body.in_geo_note === "denied", body.in_geo_note);
  const t = await page.locator("body").innerText();
  ok("his card says so", /location refused/.test(t));

  await page.getByRole("button", { name: "Clock out", exact: true }).click();
  await page.waitForTimeout(1500);
  ok("still clocked out", rows.tw_shifts[0].ended_at !== null);
  ok("…saying why", rows.tw_shifts[0].out_geo_note === "denied");
  console.log("page errors:", errors.length ? errors : "none");
  bad += errors.length;
  await ctx.close();
}

await browser.close();
console.log(bad ? `\n${bad} FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
