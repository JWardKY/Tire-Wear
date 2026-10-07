/* What a day was spent on, on the card board, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-cardlists.mjs holds the summarising. This holds the
   two columns themselves: that a supervisor scanning thirteen cards
   can see which trucks and which codes are behind "6 lines" without
   opening any of them.

   The figures are a real week off the board — Donald Bradley's six
   lines across five trucks and two kinds of shop time, Nick Shifflet
   with nothing but shop time, and a card still on the clock with
   nothing booked to it at all.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-cardboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const BOSS = { id: "m9", name: "Phil Hinkle", email: "phil_hinkle@theallen.com" };

const day = (o) => ({
  mechanic_id: o.id, mechanic: o.who, emp_no: o.emp, work_date: o.date,
  clock_hours: o.clock, booked_hours: o.booked, true_hours: o.booked,
  difference: Math.round((o.clock - o.booked) * 100) / 100,
  lines: o.lines, uncoded_lines: 0, uncoded_hours: 0,
  first_in: `${o.date}T11:00:00Z`, last_out: o.open ? null : `${o.date}T21:00:00Z`,
  still_open: !!o.open, approved_by: null, approved_at: null,
  last_edit: `${o.date}T21:00:00Z`, approved: false, changed_since_approved: false,
  units: o.units, cost_codes: o.codes,
});

/* Today, not a fixed day. The board opens on "this week", so a
   fixture pinned to a date silently goes out of range the moment the
   week rolls over — this test passed for weeks and then failed one
   morning with nothing changed but the calendar. */
const DATE = new Date().toISOString().slice(0, 10);

const DAYS = [
  /* Six lines over five trucks — one truck was touched twice, which
     is why the list is shorter than the line count. */
  day({ id: "m1", who: "Donald Bradley", emp: "5565", date: DATE,
        clock: 9.33, booked: 9.33, lines: 6,
        units: ["DT-808", "Shop cleanup / housekeeping", "DT-885", "DT-887", "DT-896"],
        codes: ["885", "SHOP-CB", "835", "SHOP-CF"] }),
  /* Two lines, both shop, one code. */
  day({ id: "m2", who: "Nick Shifflet", emp: "37243", date: DATE,
        clock: 8.85, booked: 8.85, lines: 2,
        units: ["Other shop time", "Parts run / pickup"], codes: ["SHOP-CF"] }),
  /* One truck, one code — the ordinary row. */
  day({ id: "m3", who: "Stevie Winkler", emp: "43810", date: DATE,
        clock: 1.25, booked: 1.25, lines: 1,
        units: ["DT-890"], codes: ["830"] }),
  /* Still on the clock, nothing booked. The cells have to be a dash. */
  day({ id: "m4", who: "Tyler Coffey", emp: "6340", date: DATE,
        clock: 0, booked: 0, lines: 0, open: true, units: [], codes: [] }),
];

const rows = {
  tw_timecard_days: DAYS,
  tw_mechanics: [{ id: BOSS.id, name: BOSS.name, email: BOSS.email, active: true,
                   pin_set: true, emp_no: "1000", supervisor: true }],
  tw_time_entries: [], tw_hours: [], tw_shifts: [], tw_shift_days: [],
  tw_on_clock: [], tw_timecard_approvals: [], tw_work_log: [],
  tw_cost_codes: [], tw_vehicles: [], tw_payroll_lines: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
await ctx.addInitScript(new Function(
  `localStorage.setItem("tirewear:who", ${JSON.stringify(BOSS.email)});`
  /* Past the supervisor PIN. The gate is tested in test-pins; what is
     being looked at here is the table behind it. */
  + `localStorage.setItem("tirewear:supervisor", JSON.stringify(`
  + `{ id: ${JSON.stringify(BOSS.id)}, name: ${JSON.stringify(BOSS.name)},`
  + `  email: ${JSON.stringify(BOSS.email)}, at: Date.now() }));`
));
await fakeRest(ctx, { rows });

const page = await ctx.newPage();
const crashes = [], rest400 = [];
page.on("pageerror", (e) => crashes.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Supervisor", exact: true }).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Timecards", exact: true }).first().click();
await page.waitForTimeout(2000);

let t = await page.locator("body").innerText();
ok("the card board opens", /Timecards/i.test(t) && /Donald Bradley/.test(t), t.slice(0, 200));
ok("no rejected reads", rest400.length === 0, rest400.join("\n    "));

/* ── the columns exist ────────────────────────────────────────── */
console.log("\n── the two new columns ──");
const heads = await page.locator("table thead th").allInnerTexts();
ok("there is a column for what was worked on",
  heads.some((h) => /worked on/i.test(h)), heads.join(" | "));
ok("…and one for the cost codes",
  heads.some((h) => /cost code/i.test(h)), heads.join(" | "));
/* Beside Lines, not at the far end past Approved — the count and what
   is behind it belong together. */
const iLines = heads.findIndex((h) => /^lines$/i.test(h));
const iWorked = heads.findIndex((h) => /worked on/i.test(h));
const iCodes = heads.findIndex((h) => /cost code/i.test(h));
const iAppr = heads.findIndex((h) => /approved/i.test(h));
ok("they sit straight after Lines",
  iWorked === iLines + 1 && iCodes === iWorked + 1, `${iLines}/${iWorked}/${iCodes}`);
ok("…and before Approved", iCodes < iAppr, `${iCodes} vs ${iAppr}`);

const rowFor = (name) => page.locator("table tbody tr").filter({ hasText: name }).first();
const cell = async (name, i) => (await rowFor(name).locator("td").nth(i).innerText()).trim();

/* ── a day with more on it than fits ──────────────────────────── */
console.log("\n── six lines over five trucks ──");
let worked = await cell("Donald Bradley", iWorked);
ok("the first three are named", /DT-808/.test(worked) && /DT-885/.test(worked), worked);
ok("…and the rest are counted, not listed",
  /\+2 more/.test(worked) && !/DT-896/.test(worked), worked);
ok("the whole list is still reachable on hover",
  /DT-896/.test(await rowFor("Donald Bradley").locator("td").nth(iWorked).getAttribute("title")),
  await rowFor("Donald Bradley").locator("td").nth(iWorked).getAttribute("title"));
let codes = await cell("Donald Bradley", iCodes);
ok("the codes are there too", /885/.test(codes) && /SHOP-CB/.test(codes), codes);
ok("…and counted the same way", /\+1 more/.test(codes), codes);

/* ── a day that fits ──────────────────────────────────────────── */
console.log("\n── a day that fits in the cell ──");
worked = await cell("Nick Shifflet", iWorked);
ok("both are shown", /Other shop time/.test(worked) && /Parts run/.test(worked), worked);
ok("…with nothing counted", !/more/.test(worked), worked);
ok("one code reads as one code",
  (await cell("Nick Shifflet", iCodes)) === "SHOP-CF", await cell("Nick Shifflet", iCodes));
ok("a single truck reads as a single truck",
  (await cell("Stevie Winkler", iWorked)) === "DT-890", await cell("Stevie Winkler", iWorked));

/* ── nothing booked yet ───────────────────────────────────────── */
console.log("\n── a card still on the clock with nothing on it ──");
ok("the unit cell is a dash, not an empty box",
  (await cell("Tyler Coffey", iWorked)) === "—", await cell("Tyler Coffey", iWorked));
ok("…and so is the code cell",
  (await cell("Tyler Coffey", iCodes)) === "—", await cell("Tyler Coffey", iCodes));
ok("…and it does not claim more of anything",
  !/more/.test(await rowFor("Tyler Coffey").innerText()));

/* ── the rest of the row still works ──────────────────────────── */
console.log("\n── and the columns that were already there ──");
const dal = await rowFor("Donald Bradley").innerText();
ok("the line count is still shown", /\b6\b/.test(dal), dal.replace(/\s+/g, " "));
ok("the hours are still shown", /9\.33/.test(dal), dal.replace(/\s+/g, " "));
ok("and the row still offers to approve", /APPROVE/i.test(dal), dal.replace(/\s+/g, " "));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
