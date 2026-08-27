/* Runs a sync. Reads Motive, works out what would change, and either
   reports that or writes it.

   Everything here is idempotent. Odometer rows collide on
   (vehicle_id, reading_date, odometer) and are ignored on conflict, and
   defects collide on defect_key. So running twice is the same as running
   once, and a run that dies halfway can just be run again. */

import { createClient } from "@supabase/supabase-js";
import {
  fetchVehicleOdometers, fetchInspectionDefects,
  planOdometer, planDefects, compareOdometers,
  todayISO, WHICH_ODOMETER,
} from "./motive.mjs";

export function env() {
  const motiveKey = process.env.MOTIVE_API_KEY;
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  const missing = [
    !motiveKey && "MOTIVE_API_KEY",
    !url && "VITE_SUPABASE_URL",
    !key && "VITE_SUPABASE_ANON_KEY",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Not configured: ${missing.join(", ")} is not set`);
  return { motiveKey, db: createClient(url, key) };
}

/* PostgREST caps a response at 1000 rows and says nothing about it, so
   page explicitly. Same trap as the tire data layer. */
async function all(db, table, cols, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols)
      .order(order, { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/* The highest odometer we already hold per truck, from the log and from
   what tyres were mounted at. Both matter: a tire mounted at 412,000 is
   evidence the truck has at least that many miles even if the log is
   empty, and a synced reading below it would produce negative miles run. */
async function latestOdometers(db) {
  const latest = new Map();
  const keep = (id, v) => {
    if (v == null) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    if (!latest.has(id) || n > latest.get(id)) latest.set(id, n);
  };
  for (const r of await all(db, "tw_odometer_log", "vehicle_id,odometer", "vehicle_id"))
    keep(r.vehicle_id, r.odometer);
  for (const r of await all(db, "tw_tires", "vehicle_id,mounted_odometer,removed_odometer", "vehicle_id")) {
    keep(r.vehicle_id, r.mounted_odometer);
    keep(r.vehicle_id, r.removed_odometer);
  }
  return latest;
}

export async function runOdometer({ motiveKey, db }, { write, field }) {
  const [fromMotive, vehicles, latest] = await Promise.all([
    fetchVehicleOdometers(motiveKey),
    all(db, "tw_vehicles", "id,number,motive_vehicle_id,active", "number"),
    latestOdometers(db),
  ]);

  const plan = planOdometer(fromMotive, vehicles, latest, field || WHICH_ODOMETER);
  const out = {
    field: field || WHICH_ODOMETER,
    motiveReturned: fromMotive.length,
    ourVehicles: vehicles.length,
    wouldWrite: plan.write.length,
    backwards: plan.backwards,
    unmatched: plan.unmatched,
    noReading: plan.noReading.length,
    /* Both fields against the readings people typed in, so the choice of
       field is checkable rather than taken on trust. */
    fieldCheck: compareOdometers(fromMotive, vehicles, latest).slice(0, 40),
    sample: plan.write.slice(0, 5).map((r) => ({
      unit: r._unit, odometer: r.odometer, date: r.reading_date, gained: r._gain,
    })),
  };
  if (!write) return { dryRun: true, ...out };

  const rows = plan.write.map(({ _unit, _gain, ...r }) => r);
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    /* select() rather than a count: with ignoreDuplicates PostgREST
       returns minimal and the count comes back null, which would read as
       "wrote nothing" on a run that wrote everything. The rows it hands
       back are the ones actually inserted, duplicates already dropped. */
    const { data, error } = await db.from("tw_odometer_log")
      .upsert(rows.slice(i, i + 200), {
        onConflict: "vehicle_id,reading_date,odometer",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw error;
    written += data?.length ?? 0;
  }
  return { dryRun: false, ...out, written, skippedAsDuplicate: rows.length - written };
}

export async function runDefects({ motiveKey, db }, { write, since }) {
  const start = since || daysAgo(14);
  const [fromMotive, vehicles, existing] = await Promise.all([
    fetchInspectionDefects(motiveKey, start),
    all(db, "tw_vehicles", "id,number,motive_vehicle_id,active", "number"),
    all(db, "tw_defects",
        "id,defect_key,unit_number,category,state,report_count,first_reported,last_reported",
        "defect_key"),
  ]);

  const plan = planDefects(fromMotive, vehicles, existing);
  const out = {
    since: start,
    motiveReturned: fromMotive.length,
    wouldCreate: plan.create.length,
    wouldBump: plan.bump.length,
    alreadyHave: plan.already.length,
    sample: plan.create.slice(0, 5).map((r) => ({
      unit: r.unit_number, category: r.category, safety: r.safety, on: r.first_reported,
    })),
  };
  if (!write) return { dryRun: true, ...out };

  let created = 0;
  for (let i = 0; i < plan.create.length; i += 200) {
    const { data, error } = await db.from("tw_defects")
      .upsert(plan.create.slice(i, i + 200),
              { onConflict: "defect_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    created += data?.length ?? 0;
  }
  for (const b of plan.bump) {
    const { id, unit, category, ...cols } = b;
    const { error } = await db.from("tw_defects")
      .update({ ...cols, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }
  return { dryRun: false, ...out, created, bumped: plan.bump.length };
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export { todayISO };
