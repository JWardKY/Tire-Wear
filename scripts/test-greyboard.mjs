/* A grey Save button that says why, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-cardready.mjs holds the rule. This holds the part only
   a browser shows, and it is the part that actually cost a day.

   Donald Bradley's Monday: Save timecard grey, and the sentence
   explaining it sat inside the button row behind a margin-auto. On a
   zoomed-in tablet that put it off the left edge of the screen. The
   button he was looking at was on the right; the reason was on a part
   of the page he could not see. As far as he could tell the app had
   simply stopped.

   So the test is not "is there a message" — there was one. It is: if
   you can see the button, can you see why it will not go. Everything
   below scrolls the Save button into view first and then asks what
   else is on the screen, because that is what a thumb does.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-greyboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const MECH = { id: "m1", name: "Donald Bradley", email: "donald_bradley@theallen.com" };

const vehicles = [["DT-898", "Peterbilt"], ["DT-881", "Kenworth"]].map(([number, make], i) => ({
  id: `v${i}`, number, make, model: "T880", model_year: 2023, division: "DT",
  axle_config: "dump12", motive_vehicle_id: null, active: true, notes: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
}));

const rows = {
  tw_vehicles: vehicles,
  tw_mechanics: [{ id: MECH.id, name: MECH.name, email: MECH.email, active: true, pin_set: true }],
  tw_cost_codes: [
    { code: "880", name: "Repair", active: true, group: "Labour", code_group: "Labour" },
    { code: "SHOP-CF", name: "Clays Ferry Shop", active: true, group: "Shop", code_group: "Shop" },
  ],
  tw_shifts: [], tw_shift_days: [], tw_on_clock: [], tw_timecard_days: [],
  tw_time_entries: [], tw_hours: [], tw_parts: [], tw_pm_programs: [],
  tw_work_log: [], tw_timecard_approvals: [], tw_defects: [], tw_work_orders: [],
  tw_work_order_crew: [], tw_defects_open: [], tw_pm_due: [], tw_tire_alerts: [],
  tw_tires_due_out: [], tw_part_requests: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
/* Narrow, because the message went off the side of the screen and a
   wide desktop window is exactly where that does not show. */
const ctx = await browser.newContext({
  viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: false,
});
await ctx.addInitScript(new Function(
  `localStorage.setItem("tirewear:who", ${JSON.stringify(MECH.email)});`
  + `sessionStorage.setItem("tirewear:timecard-unlocked", ${JSON.stringify(
      JSON.stringify({ id: MECH.id, name: MECH.name, email: MECH.email }))});`
));
await fakeRest(ctx, { rows });

const page = await ctx.newPage();
const crashes = [];
page.on("pageerror", (e) => crashes.push(String(e)));

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Timecard", exact: true }).first().click();
await page.waitForTimeout(2000);

const saveBtn = page.getByRole("button", { name: /Save timecard/i }).first();
ok("the timecard opens with a Save button", (await saveBtn.count()) > 0);

/* ── a half-filled card ───────────────────────────────────────── */
console.log("\n── a card with a truck on it and nothing else ──");
const box = page.getByLabel("Equipment").first();
await box.click();
await box.fill("898");
await page.waitForTimeout(400);
await box.press("Enter");
await page.waitForTimeout(600);

ok("Save is grey", await saveBtn.isDisabled());

/* The whole bug, in one assertion: put the button on the screen the
   way a thumb does, then ask whether the reason came with it. */
await saveBtn.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);

const note = page.locator("text=/Not saved yet/i").first();
ok("…and something on screen says so", (await note.count()) > 0);

const vp = page.viewportSize();
const nb = await note.boundingBox();
const sb = await saveBtn.boundingBox();
ok("the reason is on the screen, not off the side of it",
   nb && nb.x >= 0 && nb.x + nb.width <= vp.width + 1,
   nb ? `x ${Math.round(nb.x)}..${Math.round(nb.x + nb.width)} of ${vp.width}` : "no box");
ok("…and vertically in view with the button",
   nb && nb.y >= 0 && nb.y + nb.height <= vp.height,
   nb ? `y ${Math.round(nb.y)}..${Math.round(nb.y + nb.height)} of ${vp.height}` : "no box");
/* Far enough up the page and it is a different part of the form as far
   as anybody reading it is concerned. */
ok("…and near the button, not a screen away",
   nb && sb && Math.abs(sb.y - nb.y) < 240,
   nb && sb ? `${Math.round(Math.abs(sb.y - nb.y))}px apart` : "no box");

let t = await page.locator("body").innerText();
ok("it names the truck rather than 'one card'",
   /DT-898/.test(t) && /cost code/i.test(t),
   (t.match(/Not saved yet[^\n]*/) || [""])[0]);

/* ── it keeps up as the card is filled in ─────────────────────── */
console.log("\n── and it moves on as each thing is answered ──");
await page.getByLabel("Charge the time to").first().selectOption("880");
await page.waitForTimeout(400);
t = await page.locator("body").innerText();
ok("cost code answered — it asks for the hours next",
   /hours/i.test((t.match(/Not saved yet[^\n]*/) || [""])[0]),
   (t.match(/Not saved yet[^\n]*/) || [""])[0]);
ok("…and Save is still grey", await saveBtn.isDisabled());

/* The figure that lost Monday. A number box takes a minus sign, and
   this used to fail the rule while matching no sentence — grey, and
   silent. */
console.log("\n── the minus figure that went by in silence ──");
const hrs = page.getByLabel("Hours on this unit").first();
await hrs.fill("-3");
await page.waitForTimeout(400);
t = await page.locator("body").innerText();
ok("a minus figure is refused", await saveBtn.isDisabled());
ok("…and says what it is, rather than nothing at all",
   /minus/i.test((t.match(/Not saved yet[^\n]*/) || [""])[0]),
   (t.match(/Not saved yet[^\n]*/) || [""])[0]);

await hrs.fill("2.5");
await page.waitForTimeout(400);
t = await page.locator("body").innerText();
ok("a real figure clears it", !/Not saved yet/i.test(t),
   (t.match(/Not saved yet[^\n]*/) || [""])[0]);
ok("…and Save goes live", await saveBtn.isEnabled());

/* ── one bad card among good ones ─────────────────────────────── */
console.log("\n── the case that makes eight cards a guessing game ──");
await page.getByRole("button", { name: /Add another unit/i }).first().click();
await page.waitForTimeout(400);
const box2 = page.getByLabel("Equipment").nth(1);
await box2.click();
await box2.fill("881");
await page.waitForTimeout(400);
await box2.press("Enter");
await page.waitForTimeout(600);

ok("one unfinished card holds up the finished one", await saveBtn.isDisabled());
t = await page.locator("body").innerText();
ok("…and it is the unfinished one that gets named",
   /DT-881/.test((t.match(/Not saved yet[^\n]*/) || [""])[0]),
   (t.match(/Not saved yet[^\n]*/) || [""])[0]);

/* The card itself is marked, so the sentence and the card are the same
   thing found twice rather than a number to count out on a screen. */
const outlined = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("#equipment-worked > div")]
    .filter((d) => /Time on this/i.test(d.innerText || ""));
  return cards.map((d) => getComputedStyle(d).boxShadow !== "none");
});
ok("…and that card is the one outlined on screen",
   outlined.filter(Boolean).length === 1 && outlined[outlined.length - 1] === true,
   JSON.stringify(outlined));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
