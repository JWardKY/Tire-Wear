/* Tire Wear has no login, so its tables are readable and writable by the
   anon key that ships in the browser bundle. Those tables share a Supabase
   project with the QC app, the bid history and purchasing — this checks
   that the hole is exactly the size it is meant to be, and no larger.

   Run after any RLS change:
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

// Tire Wear's own tables. The app is anonymous, so these must be reachable.
const OPEN_BY_DESIGN = [
  "tw_vehicles", "tw_tires", "tw_tread_readings",
  "tw_odometer_log", "tw_settings", "tw_tire_brands",
];

// Already anonymous before Tire Wear existed — the Haul Cycle Tracker has no
// login either. Listed so it does not read as a regression.
const ALREADY_OPEN = ["hct_jobs"];

// Everything else sharing this project. None of it is ours to expose.
const MUST_STAY_CLOSED = [
  "volumetric_tests", "gradation_results", "msg_readings", "bsg_readings",
  "aggregate_gradation_tests", "mix_designs", "mix_components", "testers",
  "projects", "contracts", "contract_bid_items", "cores", "performance_tests",
  "bid_items", "bid_bids", "bid_projects", "bid_item_bids", "bid_state_avg_prices",
  "po_orders", "po_invoices", "po_lines", "po_invoice_lines",
];

const rows = async (t) => {
  const { data, error } = await c.from(t).select("*").limit(1);
  return error ? -1 : data.length;
};

let bad = 0;

for (const t of OPEN_BY_DESIGN) {
  if ((await rows(t)) < 0) { bad++; console.log(`  !!  ${t} — the app cannot read this`); }
  else console.log(`  ok  ${t} reachable by the app`);
}

console.log("");
for (const t of ALREADY_OPEN) {
  console.log(`  --  ${t} anon by design, predates Tire Wear`);
}

console.log("");
for (const t of MUST_STAY_CLOSED) {
  if ((await rows(t)) > 0) { bad++; console.log(`  !!  ${t} EXPOSED to anon`); }
  else console.log(`  ok  ${t} closed`);
}

console.log(bad ? `\n${bad} problem(s)` : "\nanon reaches the tw_ tables and nothing else");
process.exit(bad ? 1 : 0);
