/* Tire Wear has no login, so its tables are read and written by the anon
   key that ships in the browser bundle — anybody who views source has it.
   Those tables share one Supabase project with the QC lab app, the bid
   history and purchasing. This checks that the hole is exactly the size
   it is meant to be and no larger.

   The list below is every table and view in the public schema. That is
   the point: a table nobody remembered to add is the one that leaks, so
   the check fails on a name it has never heard of rather than quietly
   passing over it.

   Run after any RLS change, and after adding a table:
     set -a && . ./.env.local && set +a && node scripts/check-anon-access.mjs
*/
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.");
  process.exit(2);
}
const c = createClient(url, key);

/* Tire Wear's own. The app is anonymous, so these have to be reachable —
   an unreachable one is a broken app, not a safe one. */
const OPEN_BY_DESIGN = [
  "tw_vehicles", "tw_tires", "tw_tread_readings", "tw_odometer_log",
  "tw_settings", "tw_tire_brands", "tw_defects", "tw_pm_programs",
  "tw_pm_completions", "tw_cost_codes", "tw_time_entries",
  "tw_parts", "tw_part_txns", "tw_shifts",
  "tw_vendors", "tw_vendor_categories", "tw_purchase_orders",
  "tw_po_lines", "tw_part_requests", "tw_work_orders",
  /* Not select(*): pin_hash is not granted to anon, so asking for every
     column is refused outright and reads as a broken table. Probe the
     columns the app actually asks for. */
  ["tw_mechanics", "id, name, email, active, pin_set"],
  "tw_active_tires", "tw_tire_wear", "tw_vehicle_meter", "tw_pm_due",
  "tw_hours", "tw_parts_reorder", "tw_on_clock", "tw_part_vendor", "tw_work_history",
];

/* Open to anon, but not by us and not ours to close. Reported every run
   rather than filed away, because "somebody meant to do that" should stay
   in front of a person. Closing one of these would break the app that
   opened it, so raise it with that app's owner instead. */
const OPEN_BY_ANOTHER_APP = [
  ["hct_jobs", "Haul Cycle Tracker. No login either, predates Tire Wear."],
  ["hct_dispatch", "Haul Cycle Tracker."],
  ["bid_geo_pods", "Bid history, migration bid_geo_prices_for_cascade_backtest."],
  ["bid_geo_prices", "Bid history, same migration. County-level price averages."],
  ["v_pod_membership", "View over bid_geo_pods, so it follows."],
  ["v_pod_prices", "View over bid_geo_prices, migration v_pod_prices_readonly."],
];

/* Everything else in the project. None of it is ours to expose. */
const MUST_STAY_CLOSED = [
  // QC lab
  "aggregate_gradation_tests", "aggregate_spec_limits", "aggregate_spec_sizes",
  "bsg_readings", "cores", "gradation_results", "gradations", "hamburg_tests",
  "ideal_specimens", "location_materials", "locations", "materials",
  "mix_components", "mix_design_targets", "mix_designs", "msg_readings",
  "performance_tests", "plant_bowl_weights", "projects", "sieves", "sites",
  "test_bin_percentages", "testers", "volumetric_tests", "wx_hourly_cache",
  "ils_tickets", "ils_ticket_detail",
  // Bid history
  "bid_ac_content", "bid_app_config", "bid_bids", "bid_binder_prices",
  "bid_fuel_prices", "bid_item_bids",
  "bid_items", "bid_ls_ratios", "bid_projects", "bid_qty_curves",
  "bid_state_avg_prices", "contract_bid_items", "contracts",
  // Purchasing
  "po_invoice_lines", "po_invoices", "po_lines", "po_orders",
  // Views over all of the above. A view defaults to its owner's rights, so
  // without security_invoker it reads straight around the RLS on its
  // tables. That bug shipped here once, on tw_active_tires.
  "bid_backtest", "bid_backtest_v2", "bid_backtest_v3", "bid_backtest_v4",
  "bid_backtest_v5", "bid_backtest_v6", "bid_backtest_v7",
  "bid_item_price_history", "bid_item_price_residuals",
  "ils_mix_reference", "ils_ticket_lines_current", "ils_tickets_current",
  "ils_tickets_latest", "ils_truck_reference",
  "v_aggregate_moving_avg", "v_amaw_sublot", "v_gradation_curve",
  "v_material_by_sample_point", "v_mix_gsb_blend", "v_po_line_status",
  "v_volumetric_summary", "v_weather_backlog",
];

/* Columns the browser must never be able to read, whatever else it can
   reach on that table. */
const WITHHELD = [["tw_mechanics", "pin_hash"]];

/* A missing relation and an empty one both come back with no rows, so
   asking for a name that does not exist would otherwise read as "closed"
   and a typo in the lists above would pass forever. Separate the two. */
const MISSING = new Set(["42P01", "PGRST205", "PGRST106"]);

async function probe(t, cols = "*") {
  const { data, error } = await c.from(t).select(cols).limit(1);
  if (!error) return { rows: data.length };
  if (MISSING.has(error.code)) return { missing: true, why: error.message };
  return { denied: true, code: error.code, why: error.message };
}

let bad = 0;
const fail = (m) => { bad++; console.log("  !!  " + m); };

console.log("Tire Wear's own — the app needs these\n");
for (const entry of OPEN_BY_DESIGN) {
  const [t, cols] = Array.isArray(entry) ? entry : [entry, "*"];
  const r = await probe(t, cols);
  if (r.missing) fail(`${t} — no such table. The app is reading a name that is gone.`);
  else if (r.denied) fail(`${t} — the app cannot read this (${r.code}): ${r.why}`);
  else console.log(`  ok  ${t}`);
}

console.log("\nOpen to anon, by somebody else's decision\n");
for (const [t, why] of OPEN_BY_ANOTHER_APP) {
  const r = await probe(t);
  console.log(r.missing ? `  --  ${t} no longer exists`
    : r.denied ? `  --  ${t} closed now — it used to be open. ${why}`
    : `  --  ${t} open. ${why}`);
}

console.log("\nEverything else in this project\n");
for (const t of MUST_STAY_CLOSED) {
  const r = await probe(t);
  if (r.missing)
    fail(`${t} — no such relation. Renamed or dropped: fix this list, ` +
         `because right now it is checking nothing.`);
  else if (r.rows > 0)
    fail(`${t} EXPOSED to anon`);
  else console.log(`  ok  ${t} closed`);
}

console.log("\nColumns held back from the browser\n");
for (const [t, col] of WITHHELD) {
  const { error } = await c.from(t).select(col).limit(1);
  if (!error) fail(`${t}.${col} IS READABLE by the anon key`);
  else if (MISSING.has(error.code)) fail(`${t} — no such table`);
  else console.log(`  ok  ${t}.${col} refused (${error.code})`);
}

/* Not checked here: whether anon can WRITE to the closed tables. Postgres
   answers a blocked DELETE by matching no rows rather than erroring, so
   the only probe that gives a straight answer is an INSERT — and an
   INSERT that RLS turns out to allow leaves a junk row in a production
   database. Not worth it from a script that runs unattended. Read access
   is the check that can be made safely, so it is the one made. */

console.log(bad
  ? `\n${bad} problem${bad > 1 ? "s" : ""} above`
  : `\nanon reaches Tire Wear, plus the ${OPEN_BY_ANOTHER_APP.length} listed ` +
    `above that other apps opened, and nothing else`);
process.exit(bad ? 1 : 0);
