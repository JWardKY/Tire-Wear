/* Equipment in the app, off the Tires page, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-motiveunit.mjs holds the import rules. This holds what
   the new "no tires tracked" setting actually does once a paver is in
   the fleet.

   Motive keeps two lists — vehicles with an ELD, assets with a gateway
   — and the app had only taken the first. Pulling in the second added
   76 pickups and 62 pieces of yard and paving plant. The plant is the
   hard part: every unit must declare an axle layout, and the shortest
   was four tires, so an arrow board would have sat on the Tires page
   claiming four wheels it does not have and reading 0 of 4 forever.

   So: a unit set to "no tires tracked" is a real unit everywhere work
   is booked, and is simply not on the page about tread. And the Tires
   page will not offer to make a truck one, because doing that from
   there would take the truck off the page with no way back to it.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-fleetboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const veh = (id, number, division, cfg, make, model) => ({
  id, number, make, model, model_year: "2020", division, axle_config: cfg,
  motive_vehicle_id: null, motive_asset_id: null, active: true, notes: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
});

/* One of each of the things the import creates. */
const vehicles = [
  veh("v1", "DT-890", "DT", "dump12", "Mack", "Gu713"),
  veh("v2", "LT-1487", "LT", "light4", "Chevrolet", "1500"),
  veh("v3", "T-674", "EQ", "trailer8", "Etnyre", "tanker"),
  veh("v4", "F-1249", "EQ", "notires", "Vogele", "Paver"),
  veh("v5", "AB-11", "EQ", "notires", "Arrow board", "Arrow board"),
  veh("v6", "RL-1048", "EQ", "notires", "Case", "580N"),
];

const rows = {
  tw_vehicles: vehicles,
  tw_tires: [], tw_tread_readings: [], tw_tire_wear: [], tw_odometer_log: [],
  tw_tire_brands: [{ id: "b1", name: "Continental", sort_order: 1, active: true }],
  tw_settings: [{ id: true, pull_steer_32nds: 6, pull_other_32nds: 4,
    default_new_depth: 28, dual_match_32nds: 4, alert_emails: [],
    updated_at: "2026-01-01" }],
  tw_mechanics: [], tw_work_log: [], tw_tire_alerts: [], tw_tires_due_out: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1400 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));
await fakeRest(ctx, { rows });

const page = await ctx.newPage();
const crashes = [], rest400 = [];
page.on("pageerror", (e) => crashes.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Tires", exact: true }).first().click();
await page.waitForTimeout(2000);

let t = await page.locator("body").innerText();
ok("the Tires page opens", /DT-890/.test(t), t.slice(0, 160));
ok("no rejected reads", rest400.length === 0, rest400.join(" "));

/* ── what belongs on a page about tread ───────────────────────── */
console.log("\n── the fleet list ──");
ok("a dump truck is on it", /DT-890/.test(t));
ok("a pickup is on it — four tires are still tires", /LT-1487/.test(t));
ok("a tanker is on it — eight of them", /T-674/.test(t));
/* The whole point. These are units; they are not tires. */
ok("a paver is not", !/F-1249/.test(t), (t.match(/F-1249[^\n]*/) || [""])[0]);
ok("an arrow board is not", !/AB-11/.test(t), (t.match(/AB-11[^\n]*/) || [""])[0]);
ok("a backhoe is not", !/RL-1048/.test(t), (t.match(/RL-1048[^\n]*/) || [""])[0]);
/* A unit reading "0 / 0" would be the bug wearing a disguise. */
ok("and nothing reads zero of zero", !/0\s*\/\s*0/.test(t.replace(/\s+/g, " ")));

/* ── the division filter knows the new fleets ─────────────────── */
console.log("\n── divisions ──");
/* Buttons, not a dropdown, and they used to be written out by hand as
   ALL/DT/HT — which stayed saying that after 76 pickups and seven
   tankers arrived. They come off the fleet now. */
const divBtn = (d) => page.getByRole("button", { name: d, exact: true }).first();
for (const d of ["ALL", "DT", "LT", "EQ"])
  ok(`${d} can be filtered to`, (await divBtn(d).count()) > 0);
/* The pavers are EQ too, and EQ is on the page because the tanker is —
   but pressing it must never bring a paver with it. */
ok("no division nobody has", (await divBtn("OT").count()) === 0);

await divBtn("LT").click();
await page.waitForTimeout(600);
t = await page.locator("body").innerText();
ok("filtering to LT shows the pickup", /LT-1487/.test(t));
ok("…and not the dump truck", !/DT-890/.test(t));

await divBtn("EQ").click();
await page.waitForTimeout(600);
t = await page.locator("body").innerText();
ok("filtering to EQ shows the tanker", /T-674/.test(t));
ok("…and still not the paver behind it", !/F-1249/.test(t), (t.match(/F-1249[^\n]*/) || [""])[0]);

await divBtn("ALL").click();
await page.waitForTimeout(600);
t = await page.locator("body").innerText();
ok("the count line names each fleet rather than calling them all HT",
  /3 units/.test(t) && /1 DT/.test(t) && /1 LT/.test(t) && /1 EQ/.test(t),
  (t.match(/\d+ units?[^\n]*/) || [""])[0]);

/* ── the trap that was closed ─────────────────────────────────── */
console.log("\n── a truck cannot be sent off this page from this page ──");
await page.getByText("DT-890").first().click();
await page.waitForTimeout(1200);
const cfgPicker = page.locator("select").filter({ hasText: /12-tire dump/ }).first();
ok("the truck's axle picker is there", (await cfgPicker.count()) > 0);
const opts = await cfgPicker.locator("option").allInnerTexts();
ok("it offers the real layouts", opts.some((o) => /12-tire dump/.test(o)), opts.join(" | "));
ok("…and an 8-tire trailer", opts.some((o) => /trailer/i.test(o)), opts.join(" | "));
/* Picking it here would take the truck off the fleet list and leave
   nobody a way back to it. That move belongs in Setup. */
ok("but never 'no tires tracked'",
  !opts.some((o) => /no tires/i.test(o)), opts.join(" | "));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
