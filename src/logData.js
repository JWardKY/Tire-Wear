import { supabase } from "./supabase.js";

/* ── The work log ─────────────────────────────────────────────────
   Jason's rule 11, and the one table in this system that is append
   only. There is no update policy and no delete policy on tw_work_log,
   for anybody — that omission is the design, not an oversight, and the
   grants say the same thing so a policy change alone cannot undo it.

   Deleting a timecard writes a `timecard_deleted` row holding the whole
   card and a required reason. An auditor needs to see what was removed
   and why, rather than finding a gap where a day used to be.

   So: never add an update or a delete path here. If a logged line is
   wrong, the correction is another line. */

const KINDS = new Set([
  "timecard_saved", "timecard_deleted", "defect_repaired",
  "defect_reopened", "defect_closed", "pm_completed",
  "tire_reading", "tire_mounted", "tire_pulled",
  "work_order_assigned", "work_order_completed", "part_issued",
]);

export const EVENT_LABEL = {
  timecard_saved: "Timecard saved",
  timecard_deleted: "Timecard deleted",
  defect_repaired: "Defect repaired",
  defect_reopened: "Defect reopened",
  defect_closed: "Defect closed in Motive",
  pm_completed: "PM completed",
  tire_reading: "Tread reading",
  tire_mounted: "Tire mounted",
  tire_pulled: "Tire pulled",
  work_order_assigned: "Work assigned",
  work_order_completed: "Work order completed",
  part_issued: "Parts issued",
};

/* A log write must never take down the thing it is recording. The work
   happened; failing to note it is worth a console line, not an error in
   a mechanic's face. The one exception is a deletion, which calls
   `logStrict` — there the record IS the safeguard, so if it cannot be
   written the delete must not proceed. */
export async function log(e) {
  try {
    await logStrict(e);
  } catch (err) {
    console.warn("work log write failed:", err?.message || err);
  }
}

export async function logStrict(e) {
  if (!KINDS.has(e.type)) throw new Error(`Unknown work log event: ${e.type}`);
  if (!e.actor) throw new Error("The work log needs to know who did it.");
  if (!e.summary) throw new Error("The work log needs a summary.");
  const { error } = await supabase.from("tw_work_log").insert({
    event_type: e.type,
    mechanic_id: e.mechanicId || null,
    actor_name: e.actor,
    vehicle_id: e.vehId || null,
    unit_number: e.unit || null,
    summary: e.summary,
    detail: e.detail || {},
  });
  if (error) throw error;
}

const toRow = (r) => ({
  id: r.id,
  at: r.occurred_at,
  type: r.event_type,
  label: EVENT_LABEL[r.event_type] || r.event_type,
  mechanicId: r.mechanic_id,
  actor: r.actor_name,
  vehId: r.vehicle_id,
  unit: r.unit_number || "",
  summary: r.summary,
  detail: r.detail || {},
});

export async function listLog({ from, to, type, unit, limit = 500 } = {}) {
  let q = supabase.from("tw_work_log").select("*")
    .order("occurred_at", { ascending: false }).limit(limit);
  if (from) q = q.gte("occurred_at", `${from}T00:00:00Z`);
  if (to) q = q.lte("occurred_at", `${to}T23:59:59Z`);
  if (type) q = q.eq("event_type", type);
  if (unit) q = q.eq("unit_number", unit);
  const { data, error } = await q;
  if (error) throw error;
  return data.map(toRow);
}
