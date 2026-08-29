import { supabase } from "./supabase.js";
import { fetchAll } from "./data.js";

/* The Setup screen: the roster and the cost codes.

   Mechanics are read-only to the app on purpose — that is what stops
   somebody editing a colleague's record from the browser console — so
   the three admin actions go through definer functions. None of them
   can read or set a PIN. Adding leaves it unset so the mechanic chooses
   their own; resetting clears it so they can choose again. There is no
   way to reveal an existing one, here or anywhere. */

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};

/* ── Roster ────────────────────────────────────────────────────── */

export async function listRoster() {
  const rows = await fetchAll(
    "tw_mechanics", "id,email,name,role,emp_no,pin_set,active,locked_until", "name");
  return rows.map((r) => ({
    id: r.id, email: r.email || "", name: r.name, role: r.role || "mechanic",
    empNo: r.emp_no || "",
    pinSet: !!r.pin_set, active: !!r.active,
    lockedUntil: r.locked_until,
    locked: !!r.locked_until && new Date(r.locked_until) > new Date(),
  }));
}

/* Email is optional now. Not everyone in the shop has a company
   address, and one of them is on the roster as "D. Bradley" — there is
   no email to be had there, and inventing one would mean a person who
   cannot sign in. They tap their name instead. */
export const addMechanic = (name, role, email, empNo) =>
  rpc("tw_mechanic_add_named", {
    p_name: name, p_role: role || "mechanic",
    p_email: email || null, p_emp_no: empNo || null });

/* Correcting a record rather than adding a second one. Without this,
   "D. Bradley" could not become "Donald Bradley" and the roster grew a
   duplicate instead — which is exactly what happened. */
export const updateMechanic = (id, { name, email, empNo }) =>
  rpc("tw_mechanic_update", {
    p_id: id, p_name: name, p_email: email || null, p_emp_no: empNo || null });

/* Address, phone and next of kin. These are the only fields in the app
   the browser cannot read with the key that ships in the page — they
   cost the supervisor's own PIN, checked in the database, because a
   list of where everybody lives is not roster data. The PIN is passed
   per call and never stored: the supervisor gate deliberately remembers
   who signed in and nothing else. */
export const getPrivate = (actorId, pin, id) =>
  rpc("tw_mechanic_private_get", { p_actor: actorId, p_pin: pin, p_id: id });

export const setPrivate = (actorId, pin, id, d) =>
  rpc("tw_mechanic_private_set", {
    p_actor: actorId, p_pin: pin, p_id: id,
    p_address: d.address || null, p_phone: d.phone || null,
    p_emergency_name: d.emergencyName || null,
    p_emergency_phone: d.emergencyPhone || null });

/* Only ever for one added by mistake. It refuses anybody with a
   timecard line or a punch against them, and says so, because the
   foreign keys cascade and the delete would take their hours too. */
export const removeMechanic = (id) => rpc("tw_mechanic_remove", { p_id: id });

export const resetPin = (id) => rpc("tw_mechanic_reset_pin_by_id", { p_id: id });

export const setMechanicActive = (id, active) =>
  rpc("tw_mechanic_set_active_by_id", { p_id: id, p_active: active });

export const setRole = (id, role) =>
  rpc("tw_mechanic_set_role", { p_id: id, p_role: role });

/* ── Signing in on the shop tablet ─────────────────────────────── */

export const setPin = (id, pin) => rpc("tw_mechanic_set_pin", { p_id: id, p_pin: pin });

export const checkPin = (id, pin) => rpc("tw_mechanic_check_pin", { p_id: id, p_pin: pin });

export const changePinById = (id, oldPin, newPin) =>
  rpc("tw_mechanic_change_pin_by_id", { p_id: id, p_old: oldPin, p_new: newPin });

/* ── Cost codes ────────────────────────────────────────────────── */

export async function listAllCostCodes() {
  const rows = await fetchAll("tw_cost_codes", "*", "sort_order");
  return rows.map((r) => ({
    code: r.code, name: r.name, group: r.code_group || "",
    active: !!r.active, sort: r.sort_order ?? 0,
  }));
}

export async function saveCostCode({ code, name, group, active, sort }) {
  const { error } = await supabase.from("tw_cost_codes").upsert({
    code: String(code).trim(),
    name: String(name || "").trim(),
    code_group: group || null,
    active: active !== false,
    sort_order: sort ?? 0,
  }, { onConflict: "code" });
  if (error) throw error;
}

export async function setCostCodeActive(code, active) {
  const { error } = await supabase.from("tw_cost_codes")
    .update({ active }).eq("code", code);
  if (error) throw error;
}

/* Applying a pasted plan. Adds and renames go in as upserts; a
   "replace whole list" deactivates what the paste left out rather than
   deleting it, because hours already booked against a code still have
   to render its name.

   The group and the sort order come off the plan, not off the loop
   counter. Numbering rows 0, 1, 2 as they happen to arrive would file
   every pasted code ahead of the whole existing list and strip the
   group off any code being renamed. */
export async function applyCodePlan(plan) {
  const rows = [...plan.add, ...plan.rename].map((r) => ({
    code: r.code,
    name: r.name,
    code_group: r.group || null,
    active: true,
    sort_order: Number(r.sort) || 0,
  }));
  if (rows.length) {
    const { error } = await supabase.from("tw_cost_codes")
      .upsert(rows, { onConflict: "code" });
    if (error) throw error;
  }
  for (const c of plan.deactivate) {
    const { error } = await supabase.from("tw_cost_codes")
      .update({ active: false }).eq("code", c.code);
    if (error) throw error;
  }
  return {
    added: plan.add.length,
    renamed: plan.rename.length,
    untouched: plan.same.length,
    deactivated: plan.deactivate.length,
  };
}
