/* Impossible tread on the Tires screen, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-tread.mjs holds the rule. This holds the part that
   matters to somebody in a shop: that DT-899's four blank wheels stop
   being blank, that a number which cannot be right is refused at the
   wheel it is being typed into, and that somebody who knows better
   can still get past it — because when the MOUNT depth is the wrong
   figure, the true reading is the one that looks impossible.

   The truck is the real one, with the numbers the database actually
   holds.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-treadboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const V = "v899";

/* DT-899's drive axles, mounted 08/25 at 95,003, gauged 09/11 at
   97,757 and 09/22 at 99,141 — exactly as the rows read. */
const DRIVE = {
  "3LI": [16, 16, 12], "3LO": [16.5, 17, 14],
  "3RI": [17, 17, 17], "3RO": [16, 16, 16],
  "4LI": [13, 14, 12], "4LO": [14, 14, 11],
  "4RI": [10, 11, 10], "4RO": [12, 10, 14],
};
/* The steer and pusher went on later, at 97,757. 1R and 2L have never
   been gauged at all. */
const FRONT = { "1L": [11, 15], "1R": [15], "2L": [18], "2R": [17, 19] };

const tires = [], readings = [], wear = [];
let n = 0;
const add = (pos, depths, onOdo, onDate, odos, dates) => {
  const id = `t${++n}`;
  tires.push({ id, vehicle_id: V, position: pos, brand: "Maxam", model: null,
    size: "11R24.5", tire_type: "virgin", wheel_material: "aluminum", casing_id: null,
    mounted_date: onDate, mounted_odometer: onOdo, mounted_depth: depths[0],
    cost: 480, removed_date: null, removed_odometer: null, removed_reason: null,
    notes: null, created_by: null, created_at: onDate });
  depths.slice(1).forEach((d, i) => readings.push({
    id: `r${id}-${i}`, tire_id: id, reading_date: dates[i], depth_32nds: d,
    odometer: odos[i], created_at: dates[i] }));
  /* tw_tire_wear is a view; the fake stands in for the arithmetic.
     Worn is measured from the mount, so zero or less means no rate —
     which is the blank this whole test is about. */
  const last = depths[depths.length - 1];
  const worn = depths[0] - last;
  const miles = depths.length > 1 ? odos[odos.length - 1] - onOdo : 0;
  wear.push({ tire_id: id, vehicle_id: V, truck: "DT-899", position: pos,
    current_depth: last, miles_run: miles, worn_32nds: worn,
    miles_per_32nd: worn > 0 && miles > 0 ? Math.round(miles / worn) : null,
    miles_per_mil: null });
};
for (const [pos, d] of Object.entries(DRIVE))
  add(pos, d, 95003, "2026-08-25", [97757, 99141], ["2026-09-11", "2026-09-22"]);
for (const [pos, d] of Object.entries(FRONT))
  add(pos, d, 97757, "2026-09-10", [99141], ["2026-09-22"]);

const rows = {
  tw_vehicles: [{ id: V, number: "DT-899", make: "Peterbilt", model: "567",
    model_year: 2024, division: "DT", axle_config: "dump12",
    motive_vehicle_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  tw_tires: tires, tw_tread_readings: readings, tw_tire_wear: wear,
  tw_odometer_log: [{ id: "o1", vehicle_id: V, reading_date: "2026-09-22",
    odometer: 99141, source: "manual", created_at: "2026-09-22" }],
  tw_tire_brands: [{ id: "b1", name: "Maxam", sort_order: 1, active: true }],
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
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 2000 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));
const { writes } = await fakeRest(ctx, { rows });

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
await page.getByText("DT-899").first().click();
await page.waitForTimeout(1500);

let t = await page.locator("body").innerText();
ok("the truck opens", /DT-899/.test(t));
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));
ok("no 'does not exist'", !/does not exist/i.test(t));

/* ── 1. the banner ────────────────────────────────────────────── */
console.log("\n── what cannot be right is said out loud ──");
ok("the banner is there", /readings? that cannot be right/i.test(t),
   t.slice(0, 200));
/* 4RO read 10/32 on 09/11 and 14/32 on 09/22. 1L went on at 11/32 and
   gauged 15/32. 2R went on at 17/32 and gauged 19/32. */
ok("4RO is named", /4RO/.test(t) && /10\/32.*14\/32|14\/32.*10\/32/s.test(t));
ok("1L is named", /1L\s+—\s+mounted at 11\/32, then 15\/32/.test(t),
   (t.match(/1L[^\n]*/) || [""])[0]);
ok("2R is named", /2R\s+—\s+mounted at 17\/32, then 19\/32/.test(t),
   (t.match(/2R[^\n]*/) || [""])[0]);
ok("three of them, no more", (t.match(/— \d+(\.\d+)?\/32 deeper than it started/g) || []).length === 3,
   `${(t.match(/deeper than it started/g) || []).length}`);
/* 3LO rose half a 32nd and 4LI and 4RI rose one. That is the gauge,
   and a flag that fires on it is a flag nobody reads. */
for (const p of ["3LO", "4LI", "4RI"]) {
  ok(`${p} is not in the banner`,
     !new RegExp(`${p} (mounted at|read) `).test(t));
}

/* ── 2. the blanks say why ────────────────────────────────────── */
console.log("\n── the dash that started all this ──");
const table = page.locator("table").last();
const rowOf = async (pos) => {
  const tr = table.locator("tr").filter({ has: page.getByRole("button", { name: pos, exact: true }) });
  return (await tr.count()) ? (await tr.first().innerText()).replace(/\s+/g, " ") : "";
};
const r3RI = await rowOf("3RI"), r3RO = await rowOf("3RO");
const r4RI = await rowOf("4RI"), r4RO = await rowOf("4RO");
ok("3RI says it has not worn, and over how far",
   /no wear measured in 4,138 mi/.test(r3RI), r3RI);
ok("3RO the same", /no wear measured in 4,138 mi/.test(r3RO), r3RO);
ok("4RI the same", /no wear measured in 4,138 mi/.test(r4RI), r4RI);
ok("4RO says it reads deeper instead", /deeper than it did/.test(r4RO), r4RO);
ok("…and 4RO does not also claim no wear", !/no wear measured/.test(r4RO), r4RO);
/* The one that was never gauged must not read the same as one that
   was gauged twice and did not move. */
const r1R = await rowOf("1R");
ok("1R says it has not turned a wheel, not that it has not worn",
   /no miles since it went on/.test(r1R) && !/no wear measured/.test(r1R), r1R);
const r3LI = await rowOf("3LI");
ok("a wheel with a rate is left alone",
   /1,035/.test(r3LI) && !/no wear|deeper/.test(r3LI), r3LI);

/* ── 3. refused at the box ────────────────────────────────────── */
console.log("\n── typing a number that cannot be right ──");
await page.getByRole("button", { name: "Record tread" }).click();
await page.waitForTimeout(700);
ok("the form opened with a box per wheel",
   (await page.locator('input[type="number"]').count()) >= 12,
   `${await page.locator('input[type="number"]').count()}`);

/* 4RO last read 10/32. Type 14 again — the number somebody keyed on
   09/22 — and it has to be caught this time. Found by the card it
   sits in: an unscoped nth() picks whichever comes first in the DOM,
   which is not the wheel on screen. */
const ro = page.locator('input[type="number"]');
let target = null;
for (let i = 0; i < await ro.count(); i++) {
  const box = ro.nth(i);
  const card = box.locator("xpath=ancestor::div[contains(@style,'border-radius: 6px')][1]");
  if ((await card.count()) && /4RO/.test(await card.first().innerText())) { target = box; break; }
}
ok("4RO's box was found", !!target);
await target.fill("14");
await page.waitForTimeout(600);

t = await page.locator("body").innerText();
ok("it is refused at once", /that reading cannot be right/i.test(t),
   (t.match(/.{0,80}cannot be right.{0,120}/i) || ["(nothing)"])[0]);
ok("…naming the figure it contradicts and when",
   /Deeper than the 10\/32 it read on 09\/11\/26/.test(t),
   (t.match(/Deeper than[^\n]*/) || ["(nothing)"])[0]);
ok("…and the wheel it is on", /4RO 14\/32/.test(t.replace(/\s+/g, " ")),
   (t.match(/4RO[^\n]{0,30}/) || [""])[0]);
ok("…and nothing has been written", writes.length === 0, `${writes.length}`);

/* A reading that is fine must not be caught. */
await target.fill("9");
await page.waitForTimeout(500);
t = await page.locator("body").innerText();
/* The page banner about the SAVED history says "cannot be right" too
   and must stay, so this looks for the line only the form produces. */
ok("a reading that can be right is not refused",
   !/Deeper than the/.test(t) && !/that reading cannot be right/i.test(t),
   (t.match(/.{0,60}(Deeper than|reading cannot be right).{0,60}/i) || [""])[0]);
ok("…and the banner about the saved history stays",
   /readings that cannot be right/i.test(t));

/* ── 4. and it is not a dead end ──────────────────────────────── */
console.log("\n── saving anyway, for when the mount depth is the wrong figure ──");
await target.fill("14");
await page.waitForTimeout(500);
await page.getByRole("button", { name: /^Save 1 reading$/ }).click();
await page.waitForTimeout(600);
t = await page.locator("body").innerText();
ok("the first press does not save it", writes.length === 0, `${writes.length}`);
ok("…it asks again, and says so", /Save 1 anyway/i.test(t),
   (t.match(/Save[^\n]*/) || [""])[0]);

await page.getByRole("button", { name: /Save 1 anyway/ }).click();
await page.waitForTimeout(1800);
const saved = writes.filter((w) => w.table === "tw_tread_readings");
ok("the second press saves it", saved.length === 1, `${saved.length}`);
ok("…with the number that was typed",
   Number((Array.isArray(saved[0]?.body) ? saved[0].body[0] : saved[0]?.body)?.depth_32nds) === 14,
   JSON.stringify(saved[0]?.body));
ok("nothing crashed", crashes.length === 0, crashes.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
