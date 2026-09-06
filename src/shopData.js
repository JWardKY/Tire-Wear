import { supabase } from "./supabase.js";
import { fetchAll } from "./data.js";

/* Defects and preventive maintenance. Kept apart from data.js, which is
   the tire section's, so the two can be read and changed independently.
   Same rule though: this is the only file here that knows SQL exists. */

function check({ error }) {
  if (error) throw error;
}

const nowISO = () => new Date().toISOString();

/* ── Vehicles, for the pickers ─────────────────────────────────── */

export async function listVehicles() {
  const rows = await fetchAll("tw_vehicles", "id,number,make,model,division,active", "number");
  return rows
    .filter((r) => r.active)
    .map((r) => ({
      id: r.id, num: r.number, make: r.make || "", model: r.model || "", div: r.division,
    }));
}

/* ── Defects ───────────────────────────────────────────────────── */

const toDefect = (r) => ({
  id: r.id,
  key: r.defect_key,
  vehId: r.vehicle_id,
  unit: r.unit_number,
  category: r.category || "",
  note: r.note || "",
  driver: r.driver || "",
  location: r.location || "",
  severity: r.severity,
  safety: r.safety,
  firstReported: r.first_reported,
  lastReported: r.last_reported,
  count: r.report_count,
  source: r.source,
  state: r.state,
  claimedBy: r.claimed_by || "",
  claimedAt: r.claimed_at,
  priority: r.priority || "",
  workOrder: r.work_order || "",
  repairedBy: r.repaired_by || "",
  repairedAt: r.repaired_at,
  repairNote: r.repair_note || "",
  repairHours: r.repair_hours == null ? null : Number(r.repair_hours),
  closedAt: r.closed_at,
});

export async function listDefects() {
  const rows = await fetchAll("tw_defects", "*");
  return rows.map(toDefect);
}

/* A defect the shop found itself. Motive-sourced ones arrive through the
   sync with their own key; this one gets a key that no sync will ever
   match, so reconciling against Motive can never close it by accident. */
export async function addDefect(d, who) {
  const key = `manual:${d.unit}:${Date.now().toString(36)}`;
  check(
    await supabase.from("tw_defects").insert({
      defect_key: key,
      vehicle_id: d.vehId || null,
      unit_number: d.unit,
      category: d.category || null,
      note: d.note || null,
      driver: d.driver || null,
      location: d.location || null,
      severity: d.severity || "minor",
      safety: d.safety || "safe",
      first_reported: d.date,
      last_reported: d.date,
      source: "manual",
      state: "open",
      created_by: who,
    })
  );
}

export async function claimDefect(id, who) {
  check(
    await supabase.from("tw_defects")
      .update({ state: "claimed", claimed_by: who, claimed_at: nowISO(), updated_at: nowISO() })
      .eq("id", id)
  );
}

export async function releaseDefect(id) {
  check(
    await supabase.from("tw_defects")
      .update({ state: "open", claimed_by: null, claimed_at: null, updated_at: nowISO() })
      .eq("id", id)
  );
}

/* Motive is the DOT record, and a defect the shop has fixed should not
   sit "open" on it. The function reads the repair back out of the
   database itself — nothing about which defect, whose name, or what note
   is sent from here, because this call goes out over a public URL.
   Fire and forget: the repair is already saved, and the nightly sweep
   retries anything that does not land. */
function nudgeMotiveResolve() {
  try {
    fetch("/.netlify/functions/motive-resolve", { method: "POST" }).catch(() => {});
  } catch { /* no fetch, or running under a test harness */ }
}

export async function repairDefect(id, r, who) {
  check(
    await supabase.from("tw_defects")
      .update({
        state: "repaired",
        repaired_by: who,
        repaired_at: nowISO(),
        repair_note: r.note || null,
        repair_hours: r.hours == null || r.hours === "" ? null : Number(r.hours),
        work_order: r.workOrder || null,
        updated_at: nowISO(),
      })
      .eq("id", id)
  );
  nudgeMotiveResolve();
}

/* Back to open, and the repair details go with it — leaving a repaired_by
   on a defect that is not repaired would be a lie in the record. */
/* Reopening a closed defect is deliberately not offered. Motive is the
   DOT record: if a fault is back, it comes back through a sync as a new
   defect with its own key, which is the honest thing for an auditor to
   read. This only puts a repaired one back on the queue. */
export async function reopenDefect(id) {
  check(
    await supabase.from("tw_defects")
      .update({
        state: "open",
        repaired_by: null, repaired_at: null, repair_note: null, repair_hours: null,
        claimed_by: null, claimed_at: null,
        updated_at: nowISO(),
      })
      .eq("id", id)
      /* Never a closed one — see above. */
      .neq("state", "closed")
  );
  /* The same nudge, because reopening is the direction that matters
     most: if we have already told Motive this was repaired, that claim
     has to be withdrawn. The write-back works out which way to go by
     comparing what we hold against what Motive was last told. */
  nudgeMotiveResolve();
}

/* What Motive has been told, per defect. Read-only, and only used to
   show it — nothing in the app decides anything from this. */
export async function listDefectDvirs() {
  const rows = await fetchAll(
    "tw_defect_dvirs",
    "defect_id,log_id,sent_status,sent_at,sent_by,attempts,last_error"
  );
  const byDefect = new Map();
  for (const r of rows) {
    if (!byDefect.has(r.defect_id))
      byDefect.set(r.defect_id, { total: 0, sent: 0, failed: 0, error: "", by: "", at: null });
    const d = byDefect.get(r.defect_id);
    d.total += 1;
    if (r.sent_status === "repaired") {
      d.sent += 1;
      d.by = d.by || r.sent_by || "";
      if (!d.at || r.sent_at > d.at) d.at = r.sent_at;
    }
    if (r.attempts >= 3 && r.sent_status !== "repaired") {
      d.failed += 1;
      d.error = d.error || r.last_error || "";
    }
  }
  return byDefect;
}

export async function setDefectPriority(id, priority) {
  check(
    await supabase.from("tw_defects")
      .update({ priority: priority || null, updated_at: nowISO() })
      .eq("id", id)
  );
}

/* ── Preventive maintenance ────────────────────────────────────── */

const toProgram = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category || "",
  miles: r.interval_miles,
  months: r.interval_months,
  leadMiles: r.lead_miles,
  leadDays: r.lead_days,
  estHours: r.est_hours == null ? null : Number(r.est_hours),
  appliesTo: r.applies_to || "",
  active: r.active,
  sort: r.sort_order,
});

export async function listPrograms() {
  const rows = await fetchAll("tw_pm_programs", "*", "sort_order");
  return rows.map(toProgram);
}

export async function setProgramActive(id, active) {
  check(await supabase.from("tw_pm_programs").update({ active }).eq("id", id));
}

/* A service the shop wants tracked. Blank numbers are null, not zero —
   the database says an interval has to be positive, and a program with
   "every 0 miles" would be due on every truck forever. */
const programRow = (p) => ({
  name: p.name.trim(),
  category: p.category?.trim() || null,
  interval_miles: num(p.miles),
  interval_months: num(p.months),
  lead_miles: num(p.leadMiles),
  lead_days: num(p.leadDays),
  est_hours: num(p.estHours),
  /* null means every unit. The due view matches this against a truck's
     division, so it is the one field that decides which trucks a new
     service lands on. */
  applies_to: p.appliesTo || null,
});

const num = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

export async function addProgram(p) {
  /* Sorted to the end rather than into the middle: the order on that
     screen is the shop's, and a new service has not earned a place in
     it yet. */
  const { data, error } = await supabase.from("tw_pm_programs")
    .select("sort_order").order("sort_order", { ascending: false }).limit(1);
  if (error) throw error;
  const next = (data?.[0]?.sort_order ?? 0) + 10;
  check(await supabase.from("tw_pm_programs").insert({ ...programRow(p), sort_order: next }));
}

export async function updateProgram(id, p) {
  check(await supabase.from("tw_pm_programs").update(programRow(p)).eq("id", id));
}

const toDue = (r) => ({
  vehId: r.vehicle_id,
  truck: r.truck,
  div: r.division,
  programId: r.program_id,
  program: r.program,
  category: r.category || "",
  miles: r.interval_miles,
  months: r.interval_months,
  leadMiles: r.lead_miles,
  leadDays: r.lead_days,
  estHours: r.est_hours == null ? null : Number(r.est_hours),
  lastDate: r.last_date,
  lastOdo: r.last_odometer,
  lastBy: r.last_by || "",
  odo: r.current_odometer,
  odoDate: r.odometer_date,
  dueAtOdo: r.due_at_odometer,
  milesLeft: r.miles_remaining,
  dueDate: r.due_date,
  daysLeft: r.days_remaining,
  level: r.level,
});

/* The board only ever wants what is actually due. There are twelve
   programs against 134 trucks, so pulling the whole view every time
   would be 1,600 rows to render a list of a dozen. */
export async function listPmDue(levels = ["over", "soon"]) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("tw_pm_due")
      .select("*")
      .in("level", levels)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows.map(toDue);
}

/* Everything for one truck, including what is not due yet — this is the
   view you want when a truck is in the shop and you are deciding what
   else to do while it is on the rack. */
export async function listPmForVehicle(vehicleId) {
  const { data, error } = await supabase
    .from("tw_pm_due")
    .select("*")
    .eq("vehicle_id", vehicleId);
  if (error) throw error;
  return data.map(toDue);
}

export async function pmLevelCounts() {
  const levels = ["over", "soon", "ok", "nobaseline"];
  const out = {};
  await Promise.all(
    levels.map(async (l) => {
      const { count, error } = await supabase
        .from("tw_pm_due")
        .select("*", { count: "exact", head: true })
        .eq("level", l);
      if (error) throw error;
      out[l] = count || 0;
    })
  );
  return out;
}

export async function recordService(s, who) {
  check(
    await supabase.from("tw_pm_completions").insert({
      vehicle_id: s.vehId,
      program_id: s.programId,
      done_date: s.date,
      done_odometer: s.odo === "" || s.odo == null ? null : Number(s.odo),
      done_by: who,
      hours: s.hours === "" || s.hours == null ? null : Number(s.hours),
      note: s.note || null,
    })
  );
}

export async function listCompletions(vehicleId, programId) {
  const { data, error } = await supabase
    .from("tw_pm_completions")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .eq("program_id", programId)
    .order("done_date", { ascending: false });
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    date: r.done_date,
    odo: r.done_odometer,
    by: r.done_by || "",
    hours: r.hours == null ? null : Number(r.hours),
    note: r.note || "",
  }));
}

export async function deleteCompletion(id) {
  check(await supabase.from("tw_pm_completions").delete().eq("id", id));
}
