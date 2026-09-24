/* A brand chart per axle, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-axlerole.mjs holds the rule for what axle a wheel is
   on. This holds what only the page shows: that the brand comparison
   is split by what the axle does, so a tire is judged against the
   others doing the same job.

   One fleet-wide brand average was the problem. A pusher lifts and
   covers the miles on far less work, so its miles-per-32nd runs high
   whatever is fitted to it — on this fleet the top two bars were
   pusher-only tires with one reading each, sitting above every brand
   with real mileage behind them. Split by axle, each chart answers
   the question somebody has when they are ordering: what is the best
   tire for THIS position, and what is it getting.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-analysisboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const V = "v1", V2 = "v2";

/* A dump truck: axle 1 steer, axle 2 pusher, axles 3 and 4 drive.
   PUSHERONLY is fitted nowhere else, so it should vanish from the
   brand chart entirely. DRIVEONLY never touches a pusher. BOTH is on
   both, so its average has to move. */
/* Listed drives first and steers last, on purpose. The charts are
   meant to read front-to-back whatever order the rows arrive in, and a
   fixture already in display order cannot tell a real sort from no
   sort at all. */
const FIT = [
  [V, "3RO", "DRIVEONLY", 900], [V, "3RI", "DRIVEONLY", 900],
  [V, "4RO", "BOTH", 500], [V, "4RI", "BOTH", 500],
  [V, "2R", "PUSHERONLY", 3000], [V, "2L", "PUSHERONLY", 3000],
  /* An axle the truck's configuration does not have — somebody
     changed the config after the tires went on. It is a data problem,
     so it shows as Unknown rather than being quietly dropped, and it
     belongs at the END of the charts, not the front. */
  [V, "9R", "OFFCONFIG", 700],
  /* Same wheel number on a tractor, where axle 2 is a DRIVE. It must
     be filed as a drive — the rule is per truck, not per number. */
  [V2, "2R", "TRACTOR2", 1000], [V2, "2L", "TRACTOR2", 1000],
  [V, "1R", "STEER", 1800], [V, "1L", "STEER", 1700],
];
const tires = [], wear = [];
FIT.forEach(([veh, pos, brand, rate], i) => {
  if (!brand) return;
  const id = `t${i}`;
  tires.push({ id, vehicle_id: veh, position: pos, brand, model: null,
    size: "11R24.5", tire_type: "virgin", retread_count: null,
    wheel_material: "aluminum", casing_id: null, mounted_date: "2026-01-01",
    mounted_odometer: 1000, mounted_depth: 28, cost: 500, removed_date: null,
    removed_odometer: null, removed_reason: null, notes: null,
    created_by: null, created_at: "2026-01-01" });
  wear.push({ tire_id: id, vehicle_id: veh, position: pos,
    last_depth: 20, miles_run: rate * 8, worn_32nds: 8,
    miles_per_32nd: rate, miles_per_mil: null });
});
/* BOTH also sits on a pusher, so leaving pushers out must change its
   average rather than remove it. */
tires.push({ id: "tb", vehicle_id: V, position: "2LO", brand: "BOTH", model: null,
  size: "11R24.5", tire_type: "virgin", retread_count: null, wheel_material: null,
  casing_id: null, mounted_date: "2026-01-01", mounted_odometer: 1000,
  mounted_depth: 28, cost: 500, removed_date: null, removed_odometer: null,
  removed_reason: null, notes: null, created_by: null, created_at: "2026-01-01" });
wear.push({ tire_id: "tb", vehicle_id: V, position: "2LO", last_depth: 20,
  miles_run: 4 * 8 * 1000, worn_32nds: 8, miles_per_32nd: 4000, miles_per_mil: null });

const rows = {
  tw_vehicles: [
    { id: V, number: "DT-900", make: "Kenworth", model: "T880", model_year: 2024,
      division: "DT", axle_config: "dump12", motive_vehicle_id: null, active: true,
      notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
    { id: V2, number: "HT-100", make: "Peterbilt", model: "579", model_year: 2024,
      division: "HT", axle_config: "tandem10", motive_vehicle_id: null, active: true,
      notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
  ],
  tw_tires: tires, tw_tire_wear: wear, tw_tread_readings: [], tw_odometer_log: [],
  tw_tire_brands: [], tw_mechanics: [], tw_work_log: [],
  tw_settings: [{ id: true, pull_steer_32nds: 6, pull_other_32nds: 4,
    default_new_depth: 28, dual_match_32nds: 4, alert_emails: [],
    updated_at: "2026-01-01" }],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1800 } });
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
await page.waitForTimeout(1800);
await page.getByRole("button", { name: "Analysis", exact: true }).first().click();
await page.waitForTimeout(2000);

let t = await page.locator("body").innerText();
ok("the analysis page opens", /By brand/i.test(t), t.slice(0, 200));
ok("no rejected reads", rest400.length === 0, rest400.join(" "));
ok("no 'does not exist'", !/does not exist/i.test(t));

/* Read each card by slicing the page text between chart titles. An
   element locator built from the title matched wrapper divs several
   levels up and picked the whole page. */
const pageText = async () => (await page.locator("body").innerText());
const section = (text, title) => {
  const i = text.indexOf(title);
  if (i < 0) return "";
  const rest = text.slice(i + title.length);
  const next = rest.search(/\n[A-Z][^\n]*— by brand|\nRetread vs\.|\nBy wheel position|\nEvery tire with a rate/);
  return next < 0 ? rest : rest.slice(0, next);
};

let text = await pageText();

console.log("\n── a chart per axle, in the order somebody reads them ──");
ok("the steer axle has its own chart", /Steer — by brand/.test(text), text.slice(0, 300));
ok("the pushers have their own", /Pusher — by brand/.test(text));
ok("the drives have their own", /Drive — by brand/.test(text));
/* Steer first, then pusher, then drive — front to back, the way
   somebody walks the truck. */
ok("…in front-to-back order",
   text.indexOf("Steer — by brand") < text.indexOf("Pusher — by brand")
   && text.indexOf("Pusher — by brand") < text.indexOf("Drive — by brand"),
   [text.indexOf("Steer — by brand"), text.indexOf("Pusher — by brand"),
    text.indexOf("Drive — by brand")].join());
ok("the old single fleet-wide brand chart is gone",
   !/\nBy brand\n/.test(text), (text.match(/\nBy brand\n[^\n]*/) || [""])[0]);
/* A role the order does not name goes last. indexOf returns -1 for it,
   which without a guard sorts it above the steer axle. */
ok("a tire on an axle the truck does not have shows as Unknown",
   /Unknown — by brand/.test(text), text.slice(0, 400));
ok("…and is last, not first",
   text.indexOf("Unknown — by brand") > text.indexOf("Drive — by brand"),
   [text.indexOf("Unknown — by brand"), text.indexOf("Drive — by brand")].join());

console.log("\n── each brand is judged against the same job ──");
const steer = section(text, "Steer — by brand");
const pusher = section(text, "Pusher — by brand");
const drive = section(text, "Drive — by brand");

ok("a pusher-only brand appears on the pusher chart", /PUSHERONLY/.test(pusher), pusher);
ok("…and nowhere near the drives", !/PUSHERONLY/.test(drive), drive);
ok("…nor the steers", !/PUSHERONLY/.test(steer), steer);
ok("a drive-only brand is on the drive chart", /DRIVEONLY/.test(drive), drive);
ok("…and not on the pusher chart", !/DRIVEONLY/.test(pusher), pusher);
ok("the steer brand is on the steer chart", /STEER/.test(steer), steer);

/* The rule is per truck. Axle 2 is a pusher on the dump and a drive on
   the tractor, so a chart that went by the wheel number alone would
   file this under Pusher. */
ok("axle 2 on a tractor is counted as a drive, not a pusher",
   /TRACTOR2/.test(drive) && !/TRACTOR2/.test(pusher), `drive:${/TRACTOR2/.test(drive)} pusher:${/TRACTOR2/.test(pusher)}`);

console.log("\n── a brand on two kinds of axle is on both, separately ──");
/* BOTH is 500 on two drives and 4000 on one pusher. Averaged together
   it reads 1,667, which describes neither. */
ok("it is on the drive chart", /BOTH/.test(drive), drive);
ok("…and on the pusher chart", /BOTH/.test(pusher), pusher);
ok("…at 500 on the drives", /\b500\b/.test(drive), drive);
ok("…and 4,000 on the pusher", /4,000/.test(pusher), pusher);
ok("…and the blend of the two appears nowhere",
   !/1,667/.test(text), (text.match(/1,667[^\n]*/) || [""])[0]);

console.log("\n── each chart says how much is behind it ──");
ok("the steer chart counts its tires", /tires? with a wear rate on the steer axle/.test(steer), steer);
ok("the pusher chart counts its own", /tires? with a wear rate on pusher axles/.test(pusher), pusher);
ok("the drive chart counts its own", /tires? with a wear rate on the drive axles/.test(drive), drive);
/* Two steer tires in the fixture, and the sentence has to read as
   English for one as well as for several. */
ok("…with the right number", /2 tires with a wear rate on the steer axle/.test(steer), steer);

console.log("\n── and the wheel-position chart is unchanged ──");
const wheel = section(text, "By wheel position");
ok("it still shows every position", /Steer/.test(wheel) && /Drive/.test(wheel), wheel);
/* This is the one chart where a pusher belongs: showing that it wears
   differently is the whole point of it. */
ok("…pushers included", /Pusher/.test(wheel), wheel);
ok("retread versus virgin is still there", /Retread vs\./.test(text));

ok("nothing crashed", crashes.length === 0, crashes.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
