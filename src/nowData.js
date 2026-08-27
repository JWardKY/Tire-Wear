import { supabase } from "./supabase.js";
import { fetchAll } from "./data.js";

/* The Now board: who is on the clock, and the numbers across the top.

   A shift is separate from a booked hour on purpose. tw_shifts answers
   "who is in the shop right now"; tw_time_entries answers "what did the
   work cost". Conflating them would mean nobody appears on the board
   until they have filled in a timecard, which is backwards — they are
   in the shop from the moment they punch in. */

export async function listOnClock() {
  const { data, error } = await supabase
    .from("tw_on_clock").select("*").order("started_at");
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    mechanicId: r.mechanic_id,
    mechanic: r.mechanic,
    email: r.mechanic_email,
    startedAt: r.started_at,
    startedOn: r.started_on,
    stale: !!r.stale,
    note: r.note || "",
  }));
}

export async function openShift(mechanicId) {
  const { data, error } = await supabase
    .from("tw_shifts").select("id,started_at")
    .eq("mechanic_id", mechanicId).is("ended_at", null).maybeSingle();
  if (error) throw error;
  return data || null;
}

/* Punching in twice is what happens when a shop tablet is slow and
   somebody presses the button again. The unique index refuses the
   second one; this turns that refusal into "you are already on the
   clock" rather than a database error on a wall-mounted screen. */
export async function punchIn(mechanicId, note) {
  const { error } = await supabase.from("tw_shifts")
    .insert({ mechanic_id: mechanicId, note: note || null });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Already on the clock." };
    throw error;
  }
  return { ok: true };
}

export async function punchOut(mechanicId) {
  const open = await openShift(mechanicId);
  if (!open) return { ok: false, error: "Not on the clock." };
  const { error } = await supabase.from("tw_shifts")
    .update({ ended_at: new Date().toISOString() }).eq("id", open.id);
  if (error) throw error;
  return { ok: true, startedAt: open.started_at };
}

/* Closing somebody else's forgotten shift, from the board. Kept
   separate from punchOut because it is a different act: a supervisor
   tidying up, not a mechanic finishing. */
export async function closeShift(shiftId) {
  const { error } = await supabase.from("tw_shifts")
    .update({ ended_at: new Date().toISOString() }).eq("id", shiftId);
  if (error) throw error;
}

/* ── The numbers across the top ────────────────────────────────── */

export async function boardNumbers(fromISO, toISO) {
  const [onClock, defects, hours] = await Promise.all([
    listOnClock(),
    fetchAll("tw_defects", "id,state,safety,first_reported", "id"),
    rangeHours(fromISO, toISO),
  ]);

  const open = defects.filter((d) => d.state !== "repaired");
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
    .toISOString().slice(0, 10);

  const total = round2(hours.reduce((a, h) => a + h.hours, 0));
  const road = round2(hours.filter((h) => h.where === "road")
    .reduce((a, h) => a + h.hours, 0));

  return {
    onClock: onClock.length,
    openDefects: open.length,
    outOfService: open.filter((d) => d.safety === "unsafe").length,
    openOverAWeek: open.filter((d) => d.first_reported < weekAgo).length,
    hours: total,
    entries: hours.length,
    unitsTouched: new Set(hours.filter((h) => h.vehId).map((h) => h.vehId)).size,
    roadPct: total ? Math.round((road / total) * 100) : 0,
  };
}

async function rangeHours(fromISO, toISO) {
  const rows = [];
  const PAGE = 1000;
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await supabase
      .from("tw_hours")
      .select("hours,where_worked,vehicle_id,work_date")
      .gte("work_date", fromISO).lte("work_date", toISO)
      .range(i, i + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows.map((r) => ({
    hours: Number(r.hours) || 0,
    where: r.where_worked,
    vehId: r.vehicle_id,
  }));
}

const round2 = (n) => Math.round(n * 100) / 100;

/* Seconds a shift has been running. Computed from the timestamp rather
   than counted up in the browser, so a tab left open overnight still
   shows the truth. */
export const elapsedSec = (startedAt) =>
  Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));

export function fmtHMS(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
