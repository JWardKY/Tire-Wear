/* The tire catalog, in a real browser.
   ─────────────────────────────────────────────────────────────────
   src/tireModel.js holds the rules. This holds what only a browser
   can answer: that the page lists what is there, that the two numbers
   can be typed where they sit, that the same tire spelled differently
   is refused by name, and — the whole point of the thing — that
   picking a tire at the wheel fills the mount form in.

   The last one is the request behind all of this: "when I assign a
   tire to a truck that information is already pulled in. I don't have
   to gather that information or go look up a price."

   Two traps are checked on purpose. A row with no depth on it is
   still offered at the wheel, and must say what it is missing rather
   than quietly filling in a nought — a made-up depth sets every wear
   figure on that tire wrong. And the depth box has to let go of what
   is in it while somebody is typing, which is the bug the parts
   quantity box had.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-catalogboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const V = "v890";

const model = (id, brand, m, size, extra = {}) => ({
  id, brand, model: m, size, tire_type: "virgin",
  new_depth_32nds: null, cost: null, active: true, notes: null,
  created_at: "2026-01-01", updated_at: "2026-01-01", ...extra,
});

const rows = {
  tw_vehicles: [{ id: V, number: "DT-890", make: "Kenworth", model: "T880",
    model_year: 2022, division: "DT", axle_config: "dump12",
    motive_vehicle_id: null, motive_asset_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  /* One finished row, one with nothing on it, and a retread — the
     three states the page has to tell apart. */
  tw_tire_models: [
    model("m1", "Continental", "HDC3", "11R24.5",
      { new_depth_32nds: 28, cost: 655.24 }),
    model("m2", "Continental", "HAC3", "425/65R22.5"),
    model("m3", "Bandag", "BDR", "11R24.5",
      { tire_type: "retread", new_depth_32nds: 22, cost: 310 }),
  ],
  tw_tires: [], tw_tread_readings: [], tw_tire_wear: [], tw_odometer_log: [],
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
  console.log("  node scripts/test-catalogboard.mjs");
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));
const { writes } = await fakeRest(ctx, { rows });

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

console.log("── the catalog page ──");
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));
await page.getByRole("button", { name: "Tire catalog", exact: true }).first().click();
await page.waitForTimeout(900);

let t = await page.locator("body").innerText();
ok("all three tires are listed",
  /HDC3/.test(t) && /HAC3/.test(t) && /BDR/.test(t), t.slice(0, 400));
ok("it says how many are in it", /3 tires in the catalog/i.test(t), t.slice(0, 200));
/* The one real count on this page: how much work is left before the
   catalog can fill a form in. */
ok("…and how many still need filling in",
  /1 still needs? a depth or a price/i.test(t), t.slice(0, 300));
ok("a retread says so", /Retread/.test(t));

/* The unfinished row sorts first so the list can be worked down once
   rather than hunted through. */
const order = await page.locator("tbody tr td:first-child").allInnerTexts();
ok("the unfinished one is at the top", /HAC3/.test(order[0] || ""), order.join(" | "));

console.log("\n── typing the two numbers where they sit ──");
const depth = page.locator("tbody tr").filter({ hasText: "HAC3" })
  .locator("input").first();
ok("the depth box is there", (await depth.count()) > 0);
ok("…and is empty", (await depth.inputValue()) === "", await depth.inputValue());
await depth.click();
await page.keyboard.type("26");
await page.waitForTimeout(200);
/* The parts-quantity bug, which this box must not repeat: nothing
   rewrites it while somebody is typing in it. */
ok("it holds what is typed", (await depth.inputValue()) === "26", await depth.inputValue());
await page.keyboard.press("Backspace");
await page.waitForTimeout(200);
ok("…and lets go of it again", (await depth.inputValue()) === "2", await depth.inputValue());
await page.keyboard.type("6");
await page.keyboard.press("Tab");
await page.waitForTimeout(1200);

const saved = writes.filter((w) => w.table === "tw_tire_models" && w.method === "PATCH");
ok("leaving the box saves the depth",
  saved.some((w) => Number(w.body?.new_depth_32nds) === 26),
  JSON.stringify(saved.map((w) => w.body)));

ok("…and the row comes back carrying it",
  (await depth.inputValue()) === "26", await depth.inputValue());
t = await page.locator("body").innerText();
/* Half filled in is still not finished — the price is the other half,
   and a row with no price is why cost per mile has never said
   anything. */
ok("…and it still counts as unfinished until the price is on it",
  /1 still need a depth or a price/i.test(t), t.slice(0, 300));

console.log("\n── the same tire spelled differently ──");
await page.getByRole("button", { name: /ADD A TIRE/i }).first().click();
await page.waitForTimeout(500);
await page.getByPlaceholder("Continental").first().fill("continental");
await page.getByPlaceholder("HDC3").first().fill("hdc 3");
await page.getByPlaceholder("11R24.5").first().fill("11/24.5");
await page.waitForTimeout(400);
t = await page.locator("body").innerText();
/* Not "duplicate key value violates unique constraint". The row it
   clashes with is named, because the answer is to go and edit that
   one. */
ok("it is refused, and the row it clashes with is named",
  /Continental HDC3 · 11R24\.5 · Virgin is already in the catalog/.test(t),
  t.slice(0, 600));
const addBtn = page.getByRole("button", { name: /^ADD IT$/i }).first();
ok("…and ADD IT is not available", await addBtn.isDisabled());

/* A genuinely different tire goes in. */
await page.getByPlaceholder("HDC3").first().fill("HSR2");
await page.waitForTimeout(400);
ok("a different model is allowed", !(await addBtn.isDisabled()));
await page.getByPlaceholder("28").first().fill("20");
await page.getByPlaceholder("655.24").first().fill("412.5");
await addBtn.click();
await page.waitForTimeout(900);
const added = writes.filter((w) => w.table === "tw_tire_models" && w.method === "POST");
ok("it is added with its depth and price",
  added.some((w) => {
    const b = Array.isArray(w.body) ? w.body[0] : w.body;
    return b?.model === "HSR2" && Number(b?.new_depth_32nds) === 20
      && Number(b?.cost) === 412.5;
  }), JSON.stringify(added.map((w) => w.body)));

console.log("\n── and at the wheel ──");
await page.getByRole("button", { name: "Fleet", exact: true }).first().click();
await page.waitForTimeout(1000);
await page.getByText("DT-890").first().click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Mount a tire" }).first().click();
await page.waitForTimeout(700);

t = await page.locator("body").innerText();
ok("the mount form offers the catalog", /Pick it from the catalog/i.test(t), t.slice(0, 400));

const find = page.getByPlaceholder(/Brand, model or size/i).first();
await find.click();
await find.fill("hdc3");
await page.waitForTimeout(500);
/* The money line under the hit: what the form is about to fill in. */
t = await page.locator("body").innerText();
ok("typing a model finds it", /Continental HDC3 · 11R24\.5 · Virgin/.test(t), t.slice(0, 500));
ok("…and shows what it will fill in", /28\/32 · \$655\.24/.test(t), t.slice(0, 500));

await page.getByRole("button", { name: /Continental HDC3/ }).first().click();
await page.waitForTimeout(600);

const val = async (label) => {
  const el = page.getByLabel(label).first();
  return (await el.count()) ? el.inputValue() : "(no box)";
};
/* The brand is a dropdown, so the accessible name carries its options
   with it — matched on the start of the label rather than the whole of
   it. Picking a catalog tire whose brand is on the list must choose it
   there rather than dropping into "Other…", which is why the typed
   brand box must not have appeared. */
ok("the brand is filled in", (await val(/^Brand/)) === "Continental", await val(/^Brand/));
ok("…off the brand list rather than typed in as Other",
  !/Brand name/.test(await page.locator("body").innerText()));
ok("the model is filled in", (await val(/Model \/ pattern/)) === "HDC3", await val(/Model \/ pattern/));
ok("the size is filled in", (await val(/^Size$/)) === "11R24.5", await val(/^Size$/));
ok("the depth is filled in", (await val(/Tread when mounted/i)) === "28", await val(/Tread when mounted/i));
ok("and the price is filled in — nobody looks it up",
  (await val(/Cost \(\$\)/i)) === "655.24", await val(/Cost \(\$\)/i));
t = await page.locator("body").innerText();
ok("the form says where that came from",
  /From the catalog: Continental HDC3/.test(t), t.slice(0, 500));

console.log("\n── a row with gaps is still offered, and says so ──");
await find.click();
await find.fill("hac3");
await page.waitForTimeout(500);
t = await page.locator("body").innerText();
ok("it is offered", /Continental HAC3/.test(t), t.slice(0, 400));
/* The depth was filled in a moment ago, so only the price is left. A
   nought here would be worse than a blank. */
ok("…and says what is still missing", /No price on it yet/i.test(t), t.slice(0, 400));
await page.getByRole("button", { name: /Continental HAC3/ }).first().click();
await page.waitForTimeout(600);
ok("picking it fills in the brand and size",
  (await val(/^Size$/)) === "425/65R22.5", await val(/^Size$/));
/* The one that matters: a blank in the catalog leaves what is there
   rather than wiping it to nothing. */
ok("…and leaves the price alone rather than writing a nought",
  (await val(/Cost \(\$\)/i)) === "655.24", await val(/Cost \(\$\)/i));

ok("nothing threw", errors.length === 0, errors.join(" | "));
ok("no rejected requests at all", rest400.length === 0, rest400.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
