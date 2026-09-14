import { supabase } from "./supabase.js";

/* ── One truck's whole file ────────────────────────────────────────
   Every screen in this system is organised around a job: the clock, the
   defect board, the parts shelf. This is the one organised around a
   truck. Somebody standing at DT-881 asking "what has been done to
   this thing" had to open five tabs and hold the answer in their head.

   Everything here is a read. Nothing on this page writes.

   ── Why two reads for the same thing ──────────────────────────────
   A row can name a truck two ways. `vehicle_id` is the roster match;
   `unit_number` (or `unit_label`, or the view's `unit`) is what somebody
   typed. Most rows have both, but a defect synced for a unit Motive
   knows and the roster does not has only the text, and an hour booked
   against a rental has only the label.

   Reading on one of them drops the other, and the whole point of a file
   is that it is complete. So the awkward ones are read twice and merged
   on the row id — two plain reads and a join in memory, which is the
   shape used everywhere else here, rather than an `or` filter that a
   test's fake database would quietly ignore. */

const check = ({ data, error }) => { if (error) throw error; return data || []; };

async function by(table, cols, order, vehId, unitCol, unitVal) {
  const one = (col, val) => {
    let q = supabase.from(table).select(cols).eq(col, val);
    if (order) q = q.order(order.col, { ascending: !!order.asc });
    return q;
  };
  const reads = [];
  if (vehId) reads.push(one("vehicle_id", vehId));
  if (unitVal) reads.push(one(unitCol, unitVal));
  const results = await Promise.all(reads);
  const seen = new Map();
  for (const r of results) for (const row of check(r)) seen.set(row.id, row);
  return [...seen.values()];
}

const num = (v) => (v == null ? null : Number(v));

/* The roster, for the box somebody types a truck number into. Inactive
   units are kept: a truck that has left the fleet still has a file, and
   "we sold it" is exactly when somebody goes looking for one. */
export async function listUnits() {
  const { data, error } = await supabase.from("tw_vehicles")
    .select("id,number,make,model,model_year,division,axle_config,active")
    .order("number");
  if (error) throw error;
  return (data || []).map((v) => ({
    id: v.id, num: v.number, make: v.make || "", model: v.model || "",
    year: v.model_year || "", div: v.division, cfg: v.axle_config,
    active: !!v.active,
  }));
}

export async function truckFile(unit) {
  const id = unit.id, num_ = unit.num;

  const [meter, tires, live, defects, orders, pmDue, completions, programs,
         hours, partTxns, odos, history, settings] = await Promise.all([
    supabase.from("tw_vehicle_meter")
      .select("vehicle_id,truck,current_odometer,odometer_date,odometer_source")
      .eq("vehicle_id", id).maybeSingle(),

    supabase.from("tw_tires").select("*").eq("vehicle_id", id)
      .order("mounted_date", { ascending: false }),

    /* Current tread, which tw_tires does not carry — it is the last
       reading, and the view already works it out. Without it the tires
       card could say what is mounted but not how worn it is, which is
       most of what somebody opens a truck's file to find out. */
    supabase.from("tw_active_tires")
      .select("tire_id,position,current_depth,pull_depth,miles_run,miles_per_32nd,est_miles_remaining")
      .eq("vehicle_id", id),

    by("tw_defects", "*", { col: "first_reported", asc: false },
       id, "unit_number", num_),

    by("tw_work_orders", "*", { col: "created_at", asc: false },
       id, "unit_number", num_),

    supabase.from("tw_pm_due").select("*").eq("vehicle_id", id),

    supabase.from("tw_pm_completions")
      .select("id,vehicle_id,program_id,done_date,done_odometer,engine_hours,hours,done_by,note,created_at")
      .eq("vehicle_id", id).order("done_date", { ascending: false }),

    supabase.from("tw_pm_programs").select("id,name,category"),

    by("tw_hours",
       "id,work_date,hours,cost_code,cost_code_name,code_group,where_worked,job_location," +
       "work_order,note,work_performed,work_types,mechanic,mechanic_id,unit,vehicle_id",
       { col: "work_date", asc: false }, id, "unit", num_),

    supabase.from("tw_part_txns")
      .select("id,part_id,qty_delta,kind,who,work_order,note,created_at,vehicle_id")
      .eq("vehicle_id", id).order("created_at", { ascending: false }),

    supabase.from("tw_odometer_log").select("id,reading_date,odometer,source,recorded_by")
      .eq("vehicle_id", id).order("odometer", { ascending: false }).limit(400),

    supabase.from("tw_work_history").select("*")
      .eq("unit", num_).order("at", { ascending: false }).limit(1000),

    /* The shop's own thresholds. Read here rather than defaulted in the
       roll-up, or this page and the Tires page would quietly disagree
       the moment somebody changed one. */
    supabase.from("tw_settings")
      .select("pull_steer_32nds,pull_other_32nds,dual_match_32nds").maybeSingle(),
  ]);

  for (const r of [meter, tires, live, pmDue, completions, programs, partTxns, odos,
                   history, settings])
    if (r.error) throw r.error;

  const nowOn = new Map(check(live).map((t) => [t.tire_id, t]));

  /* Parts are named on tw_parts, and a transaction is useless without
     the number — read them in one go rather than per line. */
  const partIds = [...new Set(check(partTxns).map((t) => t.part_id).filter(Boolean))];
  const parts = partIds.length
    ? check(await supabase.from("tw_parts")
        .select("id,part_number,name,category,uom,unit_cost").in("id", partIds))
    : [];
  const partById = new Map(parts.map((p) => [p.id, p]));
  const progById = new Map(check(programs).map((p) => [p.id, p]));

  return {
    unit,
    settings: {
      dualMatch: settings.data?.dual_match_32nds == null
        ? undefined : Number(settings.data.dual_match_32nds),
    },
    meter: meter.data
      ? { odo: num(meter.data.current_odometer), date: meter.data.odometer_date,
          source: meter.data.odometer_source }
      : { odo: null, date: null, source: "" },

    tires: check(tires).map((t) => ({
      id: t.id, pos: t.position, brand: t.brand || "", model: t.model || "",
      size: t.size || "", type: t.tire_type, wheel: t.wheel_material || "",
      casing: t.casing_id || "", cost: num(t.cost), notes: t.notes || "",
      onDate: t.mounted_date, onOdo: num(t.mounted_odometer), newDepth: num(t.mounted_depth),
      offDate: t.removed_date, offOdo: num(t.removed_odometer),
      offReason: t.removed_reason || "",
      on: !t.removed_date,
      depth: num(nowOn.get(t.id)?.current_depth),
      pullAt: num(nowOn.get(t.id)?.pull_depth),
      milesPer32: num(nowOn.get(t.id)?.miles_per_32nd),
      miles: t.removed_odometer != null && t.mounted_odometer != null
        ? num(t.removed_odometer) - num(t.mounted_odometer) : null,
    })),

    defects: defects.map((d) => ({
      id: d.id, category: d.category || "", note: d.note || "",
      state: d.state, safety: d.safety, priority: d.priority || "",
      first: d.first_reported, last: d.last_reported, count: d.report_count,
      driver: d.driver || "", source: d.source, workOrder: d.work_order || "",
      repairedBy: d.repaired_by || "", repairedAt: d.repaired_at,
      repairNote: d.repair_note || "", repairHours: num(d.repair_hours),
    })),

    orders: orders.map((w) => ({
      id: w.id, wo: w.wo_number, kind: w.kind, title: w.title,
      detail: w.detail || "", priority: w.priority, state: w.state,
      at: w.created_at, startedAt: w.started_at, completedAt: w.completed_at,
      completedBy: w.completed_by || "", note: w.completion_note || "",
      assigned: w.assigned_name || "", holdReason: w.hold_reason || "",
    })),

    pmDue: check(pmDue).map((p) => ({
      programId: p.program_id, program: p.program, category: p.category,
      level: p.level, dueDate: p.due_date, dueOdo: num(p.due_at_odometer),
      milesLeft: num(p.miles_remaining), daysLeft: num(p.days_remaining),
      lastDate: p.last_date, lastOdo: num(p.last_odometer), lastBy: p.last_by || "",
    })),

    services: check(completions).map((c) => ({
      id: c.id, date: c.done_date, programId: c.program_id,
      program: progById.get(c.program_id)?.name || "—",
      category: progById.get(c.program_id)?.category || "",
      odo: num(c.done_odometer), engineHours: num(c.engine_hours),
      hours: num(c.hours), by: c.done_by || "", note: c.note || "",
    })),

    hours: hours.map((h) => ({
      id: h.id, date: h.work_date, hours: Number(h.hours) || 0,
      mechanic: h.mechanic || "", mechanicId: h.mechanic_id,
      code: h.cost_code || "", codeName: h.cost_code_name || "",
      group: h.code_group || "", where: h.where_worked,
      jobLocation: h.job_location || "", workOrder: h.work_order || "",
      note: h.note || "", performed: h.work_performed || "",
      types: h.work_types || [],
    })),

    parts: check(partTxns).map((t) => {
      const p = partById.get(t.part_id);
      return {
        id: t.id, at: t.created_at, kind: t.kind,
        qty: Math.abs(Number(t.qty_delta) || 0),
        partNumber: p?.part_number || "—", name: p?.name || "",
        uom: p?.uom || "", cost: num(p?.unit_cost),
        who: t.who || "", workOrder: t.work_order || "", note: t.note || "",
      };
    }),

    odos: check(odos).map((o) => ({
      id: o.id, date: o.reading_date, odo: num(o.odometer),
      source: o.source, by: o.recorded_by || "",
    })),

    history: check(history).map((r) => ({
      at: r.at, kind: r.kind, what: r.what, summary: r.summary || "",
      who: r.who || "", workOrder: r.work_order || "",
      hours: num(r.hours), id: r.source_id,
    })),
  };
}
