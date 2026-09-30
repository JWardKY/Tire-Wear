/* A work order as a printable page, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-workorderpage.mjs holds the arithmetic and the wording.
   This holds the page: that clicking a work order number opens the
   whole job rather than a strip of costs under the row, and that what
   comes out of the printer is the job and not the app's chrome.

   The board used to expand a line under the row with the parts and the
   hours on it. That answered "what has it cost" and nothing else — not
   what is wrong with the truck, not what has already been tried, not
   who has been on it — and it could not be printed, which is what a
   shop actually does with a job: put it on the dash and write on it.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-orderpage.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const WO = "WO-26-0051";
const rows = {
  tw_work_orders: [
    { id: "w1", wo_number: WO, kind: "defect", source_key: null, vehicle_id: "v1",
      unit_number: "DT-893", title: "Tires", priority: "now", state: "in progress",
      detail: "Right rear duals down to the cords. Driver reports a thump at speed.",
      assigned_to: "m1", assigned_name: "Dylan Barnes", assigned_at: "2026-09-26T12:00:00Z",
      started_at: "2026-09-28T12:00:00Z", completed_at: null, completed_by: null,
      completion_note: null, created_by: "Jason Ward", created_at: "2026-09-25T12:00:00Z",
      updated_at: "2026-09-28T12:00:00Z", hold_reason: null, hold_since: null },
    { id: "w2", wo_number: "WO-26-0052", kind: "defect", source_key: null, vehicle_id: "v2",
      unit_number: "HT-643", title: "Air leak", priority: "normal", state: "open",
      detail: null, assigned_to: null, assigned_name: "", assigned_at: null,
      started_at: null, completed_at: null, completed_by: null, completion_note: null,
      created_by: "Jason Ward", created_at: "2026-09-29T12:00:00Z",
      updated_at: "2026-09-29T12:00:00Z", hold_reason: null, hold_since: null },
  ],
  tw_work_order_crew: [
    { id: "c1", work_order: "w1", mechanic_id: "m2", mechanic_name: "Tyler Coffey",
      added_by: "Jason Ward", added_at: "2026-09-28T12:00:00Z" },
  ],
  /* Two days' work on the job, booked out of order — Donald's habit of
     keying the whole week on Friday is why the page groups by the day
     the work happened rather than the day it was entered. */
  tw_time_entries: [
    { id: "h2", mechanic_id: "m2", work_date: "2026-09-29", hours: 1.5,
      cost_code: "885", work_order: WO, note: null, unit_seconds: 5400, stints: [],
      work_performed: "Refitted and road tested, thump gone.",
      where_worked: "shop", work_types: [], vehicle_id: "v1", unit_label: null,
      job_location: null, defect_id: null, pm_program_id: null,
      created_at: "2026-09-29T21:00:00Z", updated_at: "2026-09-29T21:00:00Z" },
    { id: "h1", mechanic_id: "m1", work_date: "2026-09-28", hours: 2.5,
      cost_code: "885", work_order: WO, note: null, unit_seconds: 9000, stints: [],
      work_performed: "Pulled both duals, rim cracked on the inner.",
      where_worked: "shop", work_types: [], vehicle_id: "v1", unit_label: null,
      job_location: null, defect_id: null, pm_program_id: null,
      created_at: "2026-09-30T21:00:00Z", updated_at: "2026-09-30T21:00:00Z" },
  ],
  tw_part_txns: [
    { id: "x1", part_id: "p1", kind: "issue", qty_delta: -2, work_order: WO,
      note: null, who: "Dylan Barnes", created_at: "2026-09-28T13:00:00Z" },
    { id: "x2", part_id: "p2", kind: "issue", qty_delta: -1, work_order: WO,
      note: null, who: "Dylan Barnes", created_at: "2026-09-28T13:05:00Z" },
  ],
  tw_parts: [
    { id: "p1", part_number: "11R245-D", name: "Drive tire 11R24.5", unit_cost: 655.24,
      uom: "each", on_hand: 8, active: true },
    /* No cost on file: the total has to say so rather than count it as
       zero, or somebody quotes the job short. */
    { id: "p2", part_number: "SEAL-9", name: "Hub seal", unit_cost: null,
      uom: "each", on_hand: 4, active: true },
  ],
  tw_mechanics: [
    { id: "m1", name: "Dylan Barnes", email: "d@x.com", active: true, pin_set: true },
    { id: "m2", name: "Tyler Coffey", email: "t@x.com", active: true, pin_set: true },
  ],
  tw_vehicles: [
    { id: "v1", number: "DT-893", make: "Mack", model: "Gu713", model_year: "2020",
      division: "DT", axle_config: "dump12", motive_vehicle_id: null,
      motive_asset_id: null, active: true, notes: null,
      created_at: "2026-01-01", updated_at: "2026-01-01" },
    { id: "v2", number: "HT-643", make: "Intl", model: "4300", model_year: "2011",
      division: "HT", axle_config: "single6", motive_vehicle_id: null,
      motive_asset_id: null, active: true, notes: null,
      created_at: "2026-01-01", updated_at: "2026-01-01" },
  ],
  tw_work_log: [], tw_defects: [], tw_part_requests: [], tw_vendors: [],
  tw_purchase_orders: [], tw_po_lines: [], tw_parts_reorder: [], tw_part_vendor: [],
};

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1400 } });
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
await page.getByRole("button", { name: "Work orders", exact: true }).first().click();
await page.waitForTimeout(2000);

let t = await page.locator("body").innerText();
ok("the board opens", new RegExp(WO).test(t), t.slice(0, 200));
ok("no rejected reads", rest400.length === 0, rest400.join(" "));

/* ── clicking the number opens the job ────────────────────────── */
console.log("\n── the number opens the whole job ──");
await page.getByRole("button", { name: WO, exact: true }).first().click();
await page.waitForTimeout(1500);
t = await page.locator("body").innerText();

ok("the other order is no longer on screen — this is a page, not a strip",
  !/WO-26-0052/.test(t), (t.match(/WO-26-\d+/g) || []).join());
ok("the truck is on it", /DT-893/.test(t));
/* What is wrong with it: the thing the old strip never showed. */
ok("what needs doing is on it", /What needs doing/i.test(t));
ok("…including the detail somebody wrote", /down to the cords/i.test(t), t.slice(0, 200));

console.log("\n── where it stands ──");
ok("it says in progress, not just 'open'", /In progress/i.test(t),
  (t.match(/[^\n]*progress[^\n]*/i) || [""])[0]);
ok("…and who is on it, both of them",
  /Dylan Barnes/.test(t) && /Tyler Coffey/.test(t));
ok("…and who raised it", /Jason Ward/.test(t));

console.log("\n── what has been done, in their own words ──");
ok("the first day's work", /Pulled both duals/.test(t));
ok("…and the last", /Refitted and road tested/.test(t));
/* Booked out of order on purpose: h1 was keyed after h2. The story has
   to read forwards by the day the work happened. */
ok("…in the order it happened, not the order it was keyed",
  t.indexOf("Pulled both duals") < t.indexOf("Refitted and road tested"));

console.log("\n── the numbers ──");
ok("labour totals four hours", /4\.00 h/.test(t), (t.match(/[\d.]+ h/g) || []).join(" "));
ok("parts total the one with a price on it",
  /1,310\.48/.test(t), (t.match(/\$[\d,.]+/g) || []).join(" "));
/* The seal has no cost on file. Counting it as zero would quote the
   job short and nobody would know. */
ok("…and says the seal is not in that figure",
  /no cost on file/i.test(t), (t.match(/[^\n]*cost on file[^\n]*/i) || [""])[0]);
ok("both parts are listed all the same",
  /Drive tire/.test(t) && /Hub seal/.test(t));

/* ── it prints ────────────────────────────────────────────────── */
console.log("\n── and it prints ──");
ok("there is a print button",
  (await page.getByRole("button", { name: /^PRINT$/i }).count()) > 0);

await page.emulateMedia({ media: "print" });
await page.waitForTimeout(400);
const onPaper = await page.evaluate(() => {
  const vis = (el) => {
    if (!el) return false;
    /* An ancestor set to display:none hides a child whose own computed
       display is still "block", so walk up rather than trusting the
       element alone. */
    for (let e = el; e && e !== document.documentElement; e = e.parentElement)
      if (getComputedStyle(e).display === "none") return false;
    return el.getBoundingClientRect().height > 0;
  };
  /* The innermost element holding the text, rather than any element
     whose textContent contains it — that matches <body> too, which is
     visible whatever the block inside it is doing, and is how this test
     first passed against a page that printed none of it. Innermost
     rather than leaf because "Signed" sits beside its own rule line. */
  const text = (re) => [...document.querySelectorAll("*")]
    .filter((e) => re.test(e.textContent || "")
      && ![...e.children].some((c) => re.test(c.textContent || "")))
    .some(vis);
  const btn = [...document.querySelectorAll("button")]
    .find((b) => /^PRINT$/i.test((b.textContent || "").trim()));
  return {
    chrome: vis(btn),
    letterhead: text(/Haul Division/),
    notes: text(/Notes from the floor/),
    signed: text(/Signed/),
    job: text(/down to the cords/),
  };
});
ok("the app's buttons do not come out of the printer", !onPaper.chrome, onPaper);
ok("…but the job does", onPaper.job, onPaper);
/* A sheet on a dash with no heading comes out of the printer
   anonymous. */
ok("the sheet says what it is", onPaper.letterhead, onPaper);
/* Somebody is going to write on this whatever the app does. */
ok("…and leaves room to write on", onPaper.notes && onPaper.signed, onPaper);
await page.emulateMedia({ media: "screen" });

/* ── and back ─────────────────────────────────────────────────── */
console.log("\n── back to the board ──");
await page.getByRole("button", { name: /ALL WORK ORDERS/i }).click();
await page.waitForTimeout(900);
t = await page.locator("body").innerText();
ok("both orders are there again", new RegExp(WO).test(t) && /WO-26-0052/.test(t));

/* An order nobody has touched must say so rather than print two empty
   tables under a heading. */
console.log("\n── an order nobody has started ──");
await page.getByRole("button", { name: "WO-26-0052", exact: true }).first().click();
await page.waitForTimeout(1400);
t = await page.locator("body").innerText();
ok("it says nothing is booked to it yet", /Nothing booked to this order yet/i.test(t),
  (t.match(/[^\n]*Nothing booked[^\n]*/i) || [""])[0]);
ok("…and that nobody is on it", /Nobody yet/i.test(t));
ok("…and how long it has been sitting", /Not started/i.test(t),
  (t.match(/Not started[^\n]*/) || [""])[0]);
ok("no empty totals are printed", !/Total labour/.test(t) && !/Total parts/.test(t));

ok("nothing threw", crashes.length === 0, crashes.join(" | "));

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
