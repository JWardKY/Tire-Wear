/* Recording how many times a casing has been capped, in a browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-retread.mjs holds the rule. This holds the part that
   only a form shows: that a retread cannot be mounted without an
   answer, that a virgin tire is never asked, that switching the type
   back does not leave a count behind on it, and that the number
   reaches the row.

   The last one matters because the database refuses a virgin tire
   with a cap count outright. A form that sent one would not write bad
   data — it would fail the save in front of somebody holding a tire.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-retreadboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const V = "v865";
const tire = (id, pos, type, caps) => ({
  id, vehicle_id: V, position: pos, brand: "Michelin", model: "XDN2",
  size: "11R24.5", tire_type: type, retread_count: caps, wheel_material: "aluminum",
  casing_id: null, mounted_date: "2026-09-14", mounted_odometer: 359086,
  mounted_depth: 28, cost: 480, removed_date: null, removed_odometer: null,
  removed_reason: null, notes: null, created_by: null, created_at: "2026-09-14",
});

const rows = {
  tw_vehicles: [{ id: V, number: "DT-865", make: "Kenworth", model: "T880",
    model_year: 2022, division: "DT", axle_config: "dump12",
    motive_vehicle_id: null, active: true, notes: null,
    created_at: "2026-01-01", updated_at: "2026-01-01" }],
  /* One counted retread, one of the 138 nobody was ever asked about,
     and a virgin tire. 4RI and the rest are free to mount onto. */
  tw_tires: [tire("t1", "4RO", "retread", 2), tire("t2", "4LO", "retread", null),
             tire("t3", "3RO", "virgin", null)],
  tw_tread_readings: [], tw_tire_wear: [], tw_odometer_log: [],
  tw_tire_brands: [
    { id: "b1", name: "Michelin", sort_order: 1, active: true },
    { id: "b2", name: "Bandag", sort_order: 2, active: true },
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
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1400 } });
await ctx.addInitScript(() =>
  localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));
const { writes } = await fakeRest(ctx, { rows });

const page = await ctx.newPage();
const crashes = [], rest400 = [];
page.on("pageerror", (e) => crashes.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

/* By the options it holds, not by its index: the mount form and the
   edit form have a different number of selects ahead of it, and an
   index that is right on one silently picks the type box on the
   other. */
const capBox = (form) => form.locator("select")
  .filter({ has: page.locator('option', { hasText: "1st cap" }) }).first();

const openTruck = async () => {
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Tires", exact: true }).first().click();
  await page.waitForTimeout(1800);
  await page.getByText("DT-865").first().click();
  await page.waitForTimeout(1400);
};
await openTruck();

let t = await page.locator("body").innerText();
ok("the truck opens", /DT-865/.test(t));
ok("no rejected reads", rest400.length === 0, rest400.join(" "));
ok("no 'does not exist'", !/does not exist/i.test(t));

/* ── what the fleet already reads as ──────────────────────────── */
console.log("\n── the three kinds of tire on the truck ──");
const rowOf = async (pos) => {
  const tr = page.locator("table").last().locator("tr");
  for (let i = 0; i < await tr.count(); i++) {
    const text = (await tr.nth(i).innerText()).replace(/\s+/g, " ");
    if (new RegExp(`^${pos}\\b`).test(text)) return text;
  }
  return "";
};
ok("a counted retread says which cap", /Retread · 2nd cap/.test(await rowOf("4RO")),
   await rowOf("4RO"));
/* The 138 nobody was asked about must not read as a first cap. */
ok("one nobody recorded just says retread",
   /Retread(?! ·)/.test(await rowOf("4LO")) && !/cap/.test(await rowOf("4LO")),
   await rowOf("4LO"));
ok("a virgin tire says virgin", /Virgin/.test(await rowOf("3RO")), await rowOf("3RO"));

/* ── mounting one ─────────────────────────────────────────────── */
console.log("\n── mounting a retread ──");
await page.getByRole("button", { name: "Mount a tire" }).first().click();
await page.waitForTimeout(700);
const form = page.locator('div[style*="position: fixed"]').last();
t = await form.innerText();
ok("a new tire is not asked how many caps until it is a retread",
   !/Times capped/i.test(t), t.slice(0, 300));

await form.locator("select").first().selectOption("Bandag");
await form.locator('input[placeholder="M726, XDN2…"]').first().fill("BDM");
await form.locator('input[type="number"]').nth(0).fill("22");
await form.locator('input[type="number"]').nth(1).fill("359086");
await page.waitForTimeout(400);
const mountBtn = page.getByRole("button", { name: /^Mount tire$/i });
ok("a virgin tire is ready to mount", !(await mountBtn.isDisabled()));

/* Switch it to a retread and the question appears. */
const typeSel = form.locator("select").nth(1);
await typeSel.selectOption("retread");
await page.waitForTimeout(400);
t = await form.innerText();
ok("choosing retread asks how many times", /Times capped/i.test(t), t.slice(0, 400));
ok("…and it will not save until that is answered", await mountBtn.isDisabled());
ok("…and nothing has been written", writes.length === 0, `${writes.length}`);

/* Switching back must not leave the question, or a count, behind. */
await typeSel.selectOption("virgin");
await page.waitForTimeout(400);
ok("switching back to virgin drops the question",
   !/Times capped/i.test(await form.innerText()));
ok("…and it can save again", !(await mountBtn.isDisabled()));

await typeSel.selectOption("retread");
await page.waitForTimeout(300);
const capSel = capBox(form);
const caps = await capSel.locator("option").allInnerTexts();
ok("it offers first through fourth cap",
   /1st cap/.test(caps.join()) && /4th cap/.test(caps.join())
   && !/5th cap/.test(caps.join()), caps.join(" | "));
await capSel.selectOption("3");
await page.waitForTimeout(400);
ok("answering it lets the tire be mounted", !(await mountBtn.isDisabled()));

await mountBtn.click();
await page.waitForTimeout(1800);
const posted = writes.filter((w) => w.table === "tw_tires" && w.method === "POST");
ok("one tire was mounted", posted.length === 1, `${posted.length}`);
const body = Array.isArray(posted[0]?.body) ? posted[0].body[0] : posted[0]?.body;
ok("…as a retread", body?.tire_type === "retread", JSON.stringify(body));
ok("…with the cap count on the row, as a number",
   body?.retread_count === 3, JSON.stringify(body?.retread_count));

/* ── and a virgin tire never carries one ──────────────────────── */
console.log("\n── a virgin tire sends no count ──");
rows.tw_tires = [tire("t1", "4RO", "retread", 2)];
writes.length = 0;
await openTruck();
await page.getByRole("button", { name: "Mount a tire" }).first().click();
await page.waitForTimeout(700);
const f2 = page.locator('div[style*="position: fixed"]').last();
await f2.locator("select").first().selectOption("Bandag");
await f2.locator('input[type="number"]').nth(0).fill("22");
await f2.locator('input[type="number"]').nth(1).fill("359086");
/* Pick a cap, then change your mind about the type. The database
   refuses a virgin tire with a count, so a form that kept it would
   fail the save in front of somebody holding a tire. */
await f2.locator("select").nth(1).selectOption("retread");
await page.waitForTimeout(300);
await capBox(f2).selectOption("2");
await page.waitForTimeout(300);
await f2.locator("select").nth(1).selectOption("virgin");
await page.waitForTimeout(400);
await page.getByRole("button", { name: /^Mount tire$/i }).click();
await page.waitForTimeout(1800);
const p2 = writes.filter((w) => w.table === "tw_tires" && w.method === "POST");
const b2 = Array.isArray(p2[0]?.body) ? p2[0].body[0] : p2[0]?.body;
ok("the tire is mounted", p2.length === 1, `${p2.length}`);
ok("…as virgin", b2?.tire_type === "virgin", JSON.stringify(b2?.tire_type));
ok("…carrying no cap count at all",
   b2?.retread_count === null || b2?.retread_count === undefined,
   JSON.stringify(b2?.retread_count));

/* ── the edit form comes back on what the tire actually is ────── */
/* A form that quietly resets a field nobody touched is worse than one
   that cannot edit it: open a 2nd-cap retread to fix a typo, and the
   count must not be blank when you get there. */
console.log("\n── opening a counted retread to edit it ──");
rows.tw_tires = [tire("t1", "4RO", "retread", 2)];
writes.length = 0;
await openTruck();
await page.getByRole("button", { name: "4RO", exact: true }).first().click();
await page.waitForTimeout(900);
await page.getByRole("button", { name: /Edit these details/i }).click();
await page.waitForTimeout(700);
const fEdit = page.locator('div[style*="position: fixed"]').last();
ok("the cap count comes back on the tire's own number",
   (await capBox(fEdit).inputValue()) === "2", await capBox(fEdit).inputValue());
/* And saving without touching it must not wipe it. */
await fEdit.locator('input[placeholder="M726, XDN2…"]').first().fill("XDN2+");
await page.getByRole("button", { name: /Save changes/i }).click();
await page.waitForTimeout(1600);
const kept = writes.filter((w) => w.table === "tw_tires" && w.method === "PATCH");
ok("…and a save that only changed the model keeps it",
   kept[0]?.body?.retread_count === 2, JSON.stringify(kept[0]?.body?.retread_count));

/* ── and the edit form drops it too when the type changes ─────── */
/* Somebody opens a retread, works out it was a virgin tire all along
   and switches it. The database refuses a virgin tire carrying a cap
   count, so a form that kept the old one would fail the save in front
   of them rather than write bad data. */
console.log("\n── switching a counted retread to virgin ──");
rows.tw_tires = [tire("t1", "4RO", "retread", 2)];
writes.length = 0;
await openTruck();
await page.getByRole("button", { name: "4RO", exact: true }).first().click();
await page.waitForTimeout(900);
await page.getByRole("button", { name: /Edit these details/i }).click();
await page.waitForTimeout(700);
const fSwitch = page.locator('div[style*="position: fixed"]').last();
ok("it starts on the count it had", (await capBox(fSwitch).inputValue()) === "2");
await fSwitch.locator("select").nth(2).selectOption("virgin");
await page.waitForTimeout(400);
ok("…and the question goes away with the type",
   !/Times capped/i.test(await fSwitch.innerText()));
await page.getByRole("button", { name: /Save changes/i }).click();
await page.waitForTimeout(1600);
const sw = writes.filter((w) => w.table === "tw_tires" && w.method === "PATCH");
ok("the change is written", sw.length === 1, `${sw.length}`);
ok("…as virgin", sw[0]?.body?.tire_type === "virgin", JSON.stringify(sw[0]?.body?.tire_type));
ok("…with the old cap count dropped, not carried over",
   sw[0]?.body?.retread_count === null, JSON.stringify(sw[0]?.body?.retread_count));

/* ── correcting one already on the truck ──────────────────────── */
console.log("\n── putting a count on one of the 138 ──");
rows.tw_tires = [tire("t2", "4LO", "retread", null)];
writes.length = 0;
await openTruck();
await page.getByRole("button", { name: "4LO", exact: true }).first().click();
await page.waitForTimeout(900);
t = await page.locator("body").innerText();
ok("the dialog says it is a retread with nothing recorded",
   /Retread/.test(t) && !/cap/.test(t), (t.match(/DT-865[^\n]*/) || [""])[0]);
await page.getByRole("button", { name: /Edit these details/i }).click();
await page.waitForTimeout(700);
const f3 = page.locator('div[style*="position: fixed"]').last();
t = await f3.innerText();
ok("the edit form asks", /Times capped/i.test(t));
/* It asks but does not insist. 138 of these exist and nobody can go
   back and ask; making it compulsory would mean somebody fixing a
   misspelt brand has to invent a number first. */
ok("…but does not block a save that leaves it blank",
   !(await page.getByRole("button", { name: /Save changes/i }).isDisabled()));
await capBox(f3).selectOption("1");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Save changes/i }).click();
await page.waitForTimeout(1800);
const patched = writes.filter((w) => w.table === "tw_tires" && w.method === "PATCH");
ok("the correction is written", patched.length === 1, `${patched.length}`);
ok("…with the cap count", patched[0]?.body?.retread_count === 1,
   JSON.stringify(patched[0]?.body?.retread_count));
const logged = writes.filter((w) => w.table === "tw_work_log").flatMap((w) => w.body);
ok("…and the work log says what changed",
   /times capped/i.test(logged[0]?.summary || ""), logged[0]?.summary);

ok("nothing crashed", crashes.length === 0, crashes.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
