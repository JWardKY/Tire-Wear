/* Moving a tire to another wheel, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-move.mjs holds the rules. This holds the part that
   matters in a shop: that on a truck with twelve tires mounted — where
   there is no free wheel at all — 4RO can still be sent to 4LO, and
   that the tire already on 4LO comes back the other way instead of
   being lost.

   The swap itself is one database transaction (tw_move_tire). The fake
   database does not model the partial unique index, so this registers
   its own route for the rpc and applies the swap to the fixture rows
   the way the real function does. What is being checked here is the
   screen: that it offers taken wheels, says what is about to happen,
   sends the right call, and writes the move down.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-moveboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const V = "v899";
const POS12 = ["1L", "1R", "2L", "2R", "3LI", "3LO", "3RI", "3RO",
               "4LI", "4LO", "4RI", "4RO"];
const DEPTH = { "1L": 15, "1R": 15, "2L": 18, "2R": 19, "3LI": 12, "3LO": 14,
                "3RI": 17, "3RO": 16, "4LI": 12, "4LO": 11, "4RI": 10, "4RO": 14 };

/* Every wheel full — the case the edit form could not handle. */
const tires = [], readings = [], wear = [];
POS12.forEach((pos, i) => {
  const id = `t${i}`;
  tires.push({ id, vehicle_id: V, position: pos, brand: "Maxam", model: null,
    size: "11R24.5", tire_type: "virgin", wheel_material: "aluminum", casing_id: null,
    mounted_date: "2026-08-25", mounted_odometer: 95003, mounted_depth: DEPTH[pos] + 4,
    cost: 480, removed_date: null, removed_odometer: null, removed_reason: null,
    notes: null, created_by: null, created_at: "2026-08-25" });
  readings.push({ id: `r${i}`, tire_id: id, reading_date: "2026-09-22",
    depth_32nds: DEPTH[pos], odometer: 99141, created_at: "2026-09-22" });
  wear.push({ tire_id: id, vehicle_id: V, truck: "DT-899", position: pos,
    current_depth: DEPTH[pos], miles_run: 4138, worn_32nds: 4,
    miles_per_32nd: 1035, miles_per_mil: null });
});

/* The rpc stand-in mutates these rows in place, the way the database
   does. A section that needs the truck back as it started has to take
   a copy made BEFORE anything ran, not re-use the same objects. */
const PRISTINE = JSON.stringify(tires);

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
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1800 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));

/* The rpc the real database serves. The fake does not model the
   partial unique index, so without standing in for the function here
   neither the swap nor the replace could be exercised. */
const rpcCalls = [];
const { writes } = await fakeRest(ctx, {
  rows,
  rpc: {
    tw_move_tire: (body) => {
      const { p_tire, p_to, p_pull_other, p_off_date, p_off_odometer, p_off_reason } = body;
      rpcCalls.push(body);
      const mine = rows.tw_tires.find((t) => t.id === p_tire && !t.removed_date);
      if (!mine) throw new Error("no such tire");
      const from = mine.position;
      const other = rows.tw_tires.find(
        (t) => t.vehicle_id === mine.vehicle_id && t.position === p_to && !t.removed_date);
      if (other && p_pull_other) {
        other.removed_date = p_off_date;
        other.removed_odometer = p_off_odometer;
        other.removed_reason = p_off_reason;
      }
      mine.position = p_to;
      if (other && !p_pull_other) other.position = from;
      return { vehicle_id: mine.vehicle_id, from, to: p_to,
               swapped_with: other && !p_pull_other ? other.id : null,
               pulled: other && p_pull_other ? other.id : null };
    },
  },
});

const page = await ctx.newPage();
const crashes = [], rest400 = [];
page.on("pageerror", (e) => crashes.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

const openTruck = async () => {
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Tires", exact: true }).first().click();
  await page.waitForTimeout(1800);
  await page.getByText("DT-899").first().click();
  await page.waitForTimeout(1400);
};
await openTruck();

let t = await page.locator("body").innerText();
ok("the truck opens with all twelve on", /12\s*\/\s*12/.test(t.replace(/\s+/g, " ")),
   (t.match(/TIRES MOUNTED[^\n]*\n?[^\n]*/i) || [""])[0]);
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));

/* ── the offer ────────────────────────────────────────────────── */
console.log("\n── a truck with no free wheel ──");
await page.getByRole("button", { name: "4RO", exact: true }).first().click();
await page.waitForTimeout(900);
t = await page.locator("body").innerText();
ok("the tire dialog opens on 4RO", /4RO/.test(t));
ok("it offers to move the tire", /Move to another wheel/i.test(t), t.slice(0, 120));

await page.getByRole("button", { name: /Move to another wheel/i }).click();
await page.waitForTimeout(600);
const form = page.locator('div[style*="position: fixed"]').last();
const dest = form.locator("select").last();
const opts = await dest.locator("option").allInnerTexts();
ok("every other wheel is offered", opts.length === 12, `${opts.length}: ${opts.join(" | ")}`);
ok("…including 4LO, which is taken", opts.some((o) => /^4LO/.test(o)), opts.join(" | "));
ok("…saying what is on it", opts.some((o) => /4LO.*Maxam.*11\/32/.test(o)), opts.join(" | "));
ok("…and not its own wheel", !opts.some((o) => /^4RO/.test(o)), opts.join(" | "));
ok("nothing is chosen to start with", (await dest.inputValue()) === "");

/* ── what it says before it does it ───────────────────────────── */
console.log("\n── what it says before it happens ──");
await dest.selectOption("4LO");
await page.waitForTimeout(500);
t = await form.innerText();
/* The default, because it is what the shop does: the tire on the wheel
   being moved to is scrapped, not put back on the truck. */
ok("it offers what becomes of the tire already there",
   /Comes off the truck/i.test(t) && /they trade places/i.test(t), t.slice(0, 500));
ok("…and taking it off is what it does unasked",
   /4RO \(14\/32\) moves to 4LO\. The 11\/32 on 4LO comes off the truck\./.test(t),
   (t.match(/4RO[^\n]*comes off[^\n]*/) || ["(nothing)"])[0]);
ok("…with the button saying so", /Move it, 4LO comes off/i.test(t),
   (t.match(/Move it[^\n]*|Swap them/i) || [""])[0]);
ok("…and a reason for the tire coming off", /Worn out/.test(t), t.slice(0, 500));

/* And the swap is still there, one click away. */
await form.getByRole("radio").nth(1).check();
await page.waitForTimeout(400);
t = await form.innerText();
ok("choosing the swap says they trade places",
   /4RO \(14\/32\) and 4LO \(11\/32\) trade places/.test(t),
   (t.match(/.{0,20}trade places.{0,20}/) || ["(nothing)"])[0]);
ok("…and the button says swap, not move", /Swap them/i.test(t),
   (t.match(/Swap them|Move it/i) || [""])[0]);
ok("…and the reason box goes away, nothing is coming off", !/Worn out/.test(t));
ok("…and it says the readings come along", /keeps its readings/i.test(t));
ok("…and points at the edit form for a position keyed wrong",
   /Edit these details/i.test(t));
ok("nothing has been written yet", writes.length === 0 && rpcCalls.length === 0,
   `${writes.length} writes, ${rpcCalls.length} rpc`);

/* Crossing to a steer wheel changes which pull depth it is judged by. */
await dest.selectOption("1L");
await page.waitForTimeout(400);
t = await form.innerText();
ok("moving to a steer wheel warns about the pull depth",
   /6\/32 rather than 4\/32/.test(t), (t.match(/.{0,40}rather than.{0,30}/) || ["(nothing)"])[0]);
await dest.selectOption("4LO");
await page.waitForTimeout(400);
t = await form.innerText();
ok("…and going back to a drive wheel drops the warning", !/rather than/.test(t));

/* ── doing it ─────────────────────────────────────────────────── */
console.log("\n── the swap ──");
await page.getByRole("button", { name: /Swap them/i }).click();
await page.waitForTimeout(2200);

ok("the move went through the function, not two updates",
   rpcCalls.length === 1, JSON.stringify(rpcCalls));
ok("…naming 4RO's tire and 4LO", rpcCalls[0]?.p_to === "4LO"
   && rpcCalls[0]?.p_tire === tires.find((x) => x.position === "4LO" || x.id === "t11")?.id,
   JSON.stringify(rpcCalls[0]));
ok("…and told not to pull anything, because this one is a swap",
   rpcCalls[0]?.p_pull_other === false, JSON.stringify(rpcCalls[0]));
ok("…and no tire row was updated directly",
   !writes.some((w) => w.table === "tw_tires"), JSON.stringify(writes.map((w) => w.table)));

t = await page.locator("body").innerText();
ok("the dialog closed", !/Move this tire/i.test(t));
ok("all twelve are still on the truck", /12\s*\/\s*12/.test(t.replace(/\s+/g, " ")));

/* The screen has to show the swap, not just accept it. */
/* By the row's own text, not by a button in it: a wheel with a tire on
   it renders its position as a button, and a bare one renders it as
   plain text. Matching the button finds nothing for exactly the rows
   this test cares most about. */
const rowTread = async (pos) => {
  const tr = page.locator("table").last().locator("tr");
  for (let i = 0; i < await tr.count(); i++) {
    const text = (await tr.nth(i).innerText()).replace(/\s+/g, " ");
    if (new RegExp(`^${pos}\\b`).test(text)) return text;
  }
  return "";
};
ok("4RO now shows the tire that was on 4LO", /11\/32/.test(await rowTread("4RO")),
   await rowTread("4RO"));
ok("…and 4LO shows the one that was on 4RO", /14\/32/.test(await rowTread("4LO")),
   await rowTread("4LO"));

/* ── and it is written down ───────────────────────────────────── */
console.log("\n── the record ──");
const logged = writes.filter((w) => w.table === "tw_work_log").flatMap((w) => w.body);
ok("one line in the work log", logged.length === 1, `${logged.length}`);
ok("…as a move", logged[0]?.event_type === "tire_moved", logged[0]?.event_type);
ok("…with a name on it", logged[0]?.actor_name === "jason_ward@theallen.com");
ok("…saying which truck and which two wheels",
   /DT-899 — 4RO and 4LO traded places/.test(logged[0]?.summary || ""), logged[0]?.summary);
ok("…the date it happened", /on \d\d\/\d\d\/\d\d/.test(logged[0]?.summary || ""), logged[0]?.summary);
ok("…and the odometer it was pre-filled with",
   /99,141 mi/.test(logged[0]?.summary || ""), logged[0]?.summary);
ok("…with the truck on the row itself", logged[0]?.unit_number === "DT-899");
ok("…and both wheels in the detail",
   logged[0]?.detail?.from === "4RO" && logged[0]?.detail?.to === "4LO"
   && !!logged[0]?.detail?.swappedWith, JSON.stringify(logged[0]?.detail));

ok("nothing crashed", crashes.length === 0, crashes.join("\n    "));

/* ── a move onto a wheel with nothing on it ───────────────────── */
console.log("\n── a wheel with nothing on it ──");
rows.tw_tires = rows.tw_tires.filter((x) => x.position !== "3LI");
rpcCalls.length = 0;
await openTruck();
await page.getByRole("button", { name: "4RI", exact: true }).first().click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /Move to another wheel/i }).click();
await page.waitForTimeout(500);
const form2 = page.locator('div[style*="position: fixed"]').last();
await form2.locator("select").last().selectOption("3LI");
await page.waitForTimeout(400);
t = await form2.innerText();
ok("it says the wheel is empty", /moves to 3LI, which is empty/.test(t),
   (t.match(/.{0,30}empty.{0,10}/) || ["(nothing)"])[0]);
ok("…and the button says move, not swap", /Move it/i.test(t) && !/Swap them/i.test(t));
await page.getByRole("button", { name: /^Move it$/i }).click();
await page.waitForTimeout(2000);
ok("it went through the same function", rpcCalls.length === 1
   && rpcCalls[0].p_to === "3LI", JSON.stringify(rpcCalls));
const moved = writes.filter((w) => w.table === "tw_work_log").flatMap((w) => w.body).pop();
ok("…and reads as a move rather than a swap",
   /tire moved 4RI → 3LI/.test(moved?.summary || ""), moved?.summary);
ok("…with nothing swapped in the detail", moved?.detail?.swappedWith === null,
   JSON.stringify(moved?.detail));
ok("still nothing crashed", crashes.length === 0, crashes.join("\n    "));

/* ── the one the shop actually does ──────────────────────────── */
/* "I move 4RI to 4LO but 4LO is removed from the truck, not swapped."
   The first version of this screen could only swap, which would have
   put the scrapped tire straight back on at 4RI. */
console.log("\n── moving onto a wheel whose tire is being scrapped ──");
rows.tw_tires = JSON.parse(PRISTINE);               // the truck as it started
rpcCalls.length = 0;
writes.length = 0;
await openTruck();
await page.getByRole("button", { name: "4RI", exact: true }).first().click();
await page.waitForTimeout(900);
await page.getByRole("button", { name: /Move to another wheel/i }).click();
await page.waitForTimeout(600);
const f3 = page.locator('div[style*="position: fixed"]').last();
await f3.locator("select").first().selectOption("4LO");
await page.waitForTimeout(500);
t = await f3.innerText();
ok("it takes the other tire off without being asked",
   /The 11\/32 on 4LO comes off the truck/.test(t),
   (t.match(/4RI[^\n]*|The [^\n]*comes off[^\n]*/) || ["(nothing)"])[0]);

/* The reason is the shop's, not a default nobody chose. */
const why = f3.locator("select").nth(1);
await why.selectOption("Casing sent to retread");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Move it, 4LO comes off/i }).click();
await page.waitForTimeout(2200);

ok("one call to the function", rpcCalls.length === 1, JSON.stringify(rpcCalls));
const call = rpcCalls[0] || {};
ok("…told to pull the tire that was there", call.p_pull_other === true, JSON.stringify(call));
ok("…with the date it came off", !!call.p_off_date, JSON.stringify(call));
ok("…the odometer", Number(call.p_off_odometer) === 99141, JSON.stringify(call));
ok("…and the reason that was chosen",
   call.p_off_reason === "Casing sent to retread", JSON.stringify(call));

t = await page.locator("body").innerText();
ok("the truck is down to eleven tires", /11\s*\/\s*12/.test(t.replace(/\s+/g, " ")),
   (t.match(/TIRES MOUNTED[^\n]*\n?[^\n]*/i) || [""])[0]);
ok("4LO now carries the tire that came off 4RI", /10\/32/.test(await rowTread("4LO")),
   await rowTread("4LO"));
/* The wheel it left is empty. Nothing slides onto it on its own. */
const r4RI = await rowTread("4RI");
ok("…and 4RI is empty", /Mount a tire/i.test(r4RI), r4RI);
/* The scrapped tire is off the truck, not sitting on 4RI. */
ok("the scrapped tire is off the truck altogether",
   !/11\/32/.test(r4RI), r4RI);

const rl = writes.filter((w) => w.table === "tw_work_log").flatMap((w) => w.body).pop();
ok("the log reads as a move, not a swap",
   /tire moved 4RI → 4LO/.test(rl?.summary || "") && !/traded/.test(rl?.summary || ""),
   rl?.summary);
ok("…and says the other tire came off, and why",
   /the tire on 4LO came off \(Casing sent to retread\)/.test(rl?.summary || ""), rl?.summary);
ok("…with the pulled tire in the detail and nothing swapped",
   !!rl?.detail?.pulled && rl?.detail?.swappedWith === null, JSON.stringify(rl?.detail));
ok("nothing crashed on the replace", crashes.length === 0, crashes.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
