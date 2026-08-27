import { supabase } from "./supabase.js";

/* Every read pages explicitly. PostgREST caps a single response at 1000
   rows, and tread readings pass that inside a couple of seasons — a
   silent truncation there would quietly wrong every wear rate on screen. */
const PAGE = 1000;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export async function fetchAll(table, columns, orderBy) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (orderBy) q = q.order(orderBy);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/* ── Row shapes ↔ the shapes the components already speak ─────── */

const toVehicle = (r) => ({
  id: r.id,
  num: r.number,
  make: r.make || "",
  model: r.model || "",
  year: r.model_year || "",
  div: r.division,
  cfg: r.axle_config,
  motiveId: r.motive_vehicle_id,
});

const toTire = (r, vehNumById) => ({
  id: r.id,
  vehId: r.vehicle_id,
  veh: vehNumById[r.vehicle_id],
  pos: r.position,
  brand: r.brand || "",
  model: r.model || "",
  size: r.size || "",
  type: r.tire_type,
  casing: r.casing_id || "",
  newDepth: r.mounted_depth == null ? null : Number(r.mounted_depth),
  onDate: r.mounted_date,
  onOdo: r.mounted_odometer,
  cost: r.cost == null ? null : Number(r.cost),
  offDate: r.removed_date,
  offOdo: r.removed_odometer,
  offReason: r.removed_reason,
  notes: r.notes || "",
});

const toReading = (r) => ({
  id: r.id,
  tire: r.tire_id,
  date: r.reading_date,
  odo: r.odometer,
  d: Number(r.depth_32nds),
});

const toOdo = (r, vehNumById) => ({
  id: r.id,
  vehId: r.vehicle_id,
  veh: vehNumById[r.vehicle_id],
  date: r.reading_date,
  odo: r.odometer,
  source: r.source,
});

const toSettings = (r) => ({
  pullSteer: Number(r.pull_steer_32nds),
  pullOther: Number(r.pull_other_32nds),
  newDepth: Number(r.default_new_depth),
});

/* The wear math lives in the tw_tire_wear view so the app and anything
   built off the database later cannot drift apart on the number that
   matters. The app only applies the pull threshold on top. */
const toWear = (r) => ({
  points: r.point_count,
  firstOdo: r.first_odometer,
  firstDepth: r.first_depth == null ? null : Number(r.first_depth),
  depth: r.last_depth == null ? null : Number(r.last_depth),
  miles: r.miles_run,
  worn: r.worn_32nds == null ? null : Number(r.worn_32nds),
  miPer32: r.miles_per_32nd == null ? null : Number(r.miles_per_32nd),
  miPerMil: r.miles_per_mil == null ? null : Number(r.miles_per_mil),
});

/* ── Load ─────────────────────────────────────────────────────── */

export async function loadAll() {
  const [vehRows, tireRows, readingRows, odoRows, wearRows, brandRows, setRows] =
    await Promise.all([
      fetchAll("tw_vehicles", "*", "number"),
      fetchAll("tw_tires", "*"),
      fetchAll("tw_tread_readings", "*"),
      fetchAll("tw_odometer_log", "*"),
      fetchAll("tw_tire_wear", "*"),
      fetchAll("tw_tire_brands", "*", "sort_order"),
      fetchAll("tw_settings", "*"),
    ]);

  const vehicles = vehRows.filter((r) => r.active).map(toVehicle);
  const vehNumById = Object.fromEntries(vehRows.map((r) => [r.id, r.number]));

  const wear = {};
  wearRows.forEach((r) => { wear[r.tire_id] = toWear(r); });

  return {
    vehicles,
    tires: tireRows.map((r) => toTire(r, vehNumById)),
    readings: readingRows.map(toReading),
    odos: odoRows.map((r) => toOdo(r, vehNumById)),
    wear,
    brands: brandRows.filter((b) => b.active).map((b) => b.name),
    settings: setRows.length
      ? toSettings(setRows[0])
      : { pullSteer: 6, pullOther: 4, newDepth: 28 },
  };
}

/* ── Writes ───────────────────────────────────────────────────── */

function check({ error }) {
  if (error) throw error;
}

export async function setVehicleConfig(vehicleId, cfg) {
  check(
    await supabase
      .from("tw_vehicles")
      .update({ axle_config: cfg, updated_at: new Date().toISOString() })
      .eq("id", vehicleId)
  );
}

export async function mountTire(vehicleId, t, who) {
  check(
    await supabase.from("tw_tires").insert({
      vehicle_id: vehicleId,
      position: t.pos,
      brand: t.brand || null,
      model: t.model || null,
      size: t.size || null,
      tire_type: t.type,
      casing_id: t.casing || null,
      mounted_date: t.onDate,
      mounted_odometer: t.onOdo,
      mounted_depth: t.newDepth,
      cost: t.cost,
      notes: t.notes || null,
      created_by: who,
    })
  );
}

/* The note lives on the tire, so it is overwritten rather than appended
   to — a dated observation belongs on a reading instead. */
export async function setTireNotes(tireId, notes) {
  check(
    await supabase
      .from("tw_tires")
      .update({ notes: notes.trim() || null })
      .eq("id", tireId)
  );
}

export async function pullTire(tireId, off) {
  check(
    await supabase
      .from("tw_tires")
      .update({
        removed_date: off.offDate,
        removed_odometer: off.offOdo,
        removed_reason: off.offReason,
      })
      .eq("id", tireId)
  );
}

/* One walk-around: a depth per tire plus the odometer it was taken at.
   Upsert rather than insert so re-entering a corrected depth at the same
   odometer fixes the reading instead of failing on the unique index. */
export async function saveInspection(vehicleId, date, odo, entries, who) {
  if (entries.length) {
    check(
      await supabase.from("tw_tread_readings").upsert(
        entries.map((e) => ({
          tire_id: e.tireId,
          reading_date: date,
          odometer: odo,
          depth_32nds: e.depth,
          recorded_by: who,
        })),
        { onConflict: "tire_id,odometer" }
      )
    );
  }
  check(
    await supabase.from("tw_odometer_log").upsert(
      {
        vehicle_id: vehicleId,
        reading_date: date,
        odometer: odo,
        source: "inspection",
        recorded_by: who,
      },
      { onConflict: "vehicle_id,reading_date,odometer", ignoreDuplicates: true }
    )
  );
}

export async function deleteReading(id) {
  check(await supabase.from("tw_tread_readings").delete().eq("id", id));
}

export async function logOdometer(vehicleId, date, odo, who) {
  check(
    await supabase.from("tw_odometer_log").upsert(
      {
        vehicle_id: vehicleId,
        reading_date: date,
        odometer: odo,
        source: "manual",
        recorded_by: who,
      },
      { onConflict: "vehicle_id,reading_date,odometer", ignoreDuplicates: true }
    )
  );
}

export async function updateSettings(patch) {
  const cols = {};
  if (patch.pullSteer != null) cols.pull_steer_32nds = patch.pullSteer;
  if (patch.pullOther != null) cols.pull_other_32nds = patch.pullOther;
  if (patch.newDepth != null) cols.default_new_depth = patch.newDepth;
  cols.updated_at = new Date().toISOString();
  check(await supabase.from("tw_settings").update(cols).eq("id", true));
}

/* Deletes every tire (readings cascade) and the whole mileage log.
   Axle configs stay: those are corrections people made truck by truck
   and are not tire data. */
export async function eraseAll() {
  check(await supabase.from("tw_tread_readings").delete().neq("id", ZERO_UUID));
  check(await supabase.from("tw_tires").delete().neq("id", ZERO_UUID));
  check(await supabase.from("tw_odometer_log").delete().neq("id", ZERO_UUID));
}

