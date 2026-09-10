import { supabase } from "./supabase.js";
import { fetchAll } from "./data.js";

/* The Now board: who is on the clock, and the numbers across the top.

   A shift is separate from a booked hour on purpose. tw_shifts answers
   "who is in the shop right now"; tw_time_entries answers "what did the
   work cost". Conflating them would mean nobody appears on the board
   until they have filled in a timecard, which is backwards — they are
   in the shop from the moment they punch in. */

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};

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

/* ── What each person on the clock is actually on ─────────────────
   The board says who is here. This says what they are doing, which is
   the next question a foreman asks and the one the shop had to walk out
   and find out.

   Three things the database genuinely knows, and one it does not.

   Knows: the work orders somebody has been put on, the defects they
   have claimed, and the hours they have booked today.

   Does not know: the clock running on their own equipment card. That
   lives in their phone's storage until they press Save, on purpose —
   a card in progress is a draft, not a record. So "nothing booked yet"
   here means nothing SAVED yet; somebody can be an hour into a job and
   still read as nothing. The card says that rather than implying the
   person is idle, because implying that about somebody under a truck is
   how a board loses its credibility.

   Claimed defects are matched on the name rather than an id, because
   claimed_by is text — the mechanic's name now, an email on anything
   claimed before that changed. Both are checked. */
export async function onClockDetail(people, dateISO) {
  const ids = people.map((p) => p.mechanicId).filter(Boolean);
  const out = new Map(people.map((p) => [p.mechanicId,
    { jobs: [], defects: [], booked: [], hours: 0 }]));
  if (!ids.length) return out;

  /* Their crew rows first, then the orders. A job can have more than one
     pair of hands on it, so "what is this person on" is a question for
     tw_work_order_crew — reading assigned_to would show the job only to
     whoever was put on it first. */
  const { data: crewRows, error: crewErr } = await supabase
    .from("tw_work_order_crew").select("work_order,mechanic_id")
    .in("mechanic_id", ids);
  if (crewErr) throw crewErr;
  const woIds = [...new Set((crewRows || []).map((c) => c.work_order))];

  const [wo, def, hrs] = await Promise.all([
    woIds.length
      ? supabase.from("tw_work_orders")
          .select("id,wo_number,unit_number,title,detail,priority,state,started_at,hold_reason")
          .in("id", woIds).neq("state", "done")
          .order("priority")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("tw_defects")
      .select("id,unit_number,category,note,safety,claimed_by,claimed_at,work_order")
      .eq("state", "claimed"),
    supabase.from("tw_hours")
      .select("id,mechanic_id,unit,hours,cost_code,cost_code_name,note,work_order,where_worked,job_location")
      .in("mechanic_id", ids).eq("work_date", dateISO),
  ]);
  for (const r of [wo, def, hrs]) if (r.error) throw r.error;

  /* One order can land on two people's cards, which is the point. */
  const onIt = new Map();
  for (const c of crewRows || []) {
    if (!onIt.has(c.work_order)) onIt.set(c.work_order, []);
    onIt.get(c.work_order).push(c.mechanic_id);
  }
  for (const w of wo.data || []) {
    const crew = onIt.get(w.id) || [];
    for (const mid of crew) {
      const g = out.get(mid);
      if (g) g.jobs.push({
        id: w.id, wo: w.wo_number, unit: w.unit_number || "", title: w.title,
        detail: w.detail || "", priority: w.priority, state: w.state,
        startedAt: w.started_at, holdReason: w.hold_reason || "",
        crewSize: crew.length,
      });
    }
  }

  const byName = new Map();
  for (const p of people) {
    if (p.mechanic) byName.set(p.mechanic, p.mechanicId);
    if (p.email) byName.set(p.email, p.mechanicId);
  }
  for (const d of def.data || []) {
    const id = byName.get(d.claimed_by);
    const g = id && out.get(id);
    if (g) g.defects.push({
      id: d.id, unit: d.unit_number, category: d.category || "Defect",
      note: d.note || "", unsafe: d.safety === "unsafe",
      claimedAt: d.claimed_at, workOrder: d.work_order || "",
    });
  }

  for (const h of hrs.data || []) {
    const g = out.get(h.mechanic_id);
    if (!g) continue;
    g.booked.push({
      id: h.id, unit: h.unit || h.job_location || "—", hours: Number(h.hours) || 0,
      costCode: h.cost_code || "", costCodeName: h.cost_code_name || "",
      note: h.note || "", workOrder: h.work_order || "", where: h.where_worked,
    });
    g.hours = Math.round((g.hours + (Number(h.hours) || 0)) * 100) / 100;
  }
  return out;
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

/* The server stamps the punch, not the tablet.
   punchIn takes started_at from the column default, so it is already the
   database's clock. This used to send new Date() from the browser, and a
   tablet running a second behind the server produced an ended_at earlier
   than started_at — the shift constraint refused it and the mechanic got
   a raw database error while trying to clock out.
   The quieter problem was worse: a tablet ten minutes slow would have
   booked every punch-out ten minutes early and nobody would have known. */
export async function punchOut(mechanicId) {
  const open = await openShift(mechanicId);
  const r = await rpc("tw_punch_out", { p_mechanic: mechanicId });
  if (r && r.ok === false) return r;
  return { ok: true, startedAt: open?.started_at };
}

/* Closing somebody else's forgotten shift, from the board. Kept
   separate from punchOut because it is a different act: a supervisor
   tidying up, not a mechanic finishing. */
export async function closeShift(shiftId) {
  const r = await rpc("tw_close_shift", { p_shift: shiftId });
  if (r && r.ok === false) throw new Error(r.error);
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

/* ── The shift card on a mechanic's own timecard ──────────────────
   More than a punch. Both times are editable and there is a lunch
   deduction, because a clock a mechanic cannot correct is one they stop
   using the first morning they forget to punch in. */

/* Every punch pair on one day, oldest first. The board shows one number
   for the day; a supervisor chasing a gap needs to see the punches that
   made it — somebody who clocked out for two hours at lunch and back in
   looks identical in the total. */
export async function shiftsForDay(mechanicId, dateISO) {
  const { data, error } = await supabase
    .from("tw_shift_days").select("*")
    .eq("mechanic_id", mechanicId).eq("work_date", dateISO)
    .order("started_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, date: r.work_date,
    startedAt: r.started_at, endedAt: r.ended_at,
    lunch: Number(r.lunch_minutes),
    clockHours: Number(r.clock_hours),
    open: !!r.open,
  }));
}

export async function shiftForDay(mechanicId, dateISO) {
  const { data, error } = await supabase
    .from("tw_shift_days").select("*")
    .eq("mechanic_id", mechanicId).eq("work_date", dateISO)
    .order("started_at", { ascending: false });
  if (error) throw error;
  if (!data?.length) return null;
  /* Somebody can punch more than once in a day — in after lunch, or
     after a shift was closed for them. The one that matters is the one
     still running; failing that, the most recent. Taking the first of
     the day would hand back a shift that finished hours ago. */
  const row = data.find((r) => r.ended_at === null) || data[0];
  const data_ = row;
  return {
    id: data_.id, date: data_.work_date,
    startedAt: data_.started_at, endedAt: data_.ended_at,
    lunch: Number(data_.lunch_minutes),
    clockHours: Number(data_.clock_hours),
    open: !!data_.open,
  };
}

/* The one you just edited, by id. Re-reading by day would be wrong
   straight after a correction: back-dating a shift can put an earlier
   punch ahead of it in the day's order. */
export async function shiftById(id) {
  const { data, error } = await supabase
    .from("tw_shift_days").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id, date: data.work_date,
    startedAt: data.started_at, endedAt: data.ended_at,
    lunch: Number(data.lunch_minutes),
    clockHours: Number(data.clock_hours),
    open: !!data.open,
  };
}

/* Times come in as "HH:MM" against the shift's own date, which is how
   somebody types a correction. */
export async function editShift(shiftId, dateISO, { start, stop, lunch }) {
  const at = (hm) => (hm ? new Date(`${dateISO}T${hm}:00`).toISOString() : null);
  const cols = {};
  if (start !== undefined) cols.started_at = at(start);
  if (stop !== undefined) cols.ended_at = at(stop);
  if (lunch !== undefined) cols.lunch_minutes = Number(lunch) || 0;

  /* A stop before the start means it ran past midnight, so the stop
     belongs to the next day. Storing it as typed would give a negative
     shift, and the check constraint would refuse the row anyway. */
  if (cols.started_at && cols.ended_at && cols.ended_at < cols.started_at) {
    const d = new Date(cols.ended_at);
    d.setUTCDate(d.getUTCDate() + 1);
    cols.ended_at = d.toISOString();
  }
  const { error } = await supabase.from("tw_shifts").update(cols).eq("id", shiftId);
  if (error) throw error;
}

/* Hours on the clock against hours booked to a truck and a code. The
   gap is the point: it catches somebody who clocked nine and booked
   six, on their own screen, while they can still remember why. */
export function accountedFor(clockHours, entries) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const booked = r2(entries.reduce((a, e) => a + (Number(e.hours) || 0), 0));
  const total = r2(clockHours || 0);
  const diff = r2(total - booked);

  const kindOf = (e) =>
    e.where === "road" ? "call" : e.where === "plant" ? "idle" : "shop";

  const scale = Math.max(total, booked) || 1;
  const segments = entries
    .filter((e) => Number(e.hours) > 0)
    .map((e) => ({
      label: e.unit || "—",
      hours: Number(e.hours),
      kind: kindOf(e),
      pct: (Number(e.hours) / scale) * 100,
    }));

  let note, tone;
  if (!total) { note = "Enter a start and stop time to begin."; tone = "muted"; }
  else if (diff > 0.01) {
    note = `${diff.toFixed(2)} hrs still need a unit or a shop code.`; tone = "warn";
  } else if (diff < -0.01) {
    note = `${Math.abs(diff).toFixed(2)} hrs more than the clock shows. Check your hours.`;
    tone = "warn";
  } else { note = "Every hour is accounted for."; tone = "ok"; }

  return { total, booked, diff, segments, note, tone };
}

export const hm = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
