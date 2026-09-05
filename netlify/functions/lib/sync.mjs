/* Runs a sync. Reads Motive, works out what would change, and either
   reports that or writes it.

   Everything here is idempotent. Odometer rows collide on
   (vehicle_id, reading_date, odometer) and are ignored on conflict, and
   defects collide on defect_key. So running twice is the same as running
   once, and a run that dies halfway can just be run again. */

import { createClient } from "@supabase/supabase-js";
import {
  fetchVehicleOdometers, fetchInspectionDefects, fetchRawVehicles,
  fetchRawInspections, fetchInspectionParts,
  planOdometer, planDefects, planClosuresFromParts, compareOdometers,
  todayISO, WHICH_ODOMETER,
} from "./motive.mjs";

/* SUPABASE_URL / SUPABASE_ANON_KEY rather than the VITE_ ones, because a
   VITE_ prefix means "gets compiled into the browser bundle" and those
   are scoped to builds only — a function reading them at runtime sees
   nothing. The VITE_ names are still accepted as a fallback so a local
   .env.local with only those in it keeps working. Same values either
   way; the anon key is public by design. */
export function env() {
  const motiveKey = process.env.MOTIVE_API_KEY;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const missing = [
    !motiveKey && "MOTIVE_API_KEY",
    !url && "SUPABASE_URL",
    !key && "SUPABASE_ANON_KEY",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `Not configured: ${missing.join(", ")} is not set. Netlify bakes ` +
      `environment variables into a function at deploy time, and only ` +
      `those scoped to Functions, so check both the scope and that a ` +
      `deploy has run since the variable was saved.`
    );
  }
  return { motiveKey, db: createClient(url, key) };
}

/* PostgREST caps a response at 1000 rows and says nothing about it, so
   page explicitly. Same trap as the tire data layer. */
async function all(db, table, cols, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols)
      .order(order, { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/* The highest odometer we already hold per truck, from the log and from
   what tyres were mounted at. Both matter: a tire mounted at 412,000 is
   evidence the truck has at least that many miles even if the log is
   empty, and a synced reading below it would produce negative miles run. */
async function latestOdometers(db) {
  const latest = new Map();
  const keep = (id, v) => {
    if (v == null) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    if (!latest.has(id) || n > latest.get(id)) latest.set(id, n);
  };
  for (const r of await all(db, "tw_odometer_log", "vehicle_id,odometer", "vehicle_id"))
    keep(r.vehicle_id, r.odometer);
  for (const r of await all(db, "tw_tires", "vehicle_id,mounted_odometer,removed_odometer", "vehicle_id")) {
    keep(r.vehicle_id, r.mounted_odometer);
    keep(r.vehicle_id, r.removed_odometer);
  }
  return latest;
}

export async function rawSample({ motiveKey }, what, since, { n, status } = {}) {
  /* Bounded: this returns whole DVIRs, and one is forty-odd checklist
     lines. Enough to see a field's shape and how its values vary. */
  const count = Math.min(Math.max(Number(n) || 2, 1), 25);
  /* The v2 feed closing runs on, without the forty-odd clean checklist
     lines per report. Proves the key can call v2 and shows the part
     statuses that are actually coming back. */
  if (what === "parts") {
    const parts = await fetchInspectionParts(motiveKey, since || daysAgo(14),
                                             status || "with_defects");
    const defectsOnly = [...parts.values()].filter((p) => p.type === "minor" || p.type === "major");
    const seen = {};
    for (const p of defectsOnly) seen[p.status || "(none)"] = (seen[p.status || "(none)"] || 0) + 1;
    return { partsSeen: parts.size, defectParts: defectsOnly.length,
             statusSeen: seen, sample: defectsOnly.slice(0, count) };
  }
  return what === "defects"
    ? await fetchRawInspections(motiveKey, since || daysAgo(14), count, status || "with_defects")
    : await fetchRawVehicles(motiveKey, count);
}

export async function runOdometer({ motiveKey, db }, { write, field }) {
  const [fromMotive, vehicles, latest] = await Promise.all([
    fetchVehicleOdometers(motiveKey),
    all(db, "tw_vehicles", "id,number,motive_vehicle_id,active", "number"),
    latestOdometers(db),
  ]);

  const plan = planOdometer(fromMotive, vehicles, latest, field || WHICH_ODOMETER);
  const out = {
    field: field || WHICH_ODOMETER,
    motiveReturned: fromMotive.length,
    ourVehicles: vehicles.length,
    wouldWrite: plan.write.length,
    backwards: plan.backwards,
    unmatched: plan.unmatched,
    noReading: plan.noReading.length,
    /* Both fields against the readings people typed in, so the choice of
       field is checkable rather than taken on trust. */
    fieldCheck: compareOdometers(fromMotive, vehicles, latest).slice(0, 40),
    sample: plan.write.slice(0, 5).map((r) => ({
      unit: r._unit, odometer: r.odometer, date: r.reading_date, gained: r._gain,
    })),
  };
  if (!write) return { dryRun: true, ...out };

  const rows = plan.write.map(({ _unit, _gain, ...r }) => r);
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    /* select() rather than a count: with ignoreDuplicates PostgREST
       returns minimal and the count comes back null, which would read as
       "wrote nothing" on a run that wrote everything. The rows it hands
       back are the ones actually inserted, duplicates already dropped. */
    const { data, error } = await db.from("tw_odometer_log")
      .upsert(rows.slice(i, i + 200), {
        onConflict: "vehicle_id,reading_date,odometer",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw error;
    written += data?.length ?? 0;
  }
  return { dryRun: false, ...out, written, skippedAsDuplicate: rows.length - written };
}

export async function runDefects({ motiveKey, db }, { write, since }) {
  const start = since || daysAgo(14);
  const [fromMotive, vehicles, existing] = await Promise.all([
    fetchInspectionDefects(motiveKey, start),
    all(db, "tw_vehicles", "id,number,motive_vehicle_id,active", "number"),
    /* note is in here because the fault key uses it — Motive's commonest
       category is "Other", where the note is the only thing that says
       which fault it actually is. */
    all(db, "tw_defects",
        "id,defect_key,unit_number,category,note,state,source,report_count," +
        "first_reported,last_reported",
        "defect_key"),
  ]);

  /* There used to be a second read here, asking for status=open. Motive
     answers 400 to that — see planClosuresFromParts — and because it ran
     before any write, it took the whole defect import down with it, not
     just closing. Nothing about closing may ever be able to do that
     again, so importing does not depend on anything closing needs, and
     the read that closing DOES need is wrapped below. */
  const plan = planDefects(fromMotive, vehicles, existing);

  /* What the DVIRs themselves say. Kept for the record; closing does not
     run on it, because a report can read "resolved" while the defect on
     it is still open. */
  const reportStates = {};
  for (const d of fromMotive)
    reportStates[d.reportStatus || "(none)"] = (reportStates[d.reportStatus || "(none)"] || 0) + 1;

  /* The per-part statuses closing actually runs on, and the one read in
     this function that is allowed to fail. If v2 is unreachable, the key
     cannot call it, or the shape changes, the import above still lands
     and closing simply does not happen this run. That is the lesson from
     the status=open bug, made structural rather than remembered. */
  let parts = new Map();
  let partsError = null;
  try { parts = await fetchInspectionParts(motiveKey, start); }
  catch (e) { partsError = String(e?.message || e).slice(0, 300); }

  const links = partsError ? [] : await all(
    db, "tw_defect_dvirs", "defect_id,log_id,part_id", "defect_id");
  const closing = planClosuresFromParts(parts, links, existing);

  const out = {
    since: start,
    motiveReturned: fromMotive.length,
    /* Checklist lines that were inspected and found fine. Reported so
       the ratio is visible: if this ever drops to zero, the filter has
       stopped working and the board is about to fill with clean rows. */
    cleanChecklistLines: fromMotive.checklistLines ?? null,
    wouldCreate: plan.create.length,
    wouldBump: plan.bump.length,
    /* One per DVIR a fault appears on. Higher than wouldCreate whenever
       the same fault was written up on more than one inspection, which
       is the normal case for anything that stays broken for a week. */
    wouldLinkDvirs: plan.links.length,
    alreadyHave: plan.already.length,
    sample: plan.create.slice(0, 5).map((r) => ({
      unit: r.unit_number, category: r.category, safety: r.safety, on: r.first_reported,
    })),
    reportStates,
    /* Non-null means closing did not even get to look this run. */
    partsError,
    partsSeen: closing.partsSeen,
    /* Every part status the feed actually returned. A value nobody has
       thought about shows up here before it decides anything. */
    partStatuses: closing.statusSeen,
    wouldClose: closing.close.length,
    wouldCloseRepaired: closing.close.filter((c) => c.wasRepaired).length,
    closeCandidates: closing.candidates,
    /* Non-null means the guard tripped and nothing will be closed. It is
       reported on a dry run too, which is the point: you see the refusal
       before you ever pass write=1. */
    closeRefused: closing.refused,
    closeSample: closing.close.slice(0, 5).map((c) => ({
      unit: c.unit_number, category: c.category,
      motiveSays: c.motiveStatus, wasRepaired: c.wasRepaired,
    })),
  };
  if (!write) return { dryRun: true, ...out };

  let created = 0;
  for (let i = 0; i < plan.create.length; i += 200) {
    const { data, error } = await db.from("tw_defects")
      .upsert(plan.create.slice(i, i + 200),
              { onConflict: "defect_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    created += data?.length ?? 0;
  }
  for (const b of plan.bump) {
    const { id, unit, category, ...cols } = b;
    const { error } = await db.from("tw_defects")
      .update({ ...cols, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }

  /* Which DVIRs each fault sits on, so a repair can be sent back to all
     of them. Written after the defects themselves, because a link needs
     the row it points at to exist; keyed on (log_id, part_id) so a rerun
     adds nothing. A failure here is logged rather than thrown: the
     defects are already imported, and a missing link costs a write-back,
     not a repair record. */
  const linked = await writeDvirLinks(db, plan.links);
  /* Closing last, so a failure here cannot stop new defects landing.
     Only state and closed_at are written: repaired_by and repair_note
     are the record of who fixed it, and closing does not get to touch
     them. */
  let closed = 0;
  const closedAt = new Date().toISOString();
  for (const c of closing.close) {
    const { error } = await db.from("tw_defects")
      .update({ state: "closed", closed_at: closedAt, updated_at: closedAt })
      .eq("id", c.id)
      /* Guards the race where a mechanic marks it repaired between the
         read and this write — that is still fine to close — but refuses
         to re-close something already closed. */
      .neq("state", "closed");
    if (error) throw error;
    closed += 1;

    const { error: logErr } = await db.from("tw_work_log").insert({
      event_type: "defect_closed",
      actor_name: "Motive sync",
      unit_number: c.unit_number,
      summary: `${c.unit_number} — ${c.category || "defect"} closed in Motive`
        + (c.wasRepaired ? ", after being repaired here" : ", without being repaired here"),
      detail: { defect_key: c.defect_key, was_repaired: c.wasRepaired,
                motive_status: c.motiveStatus, log_id: c.logId, since: start },
    });
    /* The log is a record, not a gate: a defect really is closed in
       Motive whether or not we managed to note it. */
    if (logErr) console.warn("work log write failed:", logErr.message);
  }

  return { dryRun: false, ...out, created, bumped: plan.bump.length, linked, closed };
}

async function writeDvirLinks(db, links) {
  if (!links.length) return 0;
  const byKey = new Map();
  for (const l of links) byKey.set(l.owner_key, null);

  /* PostgREST caps an `in` list by URL length long before it caps rows,
     so the ids come back in batches. */
  const keys = [...byKey.keys()];
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await db.from("tw_defects")
      .select("id,defect_key").in("defect_key", keys.slice(i, i + 100));
    if (error) { console.warn("dvir link lookup failed:", error.message); return 0; }
    for (const r of data || []) byKey.set(r.defect_key, r.id);
  }

  const rows = links
    .filter((l) => byKey.get(l.owner_key))
    .map((l) => ({
      defect_id: byKey.get(l.owner_key),
      log_id: l.log_id,
      part_id: l.part_id,
      unit_number: l.unit_number,
      reported_on: l.reported_on,
    }));

  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await db.from("tw_defect_dvirs")
      .upsert(rows.slice(i, i + 200),
              { onConflict: "log_id,part_id", ignoreDuplicates: true })
      .select("id");
    if (error) { console.warn("dvir link write failed:", error.message); return written; }
    written += data?.length ?? 0;
  }
  return written;
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export { todayISO };
