import { supabase } from "./supabase.js";
import { fetchAll } from "./data.js";
import { hm, shiftTimes, shiftHours } from "./shiftMath.js";

/* Re-exported so every screen keeps reaching for the clock through one
   module. The arithmetic itself lives in shiftMath.js, which has no
   database import and can be tested on its own. */
export { hm, shiftHours };

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
      note: d.note || "", major: d.safety === "unsafe",
      claimedAt: d.claimed_at, workOrder: d.work_order || "",
    });
  }

  for (const h of hrs.data || []) {
    const g = out.get(h.mechanic_id);
    if (!g) continue;
    g.booked.push({
      id: h.id, unit: h.unit || "—", hours: Number(h.hours) || 0,
      jobLocation: h.job_location || "",
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
   tidying up, not a mechanic finishing.

   This stops the clock at NOW, which is only ever the right answer for
   a shift that started today. The board offers it on shifts left open
   from an earlier day, where now() is tomorrow's problem — closing
   Thursday's punch on Friday morning booked twenty-six hours. Those go
   through correctShift with a time somebody typed instead. */
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
    /* Not "out of service". That phrase is a roadside inspector's
       order; all this knows is that a driver typed the defect major on
       a DVIR. The board says what it actually has. */
    majorDefects: open.filter((d) => d.safety === "unsafe").length,
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

/* ── Correcting a punch ───────────────────────────────────────────
   A clock nobody can correct is one they stop using the first morning
   they forget it, so both times and the lunch deduction are editable —
   by the mechanic on their own card, and by a supervisor on theirs.

   Everything below funnels through shiftTimes so there is one place
   that knows how a typed "HH:MM" becomes a timestamp, and one place
   that refuses the answers that are obviously a typo. */

/* `current` is the shift as it stands, and leaving it out is a mistake
   worth a comment.

   A correction almost always touches one end: somebody types a
   clock-out and nothing else. Validating only what was typed means the
   pair is never looked at, so "05:00" against a 06:02 start rolls into
   the next day and books twenty-three hours with no check anywhere near
   it — the exact shape of the bug this whole screen exists to fix.
   So the half that was not typed is filled in from the shift and the
   two are judged together. Only the typed half is written. */
export async function editShift(shiftId, dateISO, { start, stop, lunch }, current) {
  const effective = {
    start: start !== undefined ? start : hm(current?.startedAt),
    stop: stop !== undefined ? stop : hm(current?.endedAt),
  };
  const t = shiftTimes(dateISO, effective);

  const cols = {};
  if (start !== undefined) cols.started_at = t.started_at;
  if (stop !== undefined) cols.ended_at = t.ended_at;
  if (lunch !== undefined) cols.lunch_minutes = Number(lunch) || 0;

  const { error } = await supabase.from("tw_shifts").update(cols).eq("id", shiftId);
  if (error) throw error;
}

/* The same edit, with a line in the log.

   Clocked hours are a pay figure. A mechanic fixing their own missed
   punch and a supervisor fixing somebody else's are the same act to the
   database and a different one to an auditor, so both are written down
   with who did it and what the numbers were before.

   `was` is the shift as it was read off the screen, so the line says
   what actually changed rather than what was submitted. */
export async function correctShift(was, patch, who) {
  if (!who) throw new Error("A punch can only be corrected by a named person.");
  await editShift(was.id, was.date, patch, was);

  const after = await shiftById(was.id);
  const say = (sh) => (sh
    ? `${hm(sh.startedAt) || "—"}–${sh.endedAt ? hm(sh.endedAt) : "still on"}` +
      `${sh.lunch ? ` less ${sh.lunch}` : ""}`
    : "—");

  const { log } = await import("./logData.js");
  await log({
    type: "shift_corrected",
    mechanicId: was.mechanicId || null,
    actor: who,
    summary: `${was.mechanic || "A"} punch on ${was.date} changed from ` +
             `${say(was)} to ${say(after)}`,
    detail: {
      work_date: was.date, shift: was.id, mechanic: was.mechanic || null,
      before: { started_at: was.startedAt, ended_at: was.endedAt,
                lunch_minutes: was.lunch, clock_hours: was.clockHours },
      after: after && { started_at: after.startedAt, ended_at: after.endedAt,
                        lunch_minutes: after.lunch, clock_hours: after.clockHours },
    },
  });
  return after;
}

/* A day with no punches at all — somebody who never clocked in. The
   hours may well be on the card already, entered by hand; this puts the
   clock beside them so the two can be compared.

   Both ends are required. An open-ended shift added after the fact is
   the same missed punch-out all over again, and it would trip the
   unique index if the mechanic is on the clock right now. */
export async function addShift(mechanicId, dateISO, { start, stop, lunch }, who) {
  if (!who) throw new Error("A punch can only be added by a named person.");
  if (!start || !stop) throw new Error("A punch added by hand needs both a start and a stop.");
  const t = shiftTimes(dateISO, { start, stop });

  const { data, error } = await supabase.from("tw_shifts")
    .insert({ mechanic_id: mechanicId, started_at: t.started_at,
              ended_at: t.ended_at, lunch_minutes: Number(lunch) || 0 })
    .select("id").single();
  if (error) throw error;

  const added = await shiftById(data.id);
  const { log } = await import("./logData.js");
  await log({
    type: "shift_corrected",
    mechanicId, actor: who,
    summary: `Punch added by hand for ${dateISO} — ` +
             `${hm(added?.startedAt) || start}–${hm(added?.endedAt) || stop}`,
    detail: { work_date: dateISO, shift: data.id, added: true,
              after: added && { started_at: added.startedAt, ended_at: added.endedAt,
                                lunch_minutes: added.lunch, clock_hours: added.clockHours } },
  });
  return added;
}

/* The shift somebody is still on, with the day it belongs to.

   openShift answers "are they on the clock"; this answers "since when,
   and was it today". A shift still open from a previous day is the
   missed punch-out, and it is the whole reason the banner on a
   mechanic's own card exists — nobody goes looking for yesterday. */
export async function openShiftFor(mechanicId) {
  const { data, error } = await supabase
    .from("tw_shift_days").select("*")
    .eq("mechanic_id", mechanicId).is("ended_at", null)
    .order("started_at", { ascending: false }).limit(1);
  if (error) throw error;
  const r = (data || [])[0];
  if (!r) return null;
  return {
    id: r.id, date: r.work_date, mechanicId: r.mechanic_id, mechanic: r.mechanic,
    startedAt: r.started_at, endedAt: r.ended_at,
    lunch: Number(r.lunch_minutes), clockHours: Number(r.clock_hours), open: true,
  };
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


