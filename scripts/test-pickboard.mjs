/* Typing a unit number into the equipment box, in a real browser.
   ─────────────────────────────────────────────────────────────────
   scripts/test-pickunit.mjs holds the matching. This holds the part
   that only a browser shows: that the box takes typing at all, that
   the number on the door finds the truck, that Enter lands on it, and
   that what gets saved is the same value the old dropdown wrote — a
   card drafted before this change holds those strings.

   It is a select no more, so a test that drives it with selectOption
   would pass on a box nobody can type into. Everything here goes
   through the keyboard, the way a thumb does.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-pickboard.mjs
*/
import { chromium } from "playwright-core";
import { fakeRest, CHROME } from "./_fakerest.mjs";

const URL_ = process.env.APP_URL || "http://localhost:4173/";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

const MECH = { id: "m1", name: "Dylan Barnes", email: "dylan_barnes@theallen.com" };
const TODAY = new Date().toISOString().slice(0, 10);

/* A fleet big enough that scrolling is the problem this solves. */
const FLEET = [
  ["DT-874", "Kenworth", "T880"], ["DT-881", "Kenworth", "T880"],
  ["DT-899", "Peterbilt", "567"], ["DT-1881", "Peterbilt", "567"],
  ["HT-865", "Kenworth", "T880"], ["HT-102", "Mack", "Granite"],
];
const vehicles = FLEET.map(([number, make, model], i) => ({
  id: `v${i}`, number, make, model, model_year: 2023, division: number.slice(0, 2),
  axle_config: "dump12", motive_vehicle_id: null, active: true, notes: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
}));

const rows = {
  tw_vehicles: vehicles,
  tw_mechanics: [{ id: MECH.id, name: MECH.name, email: MECH.email,
                   active: true, pin_set: true }],
  /* Deliberately no code in the "Shop" group, so the shop list is
     empty — which is the state a truck shop is in before a supervisor
     files one, and the state in which picking shop time used to throw
     the draft away. */
  tw_cost_codes: [{ code: "5100", name: "Shop labour", active: true, group: "Labour" }],
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
/* A tablet, because that is what is propped on the fender. */
const ctx = await browser.newContext({
  viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false,
});
await ctx.addInitScript(new Function(
  `localStorage.setItem("tirewear:who", ${JSON.stringify(MECH.email)});`
  + `sessionStorage.setItem("tirewear:timecard-unlocked", ${JSON.stringify(
      JSON.stringify({ id: MECH.id, name: MECH.name, email: MECH.email }))});`
));
/* No draft clearing here: addInitScript runs on EVERY navigation, so a
   removeItem in it wipes the draft the reload is meant to prove came
   back. The context starts with empty storage anyway. */
await fakeRest(ctx, { rows });

const page = await ctx.newPage();
const crashes = [], rest400 = [];
page.on("pageerror", (e) => crashes.push(String(e)));
page.on("response", (r) => {
  if (r.url().includes("/rest/v1/") && r.status() === 400) rest400.push(r.url());
});

await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Timecard", exact: true }).first().click();
await page.waitForTimeout(2000);

let t = await page.locator("body").innerText();
ok("the timecard opens", /equipment/i.test(t), t.slice(0, 200));
ok("no rejected reads", rest400.length === 0, rest400.join(" "));
ok("no 'does not exist'", !/does not exist/i.test(t));

const box = page.getByLabel("Equipment").first();
ok("the equipment box is there", (await box.count()) > 0);

/* ── it takes typing ──────────────────────────────────────────── */
console.log("\n── typing the number on the door ──");
ok("it is something you can type into, not a dropdown",
   (await box.evaluate((el) => el.tagName)) === "INPUT",
   await box.evaluate((el) => el.tagName));
/* A tablet left to itself capitalises a truck number, corrects it and
   offers to spell it. */
ok("…with the tablet's helpfulness turned off",
   (await box.getAttribute("autocorrect")) === "off"
   && (await box.getAttribute("autocapitalize")) === "off"
   && (await box.getAttribute("spellcheck")) === "false",
   `${await box.getAttribute("autocorrect")}/${await box.getAttribute("autocapitalize")}`);
/* Under 16px and iOS zooms the whole page on focus. */
ok("…and a font size that does not make the page jump",
   parseFloat(await box.evaluate((el) => getComputedStyle(el).fontSize)) >= 16,
   await box.evaluate((el) => getComputedStyle(el).fontSize));

await box.click();
await page.waitForTimeout(400);
t = await page.locator("body").innerText();
ok("opening it does not dump the whole fleet on the screen",
   !/DT-874/.test(t) && !/DT-899/.test(t), (t.match(/DT-\d+/g) || []).join());
ok("…it says what to type", /Type a unit number/i.test(t));

await box.fill("881");
await page.waitForTimeout(500);
t = await page.locator("body").innerText();
ok("881 finds DT-881", /DT-881/.test(t));
ok("…and DT-1881 as well, since it contains it", /DT-1881/.test(t));
ok("…but not the trucks it has nothing to do with", !/HT-102/.test(t));
ok("…and it shows what the truck is, to check against the door",
   /Kenworth/.test(t), (t.match(/DT-881[^\n]*/) || [""])[0]);

/* ── Enter lands on it ────────────────────────────────────────── */
console.log("\n── and Enter takes the top one ──");
await box.press("Enter");
await page.waitForTimeout(600);
ok("the box now reads the truck",
   /DT-881/.test(await box.inputValue()), await box.inputValue());
t = await page.locator("body").innerText();
ok("…and the list is gone", !/DT-1881/.test(t));
ok("the card switched to a unit, not shop time", /Where the work happened/i.test(t));

/* ── the value it saves ───────────────────────────────────────── */
console.log("\n── what gets written down ──");
/* A card drafted before this change holds a vehicle id or "shop:Name".
   Those exact strings still have to come out, or every saved draft
   points at nothing. */
const draft = await page.evaluate((k) => localStorage.getItem(k),
  `tirewear:card:${MECH.id}:${TODAY}`);
ok("the draft holds the vehicle's id, as it always did",
   !!draft && JSON.parse(draft)[0]?.vehId === "v1",
   draft && JSON.parse(draft)[0]?.vehId);
ok("…and no shop work alongside it",
   !!draft && !JSON.parse(draft)[0]?.shopWork, draft);

/* ── shop time, which is words ────────────────────────────────── */
console.log("\n── shop time is in the same box ──");
await box.click();
await page.waitForTimeout(300);
await box.fill("clean");
await page.waitForTimeout(500);
t = await page.locator("body").innerText();
ok("a word reaches the shop and indirect list", /cleanup/i.test(t),
   (t.match(/[A-Za-z ]*clean[A-Za-z ]*/i) || ["(nothing)"])[0]);
await box.press("Enter");
await page.waitForTimeout(700);
t = await page.locator("body").innerText();
ok("picking it turns the card into shop time", /Which shop/i.test(t));
const draft2 = await page.evaluate((k) => localStorage.getItem(k),
  `tirewear:card:${MECH.id}:${TODAY}`);
ok("…and the draft says so the way it always did",
   !!draft2 && /cleanup/i.test(JSON.parse(draft2)[0]?.shopWork || ""),
   draft2 && JSON.parse(draft2)[0]?.shopWork);
ok("…with the vehicle cleared off it",
   !!draft2 && !JSON.parse(draft2)[0]?.vehId, draft2);

/* A card that is ONLY shop time used to count as empty, so the draft
   was deleted rather than kept, and backgrounding the tab lost it —
   the one thing the draft exists to stop. It is reachable whenever no
   shop has been filed under Cost codes, because that is what leaves
   the card with no cost code to make it look occupied. */
console.log("\n── a card that is only shop time is still a draft ──");
await page.evaluate((k) => localStorage.removeItem(k), `tirewear:card:${MECH.id}:${TODAY}`);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Timecard", exact: true }).first().click();
await page.waitForTimeout(1800);
const box2 = page.getByLabel("Equipment").first();
await box2.click();
await page.waitForTimeout(300);
await box2.fill("train");
await page.waitForTimeout(400);
await box2.press("Enter");
await page.waitForTimeout(800);
const only = await page.evaluate((k) => localStorage.getItem(k),
  `tirewear:card:${MECH.id}:${TODAY}`);
ok("it is kept, not thrown away",
   !!only && /Training/i.test(JSON.parse(only)[0]?.shopWork || ""), only);
/* Read back off the box, not off the page text: the restored value
   lives in an input, and innerText cannot see inside one. A test that
   looked at the page would pass on a card that came back blank. */
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Timecard", exact: true }).first().click();
await page.waitForTimeout(1800);
const back = await page.getByLabel("Equipment").first().inputValue();
ok("…and it comes back after the tab is discarded", /Training/i.test(back), back);

/* ── put away, then typed into again ──────────────────────────── */
/* Escape closes the list while the box still has focus. Typing after
   that has to bring it back, or the box goes quietly dead under
   somebody's hands with no way to tell what happened. */
console.log("\n── typing after putting the list away ──");
const box3 = page.getByLabel("Equipment").first();
await box3.click();
await page.waitForTimeout(300);
await box3.fill("88");
await page.waitForTimeout(400);
ok("the list is up", /DT-881/.test(await page.locator("body").innerText()));
await box3.press("Escape");
await page.waitForTimeout(400);
ok("…Escape puts it away", !/DT-1881/.test(await page.locator("body").innerText()));
await box3.press("1");
await page.waitForTimeout(500);
ok("…and typing brings it back", /DT-881/.test(await page.locator("body").innerText()),
   (await page.locator("body").innerText()).slice(0, 150));

/* ── nothing matching says so ─────────────────────────────────── */
console.log("\n── and when it is not there ──");
await box.click();
await page.waitForTimeout(300);
await box.fill("zzzz");
await page.waitForTimeout(500);
t = await page.locator("body").innerText();
ok("it says nothing matches rather than showing an empty box",
   /Nothing matches/i.test(t), t.slice(0, 200));
ok("nothing crashed", crashes.length === 0, crashes.join("\n    "));

await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
