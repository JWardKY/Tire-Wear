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
    "tw_mechanics", "id,email,name,pin_set,active,locked_until", "name");
  return rows.map((r) => ({
    id: r.id, email: r.email, name: r.name,
    pinSet: !!r.pin_set, active: !!r.active,
    lockedUntil: r.locked_until,
    locked: !!r.locked_until && new Date(r.locked_until) > new Date(),
  }));
}

export const addMechanic = (email, name) =>
  rpc("tw_mechanic_add", { p_email: email, p_name: name });

export const resetPin = (email) =>
  rpc("tw_mechanic_reset_pin", { p_email: email });

export const setMechanicActive = (email, active) =>
  rpc("tw_mechanic_set_active", { p_email: email, p_active: active });

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
   to render its name. */
export async function applyCodePlan(plan) {
  const rows = [...plan.add, ...plan.rename].map((r, i) => ({
    code: r.code, name: r.name, active: true, sort_order: i,
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
