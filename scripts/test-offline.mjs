/* The save that never reached the server, in a real browser.
   ─────────────────────────────────────────────────────────────────
   Alex mounted two tires on DT-874 at twenty to one on a Tuesday
   morning, pressed save on the third, and the screen said

       That did not save — TypeError: Load failed

   Both halves were wrong. "TypeError: Load failed" is Safari's wording
   for a fetch that never completed, and the server log for that minute
   holds no request at all — his iPad lost its signal mid-save. So the
   banner named a Javascript type at a mechanic, and it blamed a save
   that never left the building.

   scripts/test-dberror.mjs holds the rule about which errors count as
   that and what the words should be. This holds the part that only a
   browser can show: that the screen he was standing in front of
   actually reaches the rule, on the write path AND on the read path,
   and on the modal that has a banner of its own.

   Playwright's route.abort() kills the request the same way a dropped
   connection does, which is the only honest way to produce this.
   Chromium words it "Failed to fetch" where Safari says "Load failed";
   the rule covers both, and neither may reach the screen.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-offline.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

/* The words that must never reach a shop tablet again. */
const JARGON = /TypeError|Failed to fetch|Load failed|NetworkError|undefined/i;

const V = "v874";
const tire = (id, pos, brand, model) => ({
  id, vehicle_id: V, position: pos, brand, model, size: "11R22.5",
  tire_type: "virgin", wheel_material: "aluminum", casing_id: null,
  mounted_date: "2026-09-22", mounted_odometer: 120500, mounted_depth: 28,
  cost: 480, removed_date: null, removed_odometer: null, removed_reason: null,
  notes: null, created_by: "alexander_oswald@theallen.com", created_at: "2026-09-22",
});

/* DT-874 exactly as it stood when he hit it: the steer axle done, the
   drive axle still bare. 2R is the wheel the failed save was for. */
const rows = {
  tw_vehicles: [{ id: V, number: "DT-874", make: "Kenworth", model: "T880",
    model_year: 2023, division: "DT", axle_config: "dump12",
    motive_vehicle_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  tw_tires: [tire("t1", "1R", "Continental", "HAC3"), tire("t2", "1L", "Continental", "HAC3")],
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
  console.log("  node scripts/test-offline.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "alexander_oswald@theallen.com"));

const { writes } = await fakeRest(ctx, { rows });

/* The dropped connection. Off until the screen is loaded, so the page
   comes up the way his did — the signal went while he was standing
   there, not before he started. */
let dead = false;
await ctx.route("**/rest/v1/**", (route) =>
  dead ? route.abort("internetdisconnected") : route.fallback());

const page = await ctx.newPage();
const crashes = [];
page.on("pageerror", (e) => crashes.push(String(e)));

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Tires", exact: true }).first().click();
await page.waitForTimeout(1800);
await page.getByText("DT-874").first().click();
await page.waitForTimeout(1400);

let t = await page.locator("body").innerText();
ok("the truck opens on a good connection", /DT-874/.test(t));
ok("…with the two tires he had already got on", /HAC3/.test(t));

/* ── 1. the save he was actually making ───────────────────────── */
console.log("\n── mounting a tire when the signal drops ──");
await page.getByRole("button", { name: "Mount a tire" }).first().click();
await page.waitForTimeout(700);
const form = page.locator('div[style*="position: fixed"]').last();
t = await form.innerText();
ok("the mount form opens", /Mount a tire at/i.test(t), t.slice(0, 80));

await form.locator("select").first().selectOption("Michelin");
await form.locator('input[placeholder="M726, XDN2…"]').first().fill("X coach");
/* Tread and the mount odometer, which is what the button waits on. */
await form.locator('input[type="number"]').nth(0).fill("28");
await form.locator('input[type="number"]').nth(1).fill("120500");
await page.waitForTimeout(400);
ok("the form is ready to save",
   !(await page.getByRole("button", { name: /^Mount tire$/i }).isDisabled()));

dead = true;                       // the iPad loses its signal here
await page.getByRole("button", { name: /^Mount tire$/i }).click();
await page.waitForTimeout(2500);

t = await page.locator("body").innerText();
ok("the write was attempted", writes.some((w) => w.table === "tw_tires" && w.method === "POST")
   || /reach the server/i.test(t), `writes: ${writes.length}`);
ok("the banner says the message never got there", /did not reach the server/i.test(t),
   (t.match(/.{0,90}(did not|could not|Load failed|TypeError).{0,90}/i) || ["(no banner)"])[0]);
ok("…and says what to do about it", /check your signal/i.test(t));
ok("…and tells him how to see whether it went through", /reload/i.test(t));
ok("…and says none of this", !JARGON.test(t),
   (t.match(/.{0,80}(TypeError|Load failed|Failed to fetch|undefined).{0,80}/i) || [""])[0]);
ok("nothing crashed", crashes.length === 0, crashes.join("\n    "));

/* ── 2. the same thing on the modal with its own banner ───────── */
console.log("\n── correcting a tire when the signal is gone ──");
dead = false;
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Tires", exact: true }).first().click();
await page.waitForTimeout(1800);
await page.getByText("DT-874").first().click();
await page.waitForTimeout(1400);
await page.getByRole("button", { name: "1R", exact: true }).first().click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /Edit these details/i }).click();
await page.waitForTimeout(700);
const form2 = page.locator('div[style*="position: fixed"]').last();
await form2.locator('input[placeholder="M726, XDN2…"]').first().fill("HAC3+");
dead = true;
await page.getByRole("button", { name: /Save changes/i }).click();
await page.waitForTimeout(2500);

t = await page.locator("body").innerText();
ok("the edit form is still open, with the typing in it", /Edit 1R/i.test(t), t.slice(0, 120));
ok("its banner says the same thing", /did not reach the server/i.test(t),
   (t.match(/.{0,90}(did not|could not|Load failed|TypeError).{0,90}/i) || ["(no banner)"])[0]);
ok("…and not 'There is already a tire on'", !/already a tire on/i.test(t));
ok("…and none of this", !JARGON.test(t),
   (t.match(/.{0,80}(TypeError|Load failed|Failed to fetch|undefined).{0,80}/i) || [""])[0]);

/* ── 3. the read path, which says something different ─────────── */
console.log("\n── opening the screen with no signal at all ──");
dead = true;
await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Tires", exact: true }).first().click();

/* A read is safe to repeat, so the client retries it for several
   seconds before giving up; a mount is not, so it fails at once. That
   is the right way round, and it is why this waits and the two above
   did not. Poll rather than guess at the number. */
let waited = 0;
while (waited < 24000) {
  await page.waitForTimeout(1000);
  waited += 1000;
  if (!/Loading the fleet/i.test(await page.locator("body").innerText())) break;
}
ok("it gives up in the end rather than spinning for ever", waited < 24000, `${waited}ms`);

t = await page.locator("body").innerText();
ok("it says the server could not be reached", /could not reach the server/i.test(t),
   (t.match(/.{0,90}(could not|Could not|Load failed|TypeError).{0,90}/) || ["(no banner)"])[0]);
ok("…and says what to do about it", /check your signal/i.test(t));
/* Reloading is exactly what just failed, so it must not say to. */
ok("…and does not tell him to reload the page", !/reload the page/i.test(t));
ok("…and does not claim a save went wrong", !/did not save|did not reach/i.test(t));
ok("…and says none of this", !JARGON.test(t),
   (t.match(/.{0,80}(TypeError|Load failed|Failed to fetch|undefined).{0,80}/i) || [""])[0]);
ok("still nothing crashed", crashes.length === 0, crashes.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
