/* Correcting a tire that is already on a truck, in a real browser.
   ─────────────────────────────────────────────────────────────────
   Everything about a tire was decided at the moment somebody mounted
   it, and there is no delete — so a typo was permanent. "Michelin vdn2"
   stayed that way, and a tire keyed to the wrong wheel stayed on the
   wrong wheel for the life of the casing.

   Two things here are worth more than the form working. The mount
   odometer and mount tread are the first point the wear is measured
   from, so the screen has to say that before somebody changes them.
   And two tires cannot share a wheel — the database says so in
   Postgres, and this has to say it in English.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-tireedit.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const V = "v865";
const tire = (id, pos, brand, model, extra = {}) => ({
  id, vehicle_id: V, position: pos, brand, model, size: "11R24.5",
  tire_type: "virgin", wheel_material: "aluminum", casing_id: null,
  mounted_date: "2026-09-14", mounted_odometer: 359086, mounted_depth: 28,
  cost: 480, removed_date: null, removed_odometer: null, removed_reason: null,
  notes: null, created_by: null, created_at: "2026-09-14", ...extra,
});

const rows = {
  tw_vehicles: [{ id: V, number: "DT-865", make: "Kenworth", model: "T880",
    model_year: 2022, division: "DT", axle_config: "dump12",
    motive_vehicle_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  /* The tire from the screenshot, plus the wheel beside it so a move
     onto an occupied wheel can be tried. 4RI is free. */
  tw_tires: [tire("t1", "4RO", "Michelin", "vdn2"), tire("t2", "4LO", "Continental", null)],
  tw_tread_readings: [], tw_tire_wear: [], tw_odometer_log: [],
  tw_tire_brands: [
    { id: "b1", name: "Continental", sort_order: 1, active: true },
    { id: "b2", name: "Michelin", sort_order: 2, active: true },
  ],
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
  console.log("  VITE_SUPABASE_URL=https://example.supabase.co \\");
  console.log("  VITE_SUPABASE_ANON_KEY=placeholder npm run build");
  console.log("  npx vite preview --port 4173 &");
  console.log("  node scripts/test-tireedit.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));

/* Two tires cannot sit on one wheel. The real database has a unique
   index saying so; the fake has to refuse it too, or the message this
   screen exists to show can never be reached. */
const { writes } = await fakeRest(ctx, { rows });

/* The unique index, which the fake does not model. Registered after
   fakeRest so it is matched first, and falls through to it when there
   is no clash. Without this the message this screen exists to show
   could never be reached in a test. */
await ctx.route("**/rest/v1/tw_tires*", async (route) => {
  const req = route.request();
  if (req.method() !== "PATCH") return route.fallback();
  const body = JSON.parse(req.postData() || "{}");
  const id = new URL(req.url()).searchParams.get("id")?.replace("eq.", "");
  const clash = rows.tw_tires.some((t) =>
    t.id !== id && t.vehicle_id === V && t.position === body.position && !t.removed_date);
  if (!clash) return route.fallback();
  return route.fulfill({ status: 409, headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "23505",
      message: 'duplicate key value violates unique constraint "tw_one_active_tire_per_position"' }) });
});

const page = await ctx.newPage();
const errors = [], rest400 = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Tires", exact: true }).first().click();
await page.waitForTimeout(1800);
await page.getByText("DT-865").first().click();
await page.waitForTimeout(1400);

console.log("── opening the tire ──");
let t = await page.locator("body").innerText();
ok("no 'does not exist' banner", !/does not exist/i.test(t));
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));

await page.getByRole("button", { name: "4RO", exact: true }).first().click();
await page.waitForTimeout(900);
t = await page.locator("body").innerText();
ok("the tire dialog opens", /Michelin vdn2/.test(t));
ok("it offers to edit the details", /Edit these details/i.test(t));

console.log("\n── the form ──");
await page.getByRole("button", { name: /Edit these details/i }).click();
await page.waitForTimeout(700);
/* Everything below is scoped to the dialog. The truck screen behind it
   has its own selects and number boxes, and an unscoped locator picks
   whichever comes first in the DOM — which is not the one on screen. */
const form = page.locator('div[style*="position: fixed"]').last();
t = await page.locator("body").innerText();
ok("the form opens on this tire", /Edit 4RO · Michelin/.test(t));
ok("it says what it is for", /correcting what was entered when it went on/i.test(t));
ok("the mount figures are here", /When it went on/i.test(t));
ok("it points at Pull for taking the tire off", /Pull this tire off/i.test(t));

/* The brand has to come back selected, not reset to the top of the
   list — a form that quietly changes a field nobody touched is worse
   than one that cannot edit it. */
const posSel = form.locator("select").first();
const brandSel = form.locator("select").nth(1);
ok("the brand comes back selected",
  (await brandSel.inputValue()) === "Michelin", await brandSel.inputValue());
ok("the position comes back on its own wheel",
  (await posSel.inputValue()) === "4RO", await posSel.inputValue());

console.log("\n── fixing the model ──");
const model = form.locator('input[placeholder="M726, XDN2…"]').first();
ok("the model is in the box", (await model.inputValue()) === "vdn2");
await model.fill("XDN2");
await page.getByRole("button", { name: /Save changes/i }).click();
await page.waitForTimeout(1600);

const patched = writes.filter((w) => w.table === "tw_tires" && w.method === "PATCH");
ok("one tire was written", patched.length === 1, `${patched.length}`);
ok("…with the corrected model", patched[0]?.body?.model === "XDN2", JSON.stringify(patched[0]?.body));
ok("…and nothing else changed", patched[0]?.body?.brand === "Michelin"
  && patched[0]?.body?.position === "4RO"
  && Number(patched[0]?.body?.mounted_odometer) === 359086,
  JSON.stringify(patched[0]?.body));
t = await page.locator("body").innerText();
ok("the dialog closed", !/Edit 4RO/.test(t));
ok("the diagram shows the new model", /XDN2/.test(t));
ok("…and not the old one", !/vdn2/.test(t));

/* A tire going on or coming off is derivable from tw_tires and shows
   in the history on its own. What it USED to say is not derivable from
   anything once the row is overwritten. */
console.log("\n── and the correction is written down ──");
const logged = writes.filter((w) => w.table === "tw_work_log").flatMap((w) => w.body);
ok("one line in the work log", logged.length === 1, `${logged.length}`);
ok("…as a tire correction", logged[0]?.event_type === "tire_edited");
ok("…with a name on it", logged[0]?.actor_name === "jason_ward@theallen.com",
  logged[0]?.actor_name);
ok("…saying what it was and what it is",
  /model vdn2 → XDN2/.test(logged[0]?.summary || ""), logged[0]?.summary);
ok("…and which wheel on which truck",
  /DT-865 4RO/.test(logged[0]?.summary || ""), logged[0]?.summary);
ok("…with the truck on the row itself", logged[0]?.unit_number === "DT-865");

console.log("\n── the warning on the mount figures ──");
await page.getByRole("button", { name: "4RO", exact: true }).first().click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /Edit these details/i }).click();
await page.waitForTimeout(600);
const form2 = page.locator('div[style*="position: fixed"]').last();
t = await form2.innerText();
ok("nothing is said until something is changed", !/changes the wear rate/i.test(t));

/* Cost, then the mount odometer, then the mount tread. */
const odo = form2.locator('input[type="number"]').nth(1);
await odo.fill("360000");
await page.waitForTimeout(500);
t = await form2.innerText();
ok("changing the mount odometer says what it costs", /changes the wear rate/i.test(t));

/* A number the column cannot hold is caught in the form, not by the
   database after the fact. */
await odo.fill("99999999");
await page.waitForTimeout(400);
t = await form2.innerText();
ok("an impossible odometer is refused in the form",
  /mount odometer cannot be more than/i.test(t), t.slice(-200));
ok("…and Save is off", await page.getByRole("button", { name: /Save changes/i }).isDisabled());
await odo.fill("359086");
await page.waitForTimeout(400);

/* Put back what it was and save: nothing moved, so nothing is logged.
   A log line per press is a log nobody reads. */
const before = writes.filter((w) => w.table === "tw_work_log").length;
await page.getByRole("button", { name: /Save changes/i }).click();
await page.waitForTimeout(1500);
ok("a save that changed nothing writes no log line",
  writes.filter((w) => w.table === "tw_work_log").length === before);
await page.getByRole("button", { name: "4RO", exact: true }).first().click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /Edit these details/i }).click();
await page.waitForTimeout(600);

console.log("\n── moving it to another wheel ──");
const form3 = page.locator('div[style*="position: fixed"]').last();
const pos2 = form3.locator("select").first();
const options = await pos2.locator("option").allInnerTexts();
ok("only free wheels and its own are offered",
  options.every((o) => /where it is|empty/.test(o)), options.join(" | "));
ok("…and the one that is taken is not",
  !options.some((o) => /^4LO/.test(o)), options.join(" | "));

await pos2.selectOption("4RI");
await page.waitForTimeout(500);
t = await form3.innerText();
ok("moving a wheel says what it means", /takes its readings with it/i.test(t));
/* This form says the tire was ALWAYS on the new wheel. A rotation says
   it was on the old one until today, and lives on its own button — so
   this has to send somebody there rather than let them record a
   rotation as a typo. */
ok("…and that it is for a position keyed wrong",
   /only for a position keyed wrong/i.test(t), t.slice(0, 400));
ok("…and points at the button that does a real move",
   /Move to another wheel/i.test(t), t.slice(0, 400));

/* Somebody on another tablet mounts a tire on 4RI while this form is
   open. The dropdown cannot guard against that; the unique index can,
   and what comes back has to be a sentence rather than Postgres. */
console.log("\n── and somebody takes that wheel first ──");
rows.tw_tires.push(tire("t9", "4RI", "Goodyear", null));

await page.getByRole("button", { name: /Save changes/i }).click();
await page.waitForTimeout(1600);

/* Checked before reading it, so a form that closed on the error is a
   named failure rather than a locator timing out. Closing here loses
   everything typed and leaves the reason in a banner at the top of a
   page nobody is looking at. */
const stillOpen = await page.locator('div[style*="position: fixed"]').count();
ok("the form stays open so the change is not lost", stillOpen > 0);
t = stillOpen ? await form3.innerText() : await page.locator("body").innerText();
ok("it says so in English", /There is already a tire on 4RI/.test(t), t.slice(-220));
ok("…and not in Postgres", !/duplicate key|unique constraint/i.test(t));
ok("the tire did not move", 
  rows.tw_tires.find((x) => x.id === "t1")?.position === "4RO",
  rows.tw_tires.find((x) => x.id === "t1")?.position);

console.log("\n── once the wheel is free again ──");
rows.tw_tires = rows.tw_tires.filter((x) => x.id !== "t9");
await page.getByRole("button", { name: /Save changes/i }).click();
await page.waitForTimeout(1600);
t = await page.locator("body").innerText();
ok("the move saved", !/Edit 4RO/.test(t));
ok("the tire is on its new wheel",
  rows.tw_tires.find((x) => x.id === "t1")?.position === "4RI",
  rows.tw_tires.find((x) => x.id === "t1")?.position);

console.log("\npage errors:", errors.length ? errors : "none");
bad += errors.length;
await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
