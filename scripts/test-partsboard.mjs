/* Changing how many came off the shelf, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-partqty.mjs holds the rules. This holds the part that
   only a thumb finds.

   The quantity box would not let go of the number in it: it was
   value={qty} with onChange forcing the result back to at least 1, so
   clearing it gave "" → 0 → 1 before the screen repainted. Jason's
   workaround, for three batteries, was to type the new figure in FRONT
   of the old one and then pick the old one out with the caret — "31",
   then delete the 1. On a phone.

   Two things are checked here that the rules alone cannot be: that the
   box can actually be emptied and stays empty while it is being typed
   in, and that tapping it selects what is there so the next digit
   replaces the quantity rather than landing beside it.

   And the second bug in the same control: a part nobody has
   catalogued has no id, so two typed parts were both null — one
   quantity change hit both, and one Remove removed both.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-partsboard.mjs
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
  tw_parts: [{ id: "p1", part_number: "5747-31S950", name: "Battery",
    unit_cost: 189.5, uom: "each", on_hand: 12, active: true }],
  /* The picker reads the reorder view, not the table. */
  tw_parts_reorder: [{ id: "p1", part_number: "5747-31S950", name: "Battery",
    shop: "Clays Ferry Shop", category: "Electrical", uom: "each",
    on_hand: 12, allocated: 0, on_order: 0, available: 12,
    min_qty: 2, max_qty: 10, bin: "A1", unit_cost: 189.5, tags: "",
    active: true }],
  tw_shifts: [], tw_shift_days: [], tw_on_clock: [], tw_timecard_days: [],
  tw_time_entries: [], tw_hours: [], tw_pm_programs: [],
  tw_work_log: [], tw_timecard_approvals: [], tw_defects: [], tw_work_orders: [],
  tw_work_order_crew: [], tw_defects_open: [], tw_pm_due: [], tw_tire_alerts: [],
  tw_tires_due_out: [], tw_part_requests: [], tw_time_entry_parts: [], tw_part_txns: [], tw_vendors: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
/* A tablet on the fender, which is where this is used. */
const ctx = await browser.newContext({
  viewport: { width: 820, height: 1180 }, hasTouch: true,
});
await ctx.addInitScript(new Function(
  `localStorage.setItem("tirewear:who", ${JSON.stringify(MECH.email)});`
  + `sessionStorage.setItem("tirewear:timecard-unlocked", ${JSON.stringify(
      JSON.stringify({ id: MECH.id, name: MECH.name, email: MECH.email }))});`
));
const { writes } = await fakeRest(ctx, { rows });

const page = await ctx.newPage();
const crashes = [];
page.on("pageerror", (e) => crashes.push(String(e)));

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Timecard", exact: true }).first().click();
await page.waitForTimeout(2000);

/* Put the battery on the card the way the shop does. */
const partBox = page.getByPlaceholder(/Part number or name/i).first();
ok("the parts box is there", (await partBox.count()) > 0);
await partBox.click();
await partBox.fill("5747");
await page.waitForTimeout(500);
await partBox.press("Enter");
await page.waitForTimeout(600);

let t = await page.locator("body").innerText();
ok("the battery is on the card", /5747-31S950/.test(t), t.slice(0, 200));

const qty = page.getByLabel(/How many 5747-31S950/i).first();
ok("its quantity box is there", (await qty.count()) > 0);
ok("…starting at one", (await qty.inputValue()) === "1", await qty.inputValue());

/* ── the bug ──────────────────────────────────────────────────── */
console.log("\n── clearing the box ──");
await qty.click();
await page.keyboard.press("Backspace");
await page.waitForTimeout(300);
/* The whole bug in one assertion: one backspace used to leave a 1
   sitting there. */
ok("one backspace empties it and it stays empty",
  (await qty.inputValue()) === "", await qty.inputValue());

await qty.type("3");
await page.waitForTimeout(300);
ok("…and typing 3 gives 3, not 31",
  (await qty.inputValue()) === "3", await qty.inputValue());

console.log("\n── tapping it replaces what is there ──");
/* The other half: a thumb taps the box and types. Without
   select-on-focus the digit lands beside the old one, which is how
   "31" happened in the first place. */
await page.getByLabel(/Work performed/i).first().click();
await page.waitForTimeout(200);
await qty.click();
await page.waitForTimeout(200);
await page.keyboard.type("7");
await page.waitForTimeout(300);
ok("tapping and typing 7 gives 7, not 37",
  (await qty.inputValue()) === "7", await qty.inputValue());

console.log("\n── and what it settles on ──");
/* Blur first so this step stands on its own: clicking a box that
   already has focus does not fire onFocus again, so there is no
   select-all and the caret lands wherever the tap did. */
await page.getByLabel(/Work performed/i).first().click();
await page.waitForTimeout(200);
await qty.click();
await page.waitForTimeout(200);
await page.keyboard.press("Backspace");
await page.waitForTimeout(200);
ok("…cleared again", (await qty.inputValue()) === "", await qty.inputValue());
await page.getByLabel(/Work performed/i).first().click();
await page.waitForTimeout(400);
ok("left empty, it settles back to one",
  (await qty.inputValue()) === "1", await qty.inputValue());

await qty.click();
await page.keyboard.type("2.5");
await page.getByLabel(/Work performed/i).first().click();
await page.waitForTimeout(400);
ok("a fraction is allowed through", (await qty.inputValue()) === "2.5", await qty.inputValue());

console.log("\n── two parts nobody has catalogued ──");
/* Both have no id. This is where one quantity change used to hit both
   lines and one Remove used to take both away. */
for (const num of ["WIDGET-1", "WIDGET-2"]) {
  await partBox.click();
  await partBox.fill(num);
  await page.waitForTimeout(450);
  await partBox.press("Enter");
  await page.waitForTimeout(500);
}
t = await page.locator("body").innerText();
ok("both typed parts are on the card", /WIDGET-1/.test(t) && /WIDGET-2/.test(t), t.slice(0, 300));

const q1 = page.getByLabel(/How many WIDGET-1/i).first();
const q2 = page.getByLabel(/How many WIDGET-2/i).first();
await q1.click();
await page.keyboard.type("4");
await page.getByLabel(/Work performed/i).first().click();
await page.waitForTimeout(400);
ok("changing one typed part's quantity", (await q1.inputValue()) === "4", await q1.inputValue());
ok("…leaves the other alone", (await q2.inputValue()) === "1", await q2.inputValue());
ok("…and does not touch the battery", (await qty.inputValue()) === "2.5", await qty.inputValue());

/* Remove is scoped to the row it is on. The old filter matched on
   partId, and null matches null. */
const removeOn = (label) => page.locator("div").filter({ hasText: new RegExp(`^${label}`) })
  .locator("button", { hasText: /Remove/i });
await page.getByLabel(/How many WIDGET-1/i).first()
  .locator("xpath=../button[normalize-space()='Remove']").click();
await page.waitForTimeout(500);
t = await page.locator("body").innerText();
ok("removing one typed part takes exactly it", !/WIDGET-1/.test(t), t.slice(0, 300));
ok("…and leaves the other one on the card", /WIDGET-2/.test(t));
ok("…and the battery", /5747-31S950/.test(t));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
