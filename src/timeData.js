import { supabase } from "./supabase.js";
import { fetchAll } from "./data.js";

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
  where: r.where_worked,
  hours: Number(r.hours),
  costCode: r.cost_code,
  costCodeName: r.cost_code_name,
  codeGroup: r.code_group,
  workOrder: r.work_order || "",
  note: r.note || "",
  defectId: r.defect_id,
});

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

export async function addEntry(e) {
  check(
    await supabase.from("tw_time_entries").insert({
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
    })
  );
}

export async function updateEntry(id, e) {
  check(
    await supabase.from("tw_time_entries")
      .update({
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
