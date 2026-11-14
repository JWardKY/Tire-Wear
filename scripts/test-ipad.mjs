/* The app on an iPad, every screen.
   ─────────────────────────────────────────────────────────────────
   Most of the shop uses this on an iPad: 810 wide standing up, 1080 on
   its side. This opens every section and every sub-tab at both sizes
   and checks the three things that make a page fight a finger:

     1. Nothing pushes the page sideways. A table or a row of buttons
        wider than the screen makes the whole page slide under your
        thumb; a wide table belongs in its own scrolling box.
     2. Things you tap are at least 44px tall — Apple's own minimum.
     3. Text boxes are set at 16px or more. Below that, iOS zooms the
        whole page in the moment you tap one, and does not zoom back.

   `npm run build` passes on all three, which is why this exists.

   Run the built app first:
     VITE_SUPABASE_URL=https://example.supabase.co \
     VITE_SUPABASE_ANON_KEY=placeholder npm run build
     npx vite preview --port 4173 &
     node scripts/test-ipad.mjs            # add --report to list every hit
*/
const { chromium } = await import("playwright-core");
const { fakeRest, CHROME } = await import("./_fakerest.mjs");

const URL_ = process.env.APP_URL || "http://localhost:4173/";
const REPORT = process.argv.includes("--report");
const isoOf = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const TODAY = isoOf(new Date());

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };

/* Borrowed from test-truckboard.mjs — one truck with a full file —
   plus what the other screens read. */
const V = "v881";
const rows = {
  tw_vehicles: [
    { id: V, number: "DT-881", make: "Mack", model: "Granite", model_year: 2019,
      division: "DT", axle_config: "dump12", motive_vehicle_id: "mv1", active: true,
      notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
    { id: "v1881", number: "DT-1881", make: "Mack", model: "Granite", model_year: 2021,
      division: "DT", axle_config: "dump12", motive_vehicle_id: null, active: true,
      notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
    { id: "v864", number: "DT-864", make: "Mack", model: "Granite", model_year: 2017,
      division: "DT", axle_config: "dump12", motive_vehicle_id: null, active: true,
      notes: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
  ],
  tw_vehicle_meter: [
    { vehicle_id: V, truck: "DT-881", current_odometer: 412350,
      odometer_date: "2026-09-01", odometer_source: "motive" },
  ],
  /* 4RI at 27/32 beside 4RO at 15/32 — the pair that started this. */
  tw_active_tires: [
    { tire_id: "t3", vehicle_id: V, position: "4RI", current_depth: 27, pull_depth: 4,
      miles_run: 30000, miles_per_32nd: 12000, est_miles_remaining: 200000 },
    { tire_id: "t4", vehicle_id: V, position: "4RO", current_depth: 15, pull_depth: 4,
      miles_run: 30000, miles_per_32nd: 6000, est_miles_remaining: 60000 },
    { tire_id: "t1", vehicle_id: V, position: "1L", current_depth: 22, pull_depth: 6,
      miles_run: 32000, miles_per_32nd: 5000, est_miles_remaining: 80000 },
  ],
  tw_settings: [{ id: true, pull_steer_32nds: 6, pull_other_32nds: 4,
    default_new_depth: 28, dual_match_32nds: 4, alert_emails: [],
    updated_at: "2026-01-01" }],
  tw_tires: [
    { id: "t3", vehicle_id: V, position: "4RI", brand: "Continental", model: null,
      size: "11R24.5", tire_type: "virgin", wheel_material: null, casing_id: null,
      mounted_date: "2026-01-02", mounted_odometer: 382000, mounted_depth: 28,
      cost: 410, removed_date: null, removed_odometer: null, removed_reason: null,
      notes: null, created_by: null, created_at: "2026-01-02" },
    { id: "t4", vehicle_id: V, position: "4RO", brand: "Continental", model: null,
      size: "11R24.5", tire_type: "retread", wheel_material: null, casing_id: null,
      mounted_date: "2026-01-02", mounted_odometer: 382000, mounted_depth: 22,
      cost: 260, removed_date: null, removed_odometer: null, removed_reason: null,
      notes: null, created_by: null, created_at: "2026-01-02" },
    { id: "t1", vehicle_id: V, position: "1L", brand: "Continental", model: "HSR",
      size: "425/65R22.5", tire_type: "virgin", wheel_material: "aluminum",
      casing_id: null, mounted_date: "2026-02-01", mounted_odometer: 380000,
      mounted_depth: 28, cost: 620, removed_date: null, removed_odometer: null,
      removed_reason: null, notes: "Sidewall plug", created_by: null, created_at: "2026-02-01" },
    { id: "t2", vehicle_id: V, position: "4RO", brand: "Bridgestone", model: null,
      size: "11R24.5", tire_type: "retread", wheel_material: null, casing_id: null,
      mounted_date: "2025-06-01", mounted_odometer: 300000, mounted_depth: 22,
      cost: 310, removed_date: "2026-03-15", removed_odometer: 386000,
      removed_reason: "Worn out", notes: null, created_by: null, created_at: "2025-06-01" },
  ],
  tw_defects: [
    { id: "d1", vehicle_id: V, unit_number: "DT-881", state: "open", safety: "unsafe",
      category: "Brake Accessories", note: "Chamber leaking air", driver: "R. Hall",
      source: "motive", defect_key: "k1", first_reported: "2026-09-11T08:00:00Z",
      last_reported: "2026-09-11T08:00:00Z", report_count: 3, priority: "now",
      work_order: "WO-26-0024", claimed_by: null, claimed_at: null, repaired_by: null,
      repaired_at: null, repair_note: null, repair_hours: null, closed_at: null,
      location: null, severity: "major", created_at: "2026-09-11T08:00:00Z",
      created_by: null, updated_at: "2026-09-11T08:00:00Z" },
    { id: "d2", vehicle_id: V, unit_number: "DT-881", state: "repaired", safety: "safe",
      category: "Lights", note: "Marker out", driver: "R. Hall", source: "motive",
      defect_key: "k2", first_reported: "2026-08-01T08:00:00Z",
      last_reported: "2026-08-01T08:00:00Z", report_count: 1, priority: "today",
      work_order: "", claimed_by: null, claimed_at: null, repaired_by: "Dylan Barnes",
      repaired_at: "2026-08-03T15:00:00Z", repair_note: "New marker", repair_hours: 0.5,
      closed_at: "2026-08-03T15:00:00Z", location: null, severity: "minor",
      created_at: "2026-08-01T08:00:00Z", created_by: null, updated_at: "2026-08-03T15:00:00Z" },
    /* Synced for a unit the roster has not matched: text only, no
       vehicle_id. Reading on vehicle_id alone would lose it. */
    { id: "d3", vehicle_id: null, unit_number: "DT-881", state: "open", safety: "safe",
      category: "Heater", note: "Blower noisy", driver: "R. Hall", source: "motive",
      defect_key: "k3", first_reported: "2026-09-12T08:00:00Z",
      last_reported: "2026-09-12T08:00:00Z", report_count: 1, priority: "", work_order: "",
      claimed_by: null, claimed_at: null, repaired_by: null, repaired_at: null,
      repair_note: null, repair_hours: null, closed_at: null, location: null,
      severity: "minor", created_at: "2026-09-12T08:00:00Z", created_by: null,
      updated_at: "2026-09-12T08:00:00Z" },
  ],
  tw_work_orders: [
    { id: "w1", vehicle_id: V, unit_number: "DT-881", wo_number: "WO-26-0024",
      kind: "repair", title: "Brake chamber", detail: "Left rear leaking",
      priority: "now", state: "in progress", created_at: "2026-09-11T09:00:00Z",
      started_at: "2026-09-11T10:00:00Z", completed_at: null, completed_by: null,
      completion_note: null, assigned_to: "m1", assigned_name: "Dylan Barnes",
      assigned_at: "2026-09-11T09:30:00Z", hold_reason: "Waiting on parts",
      hold_since: "2026-09-12T09:00:00Z", source_key: null, created_by: null,
      updated_at: "2026-09-12T09:00:00Z" },
    { id: "w2", vehicle_id: V, unit_number: "DT-881", wo_number: "WO-26-0009",
      kind: "repair", title: "Marker light", detail: "", priority: "today",
      state: "done", created_at: "2026-08-01T09:00:00Z", started_at: "2026-08-03T09:00:00Z",
      completed_at: "2026-08-03T15:00:00Z", completed_by: "Dylan Barnes",
      completion_note: "Replaced", assigned_to: "m1", assigned_name: "Dylan Barnes",
      assigned_at: "2026-08-01T09:30:00Z", hold_reason: null, hold_since: null,
      source_key: null, created_by: null, updated_at: "2026-08-03T15:00:00Z" },
  ],
  tw_pm_due: [
    { vehicle_id: V, truck: "DT-881", division: "DT", program_id: "g1", program: "A service",
      category: "Engine", level: "over", due_date: "2026-09-01", due_at_odometer: 410000,
      miles_remaining: -2350, days_remaining: -12, interval_miles: 15000,
      interval_months: null, lead_miles: 1000, lead_days: 7, est_hours: 2,
      last_date: "2026-06-01", last_odometer: 395000, last_by: "Will Strong",
      last_engine_hours: null, current_odometer: 412350, odometer_date: "2026-09-01" },
    { vehicle_id: V, truck: "DT-881", division: "DT", program_id: "g2", program: "Greasing",
      category: "Chassis", level: "ok", due_date: "2026-11-01", due_at_odometer: 430000,
      miles_remaining: 17650, days_remaining: 48, interval_miles: 20000,
      interval_months: null, lead_miles: 1000, lead_days: 7, est_hours: 1,
      last_date: "2026-08-01", last_odometer: 410000, last_by: "Dylan Barnes",
      last_engine_hours: null, current_odometer: 412350, odometer_date: "2026-09-01" },
  ],
  tw_pm_programs: [
    { id: "g1", name: "A service", category: "Engine" },
    { id: "g2", name: "Greasing", category: "Chassis" },
  ],
  tw_pm_completions: [
    { id: "c1", vehicle_id: V, program_id: "g1", done_date: "2026-06-01",
      done_odometer: 395000, engine_hours: 9100, hours: 2.5, done_by: "Will Strong",
      note: "Oil and filters", created_at: "2026-06-01T12:00:00Z" },
    { id: "c2", vehicle_id: V, program_id: "g2", done_date: "2026-08-01",
      done_odometer: 410000, engine_hours: null, hours: 1, done_by: "Dylan Barnes",
      note: "", created_at: "2026-08-01T12:00:00Z" },
  ],
  tw_hours: [
    { id: "h1", work_date: "2026-08-03", hours: 3.5, cost_code: "800",
      cost_code_name: "Brake System", code_group: "Equipment", where_worked: "shop",
      job_location: null, work_order: "WO-26-0009", note: null,
      work_performed: "Replaced marker light", work_types: ["Repair"],
      mechanic: "Dylan Barnes", mechanic_id: "m1", unit: "DT-881", vehicle_id: V },
    { id: "h2", work_date: "2026-08-03", hours: 2, cost_code: "800",
      cost_code_name: "Brake System", code_group: "Equipment", where_worked: "shop",
      job_location: null, work_order: "WO-26-0009", note: "Second pair of hands",
      work_performed: null, work_types: [], mechanic: "Will Strong", mechanic_id: "m2",
      unit: "DT-881", vehicle_id: V },
    { id: "h3", work_date: "2026-09-12", hours: 4.25, cost_code: "600",
      cost_code_name: "Tires", code_group: "Equipment", where_worked: "road",
      job_location: "Danville yard", work_order: "WO-26-0024", note: null,
      work_performed: "Chased an air leak", work_types: ["Road call"],
      mechanic: "Dylan Barnes", mechanic_id: "m1", unit: "DT-881", vehicle_id: V },
    /* Booked against the typed label with no roster match. */
    { id: "h4", work_date: "2026-07-04", hours: 1.25, cost_code: "600",
      cost_code_name: "Tires", code_group: "Equipment", where_worked: "shop",
      job_location: null, work_order: "", note: "Swapped a recap",
      work_performed: null, work_types: ["Tires"], mechanic: "Will Strong",
      mechanic_id: "m2", unit: "DT-881", vehicle_id: null },
    /* Another truck entirely. It must not land in this file. */
    { id: "h9", work_date: "2026-09-12", hours: 8, cost_code: "600",
      cost_code_name: "Tires", code_group: "Equipment", where_worked: "shop",
      job_location: null, work_order: "", note: "Not this truck",
      work_performed: null, work_types: [], mechanic: "Dylan Barnes",
      mechanic_id: "m1", unit: "DT-864", vehicle_id: "v864" },
  ],
  tw_part_txns: [
    { id: "x1", part_id: "p1", qty_delta: -2, kind: "issue", who: "Dylan Barnes",
      work_order: "WO-26-0009", note: null, created_at: "2026-08-03T14:00:00Z",
      vehicle_id: V },
    { id: "x2", part_id: "p2", qty_delta: 40, kind: "receive", who: "Store",
      work_order: null, note: null, created_at: "2026-08-04T14:00:00Z", vehicle_id: V },
  ],
  tw_parts: [
    { id: "p1", part_number: "LMP-441", name: "Marker lamp, amber", category: "Lighting",
      uom: "each", unit_cost: 12.4 },
    { id: "p2", part_number: "OIL-15W40", name: "Engine oil", category: "Fluids",
      uom: "gal", unit_cost: 9.1 },
  ],
  tw_odometer_log: [
    { id: "o1", vehicle_id: V, reading_date: "2026-09-01", odometer: 412350,
      source: "motive", recorded_by: null },
    { id: "o2", vehicle_id: V, reading_date: "2026-06-01", odometer: 395000,
      source: "inspection", recorded_by: "Will Strong" },
  ],
  tw_work_history: [
    { at: "2026-09-12T13:00:00Z", kind: "hours", what: "Hours booked", unit: "DT-881",
      vehicle_id: V, summary: "4.25h · 600 · chased an air leak", who: "Dylan Barnes",
      work_order: "WO-26-0024", hours: 4.25, source_id: "h3" },
    { at: "2026-08-03T15:00:00Z", kind: "defect", what: "Defect repaired", unit: "DT-881",
      vehicle_id: V, summary: "Lights — New marker", who: "Dylan Barnes",
      work_order: "", hours: 0.5, source_id: "d2" },
    { at: "2026-08-03T14:00:00Z", kind: "parts", what: "Parts issued", unit: "DT-881",
      vehicle_id: V, summary: "2 × LMP-441 — Marker lamp, amber", who: "Dylan Barnes",
      work_order: "WO-26-0009", hours: null, source_id: "x1" },
    { at: "2026-06-01T12:00:00Z", kind: "pm", what: "Service completed", unit: "DT-881",
      vehicle_id: V, summary: "A service at 395000 miles", who: "Will Strong",
      work_order: null, hours: 2.5, source_id: "c1" },
  ],
  tw_tread_readings: [], tw_tire_wear: [], tw_part_requests: [],
  /* What the truck file's fixture lacks and the other screens read. */
  tw_mechanics: [
    { id: "m1", name: "Dylan Barnes", email: "dylan_barnes@theallen.com", emp_no: "1041",
      cell_phone: "859-555-0101", role: "mechanic", active: true, pin_set: true,
      locked_until: null, created_at: "2026-01-01", motive_user_id: null, pay_group: "SHOP",
      pay_class: "MECH2", pay_class_name: "Mechanic II", pay_job: null, pay_job_name: null },
    { id: "m2", name: "Will Strong", email: "will_strong@theallen.com", emp_no: "1042",
      cell_phone: null, role: "mechanic", active: true, pin_set: true, locked_until: null,
      created_at: "2026-01-01", motive_user_id: null, pay_group: "SHOP", pay_class: "MECH1",
      pay_class_name: "Mechanic I", pay_job: null, pay_job_name: null },
    { id: "m9", name: "Jason Ward", email: "jason_ward@theallen.com", emp_no: "1000",
      cell_phone: null, role: "admin", active: true, pin_set: true, locked_until: null,
      created_at: "2026-01-01", motive_user_id: null, pay_group: "SALARY", pay_class: "SUPT",
      pay_class_name: "Superintendent", pay_job: null, pay_job_name: null },
  ],
  tw_cost_codes: [
    { code: "800", name: "Brake System", code_group: "Equipment", active: true, sort: 1,
      job_number: null, job_name: null },
    { code: "600", name: "Tires", code_group: "Equipment", active: true, sort: 2,
      job_number: null, job_name: null },
    { code: "SHOP-CF", name: "Clays Ferry shop", code_group: "Shop", active: true, sort: 3,
      job_number: "100710.", job_name: "Clay's Ferry Shop" },
  ],
  tw_tire_brands: [{ name: "Continental", sort: 1 }, { name: "Bridgestone", sort: 2 }],
  tw_on_clock: [
    { id: "s1", mechanic_id: "m1", mechanic: "Dylan Barnes", mechanic_email: "dylan_barnes@theallen.com",
      started_at: new Date(Date.now() - 3 * 3600e3).toISOString(), note: null,
      started_on: TODAY, stale: false, in_lat: 38.04, in_lng: -84.5, in_accuracy_m: 12, in_geo_note: null },
  ],
  tw_shifts: [], tw_shift_days: [], tw_time_entries: [], tw_timecard_approvals: [],
  tw_timecard_days: [
    { mechanic_id: "m1", mechanic: "Dylan Barnes", emp_no: "1041", work_date: TODAY,
      clock_hours: 8.5, booked_hours: 7.75, true_hours: 8.5, difference: 0.75, lines: 3,
      uncoded_lines: 0, uncoded_hours: 0, first_in: null, last_out: null, still_open: false,
      approved: false, changed_since_approved: false, approved_by: null, approved_at: null,
      last_edit: null, units: ["DT-881", "DT-864"], cost_codes: ["800", "600"] },
  ],
  tw_payroll_lines: [], tw_work_log: [], tw_work_order_crew: [{ work_order: "w1", mechanic_id: "m1" }],
  tw_defects_open: [], tw_tires_due_out: [], tw_tire_alerts: [], tw_tire_models: [],
  tw_vendors: [{ id: "vn1", name: "FleetPride", email: "orders@example.invalid", phone: null, notes: null, active: true }],
  tw_vendor_categories: [], tw_purchase_orders: [], tw_po_lines: [], tw_part_vendor: [],
  tw_parts_reorder: [], tw_day_summary: [],
};

/* Every section and sub-tab, as sections.jsx lists them. */
const PAGES = [
  ["Now"],
  ["Timecard", ["Today", "Driving", "My jobs", "My history", "My PIN"]],
  ["Defects", ["Open", "Waiting on Motive", "Closed"]],
  ["PM", ["Due", "History", "Programs"]],
  ["Work orders", ["Work orders", "Work history"]],
  ["Tires", ["Fleet", "Analysis", "Tire catalog", "Settings"]],
  ["Truck file"],
  ["Inventory", ["Reorder", "Order parts", "All parts", "Requests", "Issued", "Vendors", "Import"]],
  ["Supervisor", ["Totals", "Every entry", "Timecards", "Work log", "Mechanics", "Cost codes", "Equipment"]],
  ["Help"],
];

const SIZES = [["iPad standing up", 810, 1080], ["iPad on its side", 1080, 810]];
/* A desktop pass checks layout only: a mouse does not need 44px. */
const DESKTOP = ["desktop", 1440, 900];

try {
  const r = await fetch(URL_, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`SKIPPED — nothing serving ${URL_} (${e.message}).`);
  process.exit(3);
}

const browser = await chromium.launch({ executablePath: CHROME });

/* What is wrong with the page in front of us. Read in the page. */
function measure() {
  const W = window.innerWidth;
  const label = (e) => (e.getAttribute("aria-label") || e.innerText || e.value || e.placeholder
    || e.name || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
  };
  /* Inside a box that scrolls or clips on its own, a wide child is fine:
     the box moves, the page does not. */
  const contained = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
    }
    return false;
  };
  const wide = [];
  for (const e of document.querySelectorAll("#root *")) {
    if (!shown(e) || contained(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right <= W + 1) continue;
    const p = e.parentElement && e.parentElement.getBoundingClientRect();
    if (p && p.right > W + 1) continue;          // the parent is already the culprit
    wide.push(`${e.tagName.toLowerCase()} "${label(e)}" +${Math.round(r.right - W)}px`);
  }
  const taps = [...document.querySelectorAll(
    "#root button, #root a[href], #root select, #root textarea, " +
    "#root input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file])")]
    .filter(shown)
    /* An inline text button or link is tapped through its ::after, which index.css
       makes 44px tall; that box is what a finger meets. */
    .filter((e) => {
      if (!e.classList.contains("text-link")) return e.getBoundingClientRect().height < 44;
      return parseFloat(getComputedStyle(e, "::after").height) < 44;
    })
    .map((e) => `${e.tagName.toLowerCase()} "${label(e)}" ${Math.round(e.getBoundingClientRect().height)}px`);
  const zoom = [...document.querySelectorAll("#root input, #root select, #root textarea")]
    .filter(shown)
    .filter((e) => !["checkbox", "radio", "hidden", "file", "button", "submit"].includes(e.type))
    .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16)
    .map((e) => `${e.tagName.toLowerCase()} "${label(e)}" ${getComputedStyle(e).fontSize}`);
  /* A dropdown squeezed until it shows nothing but its arrow. A table
     with too many columns for an iPad standing up gives the squeeze to
     whatever has no minimum — the roster's Role box went first. */
  const squashed = [...document.querySelectorAll("#root select")]
    .filter(shown)
    .filter((e) => {
      const text = e.options[e.selectedIndex]?.text || "";
      return text && e.clientWidth < 70;
    })
    .map((e) => `select "${label(e)}" ${e.clientWidth}px wide`);

  /* Content that starts left of the page's own title. A section that
     skipped the shared 1400px column sat against the window's edge while
     its title sat in the column — on a wide screen it looked broken. */
  let left = 0;
  const h1 = document.querySelector(".no-print h1");
  const root = document.querySelector(".no-print")?.nextElementSibling;
  if (h1 && root) {
    const edge = h1.getBoundingClientRect().left;
    let min = Infinity;
    for (const e of root.querySelectorAll("*")) {
      if (!shown(e) || getComputedStyle(e).position === "fixed" || contained(e)) continue;
      min = Math.min(min, e.getBoundingClientRect().left);
    }
    if (min < edge - 2) left = Math.round(edge - min);
  }
  return { scroll: document.documentElement.scrollWidth - W, wide, taps, zoom, left, squashed };
}

async function openSection(page, name) {
  if (name === "Help") return page.getByRole("button", { name: "Help", exact: true }).click();
  const tab = page.getByRole("button", { name, exact: true }).first();
  if (await tab.isVisible()) return tab.click();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

const totals = { wide: 0, taps: 0, zoom: 0, left: 0 };
for (const [sizeName, w, h] of [...SIZES, DESKTOP]) {
  const touch = sizeName !== "desktop";
  console.log(`\n── ${sizeName} (${w}×${h}) ──`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  await ctx.addInitScript(new Function(
    `localStorage.setItem("tirewear:who", "jason_ward@theallen.com");` +
    `sessionStorage.setItem("tirewear:timecard-unlocked", ${JSON.stringify(JSON.stringify(
      { id: "m1", name: "Dylan Barnes", email: "dylan_barnes@theallen.com" }))});` +
    `localStorage.setItem("tirewear:supervisor", ${JSON.stringify(JSON.stringify(
      { id: "m9", name: "Jason Ward", email: "jason_ward@theallen.com", role: "admin", at: Date.now() }))});`));
  await fakeRest(ctx, { rows });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  for (const [section, subs] of PAGES) {
    await openSection(page, section);
    await page.waitForTimeout(700);
    for (const sub of subs || [null]) {
      if (sub) {
        await page.getByRole("navigation", { name: section })
          .getByRole("button", { name: sub, exact: true }).click();
        await page.waitForTimeout(700);
      }
      const where = sub ? `${section} › ${sub}` : section;
      const m = await page.evaluate(measure);
      if (!touch) { m.taps = []; m.zoom = []; }
      totals.wide += m.wide.length; totals.taps += m.taps.length; totals.zoom += m.zoom.length;
      totals.left += m.left ? 1 : 0;
      if (REPORT) {
        console.log(`\n${where}: scroll +${m.scroll}px, ${m.wide.length} wide, ${m.taps.length} small taps, ${m.zoom.length} zooming inputs${m.left ? `, starts ${m.left}px left of its title` : ""}`);
        for (const x of m.wide) console.log(`    wide  ${x}`);
        for (const x of m.taps) console.log(`    tap   ${x}`);
        for (const x of m.zoom) console.log(`    zoom  ${x}`);
        for (const x of m.squashed) console.log(`    squashed  ${x}`);
      } else {
        ok(`${where} does not scroll sideways`, m.scroll <= 1 && !m.wide.length, m.wide.join("; "));
        ok(`${where} lines up under its title`, !m.left, `${m.left}px left of it`);
        if (!touch) continue;
        ok(`${where}: everything tappable is 44px tall`, !m.taps.length, m.taps.slice(0, 6).join("; "));
        ok(`${where}: no text box makes iOS zoom`, !m.zoom.length, m.zoom.slice(0, 6).join("; "));
        ok(`${where}: no dropdown squeezed to nothing`, !m.squashed.length, m.squashed.join("; "));
      }
    }
  }
  console.log("page errors:", errors.length ? errors : "none");
  bad += errors.length;
  await ctx.close();
}

/* The supervisor tab locked: the PIN screen, which a signed-in run
   never sees. */
for (const [sizeName, w, h] of [SIZES[0], DESKTOP]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => localStorage.setItem("tirewear:who", "jason_ward@theallen.com"));
  await fakeRest(ctx, { rows });
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await openSection(page, "Supervisor");
  await page.waitForTimeout(700);
  const m = await page.evaluate(measure);
  const where = `Supervisor, locked (${sizeName})`;
  if (REPORT) console.log(`\n${where}: starts ${m.left}px left of its title, ${m.taps.length} small taps`);
  else {
    ok(`${where} lines up under its title`, !m.left, `${m.left}px left of it`);
    ok(`${where} does not scroll sideways`, m.scroll <= 1 && !m.wide.length, m.wide.join("; "));
  }
  totals.left += m.left ? 1 : 0;
  await ctx.close();
}

await browser.close();
if (REPORT) console.log(`\nTOTAL: ${totals.wide} wide, ${totals.taps} small taps, ${totals.zoom} zooming inputs, ${totals.left} pages left of their title`);
console.log(bad ? `\n${bad} FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
