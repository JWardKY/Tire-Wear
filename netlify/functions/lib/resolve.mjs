/* Sending a repair back to Motive.

   A mechanic marks a defect repaired in the app; this tells Motive's
   DVIR the same thing, with their name and their note on it.

   The whole file is built around one asymmetry. Reading Motive wrong
   shows up as bad data on our screens, which somebody notices and we
   fix. Writing Motive wrong puts a false repair certification on a
   federal inspection record, which nobody notices, and which is the
   thing an auditor reads. So:

   - Nothing writes unless MOTIVE_WRITEBACK is "on". Not a dry-run flag
     that defaults to writing, not a comment — an environment variable
     that has to be set on purpose, so the first live write is somebody's
     decision rather than a deploy's side effect.

   - Only defects the app itself holds as repaired, from Motive, with a
     named mechanic against them. planResolve re-checks all three
     immediately before building the payload.

   - A defect resolves once. tw_defect_dvirs.sent_status is stamped only
     after Motive returns 2xx, and a row is only sent again when what the
     app holds and what Motive holds have actually diverged — which is
     also how a reopen gets sent: the app says open, Motive says
     repaired, so the correction goes out.

   - Failures are recorded and give up. Three attempts, then the row sits
     with its error visible rather than hammering Motive forever. */

import { createClient } from "@supabase/supabase-js";
import { findReportId, putDefectStatuses, planResolve, pickPending } from "./motive.mjs";

export const MAX_ATTEMPTS = 3;

/* Same shape as sync.mjs's env(), minus the insistence on Motive: this
   also runs as a reporting dry run where a missing key is worth saying
   plainly rather than throwing. */
export function env() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Not configured: SUPABASE_URL / SUPABASE_ANON_KEY are not set.");
  return {
    motiveKey: process.env.MOTIVE_API_KEY || null,
    /* The switch. Anything other than "on" and this reports what it
       would send and sends nothing. */
    enabled: (process.env.MOTIVE_WRITEBACK || "").trim().toLowerCase() === "on",
    db: createClient(url, key),
  };
}

/* Two plain reads. The join happens in pickPending, where it can be
   tested — see the note there. */
async function readLinksAndDefects(db) {
  const { data: links, error: e1 } = await db.from("tw_defect_dvirs")
    .select("id,defect_id,log_id,part_id,report_id,unit_number,reported_on," +
            "attempts,sent_status,sent_by")
    .lt("attempts", MAX_ATTEMPTS)
    .order("reported_on", { ascending: true })
    .limit(2000);
  if (e1) throw e1;

  const { data: defects, error: e2 } = await db.from("tw_defects")
    .select("id,defect_key,state,source,repaired_by,repair_note,category")
    .eq("source", "motive")
    .neq("state", "closed")
    .limit(2000);
  if (e2) throw e2;

  return { links: links || [], defectsById: new Map((defects || []).map((d) => [d.id, d])) };
}

/* Name as the app knows it → Motive user id, for the mechanics who have
   one. Missing is fine: the payload falls back to the name alone. */
async function mechanicIds(db) {
  const { data, error } = await db.from("tw_mechanics").select("name,motive_user_id");
  if (error) throw error;
  const m = new Map();
  for (const r of data || []) if (r.motive_user_id) m.set(r.name, Number(r.motive_user_id));
  return m;
}

async function vehicleMotiveIds(db) {
  const { data, error } = await db.from("tw_vehicles").select("number,motive_vehicle_id");
  if (error) throw error;
  const m = new Map();
  for (const r of data || []) if (r.motive_vehicle_id) m.set(r.number, Number(r.motive_vehicle_id));
  return m;
}

export async function runResolve({ motiveKey, enabled, db }, { write = false, limit = 25 } = {}) {
  const [{ links, defectsById }, mechanics, vehicles] = await Promise.all([
    readLinksAndDefects(db), mechanicIds(db), vehicleMotiveIds(db),
  ]);

  const pending = pickPending(links, defectsById, { maxAttempts: MAX_ATTEMPTS })
    .map(({ link: l, defect: d, want }) => ({
      linkId: l.id,
      logId: l.log_id,
      partId: l.part_id,
      reportId: l.report_id,
      unit: l.unit_number,
      reportedOn: l.reported_on,
      motiveVehicleId: vehicles.get(l.unit_number) || null,
      defectId: d.id,
      defectKey: d.defect_key,
      category: d.category,
      state: d.state,
      source: d.source,
      repairedBy: d.repaired_by,
      repairNote: d.repair_note,
      sentBy: l.sent_by,
      want,
    }));

  const plan = planResolve(pending, { mechanics, limit });
  const out = {
    pending: pending.length,
    reportsToUpdate: plan.calls.length,
    defectsToResolve: plan.calls.reduce(
      (n, c) => n + c.links.filter((l) => l.want === "repaired").length, 0),
    /* Reported on its own, because it means something different and
       worse: a repair we already certified to Motive is being withdrawn. */
    defectsToReopen: plan.calls.reduce(
      (n, c) => n + c.links.filter((l) => l.want === "open").length, 0),
    skipped: plan.skipped.map((s) => ({ unit: s.unit, key: s.defectKey, why: s.why })),
    mechanicsMapped: mechanics.size,
    /* The exact bodies. A dry run is only useful if it shows what would
       actually be sent, names and notes included. */
    payloads: plan.calls.slice(0, 5).map((c) => ({
      report: c.reportId || `(look up from log_id ${c.logId})`,
      unit: c.unit, defect_statuses: c.defect_statuses,
    })),
  };

  if (!write) return { dryRun: true, writebackEnabled: enabled, ...out };
  if (!enabled)
    return { dryRun: true, writebackEnabled: false, ...out,
             refused: "MOTIVE_WRITEBACK is not \"on\", so nothing was sent to Motive." };
  if (!motiveKey)
    return { dryRun: true, writebackEnabled: true, ...out,
             refused: "MOTIVE_API_KEY is not set, so nothing was sent to Motive." };

  const now = new Date().toISOString();
  let updated = 0, failed = 0;
  const results = [];

  for (const call of plan.calls) {
    let reportId = call.reportId;
    try {
      if (!reportId) {
        reportId = await findReportId(motiveKey, {
          motiveVehicleId: call.motiveVehicleId, date: call.date, logId: call.logId,
        });
        if (!reportId) throw new Error(
          `No Motive report found for log_id ${call.logId} on ${call.date}`);
        /* Cached so the next defect on this DVIR costs no lookup. */
        await db.from("tw_defect_dvirs").update({ report_id: reportId })
          .eq("log_id", call.logId);
      }

      const res = await putDefectStatuses(motiveKey, reportId, call.defect_statuses);
      if (!res.ok) throw new Error(`Motive ${res.status}: ${res.text}`);

      /* Stamped only now, and per link, because one PUT can carry both
         a repair and a reopen. A row Motive did not accept stays
         pending, which is the safe direction to be wrong in. */
      for (const l of call.links) {
        const { error } = await db.from("tw_defect_dvirs")
          .update({ sent_status: l.want, sent_at: now, sent_by: l.by,
                    report_id: reportId, last_error: null })
          .eq("id", l.id);
        if (error) throw error;
      }

      updated += 1;
      results.push({ unit: call.unit, report: reportId, shape: res.shape,
                     defects: call.links.length, ok: true });

      const names = [...new Set(call.defect_statuses.map((s) => s.mechanic_name))].join(", ");
      const reopened = call.links.filter((l) => l.want === "open").length;
      const repaired = call.links.length - reopened;
      const { error: logErr } = await db.from("tw_work_log").insert({
        event_type: "defect_resolved_in_motive",
        actor_name: names,
        unit_number: call.unit,
        summary: `${call.unit} — Motive DVIR updated: `
          + [repaired && `${repaired} marked repaired`,
             reopened && `${reopened} put back to open`].filter(Boolean).join(", "),
        detail: { report_id: reportId, log_id: call.logId, defect_statuses: call.defect_statuses },
      });
      if (logErr) console.warn("work log write failed:", logErr.message);
    } catch (e) {
      failed += 1;
      const message = String(e?.message || e).slice(0, 400);
      results.push({ unit: call.unit, report: reportId || null, ok: false, error: message });
      /* Counted per attempt, so a report that keeps failing stops being
         retried instead of being sent every time the app nudges. */
      for (const l of call.links) {
        const row = links.find((r) => r.id === l.id);
        await db.from("tw_defect_dvirs")
          .update({ attempts: (row?.attempts || 0) + 1, last_error: message })
          .eq("id", l.id);
      }
    }
  }

  return { dryRun: false, writebackEnabled: true, ...out, updated, failed, results };
}
