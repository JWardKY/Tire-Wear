import { supabase } from "./supabase.js";
import { fetchAll } from "./data.js";
import * as parts from "./partsData.js";

/* Mechanics, PINs, cost codes and timecards.
   ─────────────────────────────────────────────────────────────────
   What the PIN is and is not, so nobody builds on a wrong idea of it:

   It stops a colleague opening your timecard on a shared shop tablet.
   That is the actual thing that happens in a shop, and the PIN handles
   it properly — the hash is bcrypt, the browser is not allowed to read
   it, and five wrong guesses locks the account for fifteen minutes.

   It does not stop somebody who takes the anon key out of the page and
   posts to the database directly. Nothing client-side can. Hours are
   protected to the same degree everything else here is: the site
   password keeps strangers out, and the PIN keeps colleagues honest.
   If hours ever need to be provable rather than merely attributed,
   that is real auth, and HANDOFF.md says so. */

function check({ error }) {
  if (error) throw error;
}

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};

/* ── Mechanics and PINs ────────────────────────────────────────── */

export async function findMechanic(email) {
  const { data, error } = await supabase
    .from("tw_mechanics")
    .select("id,email,name,pin_set,active,locked_until")
    .eq("email", String(email).trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listMechanics() {
  const rows = await fetchAll("tw_mechanics", "id,email,name,pin_set,active", "name");
  return rows;
}

/* All three return { ok, error? } rather than throwing on a wrong PIN —
   a bad PIN is an expected answer, not an exception. */
export const registerMechanic = (email, name, pin) =>
  rpc("tw_mechanic_register", { p_email: email, p_name: name, p_pin: pin });

export const verifyPin = (email, pin) =>
  rpc("tw_mechanic_verify_pin", { p_email: email, p_pin: pin });

export const changePin = (email, oldPin, newPin) =>
  rpc("tw_mechanic_change_pin", { p_email: email, p_old: oldPin, p_new: newPin });

/* ── Cost codes ────────────────────────────────────────────────── */

export async function listCostCodes() {
  const rows = await fetchAll("tw_cost_codes", "*", "sort_order");
  return rows
    .filter((r) => r.active)
    .map((r) => ({ code: r.code, name: r.name, group: r.code_group }));
}

/* ── Time entries ──────────────────────────────────────────────── */

const toEntry = (r) => ({
  id: r.id,
  date: r.work_date,
  mechanicId: r.mechanic_id,
  mechanic: r.mechanic,
  mechanicEmail: r.mechanic_email,
  vehId: r.vehicle_id,
  unit: r.unit || "",
  div: r.division || "",
  jobLocation: r.job_location || "",
  pmProgramId: r.pm_program_id,
  where: r.where_worked,
  hours: Number(r.hours),
  costCode: r.cost_code,
  costCodeName: r.cost_code_name,
  codeGroup: r.code_group,
  workOrder: r.work_order || "",
  note: r.note || "",
  defectId: r.defect_id,
  workTypes: r.work_types || [],
  unitSeconds: Number(r.unit_seconds || 0),
  stints: r.stints || [],
  workPerformed: r.work_performed || "",
});

/* The chips on the equipment card. Stored as an array because a job is
   often two of these at once — a PM that turned into a repair. */
export const WORK_TYPES = [
  "PM service", "Repair", "Tires", "DOT / annual",
  "Diagnostics", "Welding / fab", "Road call",
];

export async function listDay(mechanicId, date) {
  const { data, error } = await supabase
    .from("tw_hours")
    .select("*")
    .eq("mechanic_id", mechanicId)
    .eq("work_date", date)
    .order("id");
  if (error) throw error;
  return data.map(toEntry);
}

export async function listRange(from, to) {
  const rows = [];
  const PAGE = 1000;
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await supabase
      .from("tw_hours")
      .select("*")
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date", { ascending: false })
      .range(i, i + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows.map(toEntry);
}

/* Returns the new row's id. The equipment card needs it, because the
   parts pulled on a job are linked back to the hours that pulled them. */
export async function addEntry(e) {
  const { data, error } = await supabase
    .from("tw_time_entries")
    .insert({
      mechanic_id: e.mechanicId,
      work_date: e.date,
      vehicle_id: e.vehId || null,
      unit_label: e.vehId ? null : (e.unitLabel || null),
      where_worked: e.where || "shop",
      hours: Number(e.hours),
      cost_code: e.costCode,
      work_order: e.workOrder || null,
      note: e.note || null,
      defect_id: e.defectId || null,
      work_types: e.workTypes || [],
      unit_seconds: Math.max(0, Math.round(Number(e.unitSeconds || 0))),
      stints: e.stints || [],
      work_performed: e.workPerformed || null,
      job_location: e.jobLocation || null,
      pm_program_id: e.pmProgramId || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/* Only the keys given are written. The Add hours dialog does not know
   about the equipment card's fields, and an edit from it must not wipe
   the stints or the type of work off an entry made there. */
export async function updateEntry(id, e) {
  const extra = {};
  if (e.workTypes !== undefined) extra.work_types = e.workTypes || [];
  if (e.unitSeconds !== undefined) extra.unit_seconds = Math.max(0, Math.round(Number(e.unitSeconds) || 0));
  if (e.stints !== undefined) extra.stints = e.stints || [];
  if (e.workPerformed !== undefined) extra.work_performed = e.workPerformed || null;
  if (e.jobLocation !== undefined) extra.job_location = e.jobLocation || null;
  if (e.pmProgramId !== undefined) extra.pm_program_id = e.pmProgramId || null;
  check(
    await supabase.from("tw_time_entries")
      .update({
        ...extra,
        work_date: e.date,
        vehicle_id: e.vehId || null,
        unit_label: e.vehId ? null : (e.unitLabel || null),
        where_worked: e.where || "shop",
        hours: Number(e.hours),
        cost_code: e.costCode,
        work_order: e.workOrder || null,
        note: e.note || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
  );
}

export async function deleteEntry(id) {
  check(await supabase.from("tw_time_entries").delete().eq("id", id));
}

/* ── The equipment card ────────────────────────────────────────────
   One unit's worth of a mechanic's day: the hours, what kind of work
   it was, what they found, and the parts that came off the shelf for
   it. Saved as one time entry plus one issue per part.

   The entry is written first and the parts hang off its id, so a part
   issue can always answer "which hours pulled this". If a part issue
   fails, the hours still stand — we say which parts did not go through
   rather than silently dropping either half. */
export async function saveCard(card, mechanicId) {
  const id = await addEntry({ ...card, mechanicId });

  /* Every part the mechanic put on the line is recorded, typed or not.
     Only the ones that matched the catalog also move stock — that is the
     whole of rule 10 as far as this function is concerned: nobody is
     blocked because a part is not in the system. */
  const lines = mergeParts(card.parts || []);
  const failed = [];

  if (lines.length) {
    const { error } = await supabase.from("tw_time_entry_parts").insert(
      lines.map((p) => ({
        time_entry_id: id,
        part_id: p.partId || null,
        part_number: p.number,
        description: p.name || null,
        qty: p.qty,
      }))
    );
    if (error) failed.push(`the parts did not save — ${error.message}`);
  }

  for (const p of lines) {
    if (!p.partId) continue;   // typed by hand: nothing to draw down
    try {
      await parts.move(p.partId, "issue", p.qty, {
        vehId: card.vehId || null,
        workOrder: card.workOrder || null,
        note: card.workPerformed || null,
        timeEntryId: id,
      }, card.who);
    } catch (e) {
      failed.push(`${p.number} — ${e.message || e}`);
    }
  }

  /* The log is a record of what happened, so it is written after the
     work, and a log failure never undoes hours a mechanic just saved. */
  const { log } = await import("./logData.js");
  await log({
    type: "timecard_saved",
    mechanicId,
    actor: card.who,
    vehId: card.vehId || null,
    unit: card.unitLabel || null,
    summary: `${card.hours} hr on ${card.unitLabel || "a unit"}`
      + (card.workTypes?.length ? ` — ${card.workTypes.join(" · ")}` : ""),
    detail: {
      entry_id: id, work_date: card.date, cost_code: card.costCode,
      hours: card.hours, unit_seconds: card.unitSeconds,
      stints: card.stints?.length || 0, work_order: card.workOrder || null,
      work_types: card.workTypes || [], work_performed: card.workPerformed || null,
      parts: lines.map((p) => `${p.qty}x ${p.number}`),
    },
  });

  if (failed.length) {
    throw new Error(
      `The hours saved, but not everything else did: ${failed.join("; ")}`
    );
  }
  return id;
}

/* Jason's rule: typing the same number twice adds the quantities rather
   than making a second line. Matching is on the trimmed, case-folded
   number, so "AF-1140" and "af-1140 " are the same part. The database
   has a unique index saying the same thing, so a bug here surfaces as a
   failed save rather than as two lines for one part. */
export function mergeParts(list) {
  const out = [];
  const at = new Map();
  for (const p of list) {
    const number = String(p.number || "").trim();
    if (!number) continue;
    const qty = Number(p.qty);
    if (!(qty > 0)) continue;
    const key = number.toLowerCase();
    const seen = at.get(key);
    if (seen != null) {
      out[seen].qty = Math.round((out[seen].qty + qty) * 100) / 100;
      /* A catalog match wins over a typed one for the same number: it is
         the same part, and knowing its id means the stock can move. */
      if (!out[seen].partId && p.partId) {
        out[seen].partId = p.partId;
        out[seen].name = p.name || out[seen].name;
      }
      continue;
    }
    at.set(key, out.length);
    out.push({ partId: p.partId || null, number, name: p.name || "", qty });
  }
  return out;
}

/* What was put on one entry, for showing a saved line back. */
export async function partsForEntry(entryId) {
  const { data, error } = await supabase
    .from("tw_time_entry_parts").select("*").eq("time_entry_id", entryId)
    .order("part_number");
  if (error) throw error;
  return data.map((r) => ({
    id: r.id, partId: r.part_id, number: r.part_number,
    name: r.description || "", qty: Number(r.qty),
  }));
}

/* ── Payroll ───────────────────────────────────────────────────────
   Jason's export, column for column. Every LEFT JOIN in the view is
   deliberate: an hour missing its cost code is exactly the row payroll
   needs to chase, so nothing may quietly drop it. */

export const PAYROLL_COLUMNS = [
  "Date", "Employee #", "Mechanic", "Cost code", "Cost code name", "Unit",
  "Shop or service call", "Job/location", "Hours", "True clocked hours",
  "Segments", "Work order", "Type of work", "DVIR", "PM", "Parts used",
  "Work performed",
];

const WHERE_LABEL = {
  shop: "Shop", field: "Field", road: "Outside service call", plant: "Plant",
};

export async function payrollLines(from, to) {
  const rows = [];
  const PAGE = 1000;
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await supabase
      .from("tw_payroll_lines")
      .select("*")
      .gte("work_date", from).lte("work_date", to)
      .order("work_date", { ascending: true })
      .order("mechanic", { ascending: true })
      .range(i, i + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows.map((r) => ({
    date: r.work_date,
    empNo: r.emp_no || "",
    mechanic: r.mechanic,
    costCode: r.cost_code || "",
    costCodeName: r.cost_code_name || "",
    unit: r.unit || "",
    where: WHERE_LABEL[r.where_worked] || r.where_worked,
    jobLocation: r.job_location || "",
    hours: Number(r.hours),
    trueHours: Number(r.true_hours || 0),
    segments: Number(r.segments || 0),
    workOrder: r.work_order || "",
    workTypes: r.work_types || "",
    dvir: r.dvir || "",
    pm: r.pm_service || "",
    parts: r.parts_used || "",
    workPerformed: r.work_performed || "",
    entryId: r.entry_id,
    mechanicId: r.mechanic_id,
  }));
}

export const payrollRow = (r) => [
  r.date, r.empNo, r.mechanic, r.costCode, r.costCodeName, r.unit, r.where,
  r.jobLocation, r.hours, r.trueHours, r.segments, r.workOrder, r.workTypes,
  r.dvir, r.pm, r.parts, r.workPerformed,
];

/* ── The day, clocked against booked ───────────────────────────────
   Rule 5: the shift clock is what payroll pays and the sub-clock is
   true time on the machine. They will not always agree, and the office
   has to see the gap before it runs payroll. */
export async function timecardDays(from, to) {
  const { data, error } = await supabase
    .from("tw_timecard_days").select("*")
    .gte("work_date", from).lte("work_date", to)
    .order("work_date", { ascending: false })
    .order("mechanic", { ascending: true });
  if (error) throw error;
  return data.map((r) => ({
    mechanicId: r.mechanic_id,
    mechanic: r.mechanic,
    empNo: r.emp_no || "",
    date: r.work_date,
    clockHours: Number(r.clock_hours),
    bookedHours: Number(r.booked_hours),
    trueHours: Number(r.true_hours),
    difference: Number(r.difference),
    lines: Number(r.lines),
    uncodedLines: Number(r.uncoded_lines),
    uncodedHours: Number(r.uncoded_hours),
    firstIn: r.first_in,
    lastOut: r.last_out,
    stillOpen: r.still_open,
  }));
}

/* Removing a whole day's card. The snapshot goes into the work log
   BEFORE the rows go, and a failed log write stops the delete — that
   is the entire point of an append-only trail. `logStrict` is imported
   lazily so timeData stays usable in a script that has no log. */
export async function deleteCard(mechanicId, date, reason, actor) {
  const why = String(reason || "").trim();
  if (why.length < 4) throw new Error("A reason is required to delete a timecard.");
  if (!actor) throw new Error("A timecard can only be deleted by a named person.");

  const entries = await listDay(mechanicId, date);
  if (!entries.length) throw new Error("There is nothing on that day to delete.");

  const { logStrict } = await import("./logData.js");
  await logStrict({
    type: "timecard_deleted",
    mechanicId,
    actor,
    unit: null,
    summary: `${entries[0].mechanic}'s card for ${date} deleted — ${why}`,
    detail: {
      reason: why, work_date: date, mechanic: entries[0].mechanic,
      hours: entries.reduce((a, e) => a + e.hours, 0),
      entries,
    },
  });

  check(await supabase.from("tw_time_entries").delete()
    .eq("mechanic_id", mechanicId).eq("work_date", date));
  return entries.length;
}
