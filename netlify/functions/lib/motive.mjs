/* Pulling from Motive.

   Two things come across: the odometer on every truck, and DVIR defects.
   Both are written the same way — idempotently, so running twice changes
   nothing, and so a run that dies halfway can just be run again.

   The odometer is the part to be careful with. Tire wear in this app is
   miles per 32nd, and the miles come from the difference between the
   odometer when a tire was mounted and the odometer now. Those mounted
   readings were typed in by somebody reading a dash. So a synced number
   that measures a different thing than the dash does would not look
   wrong — it would quietly produce wear rates that are wrong, on the one
   screen people are meant to trust. Hence WHICH_ODOMETER below, and the
   guard that refuses a reading that goes backwards. */

const BASE = "https://api.gomotive.com";

/* Motive returns two. `odometer` is the engine's own, the number on the
   dash. `true_odometer` is Motive's calibrated distance, and their docs
   recommend it for service scheduling.

   We take the dash one, because it is the one our existing readings are
   in and mixing the two would corrupt every wear rate. The dry run
   reports both against what we already have, so this is checkable rather
   than assumed — see compareOdometers(). */
const WHICH_ODOMETER = "odometer";

class MotiveError extends Error {}

async function motive(path, key, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else if (v != null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: {
      "X-API-Key": key,
      /* Imperial. The fleet is in miles and the app has no unit concept —
         a silent switch to km would read as a truck doing 1.6x the miles. */
      "X-Metric-Units": "false",
      Accept: "application/json",
    },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new MotiveError(
      `Motive ${res.status} on ${path}: ${body.slice(0, 300)}`
    );
  }
  try { return JSON.parse(body); }
  catch { throw new MotiveError(`Motive sent back something that is not JSON on ${path}`); }
}

/* Motive pages at 25 by default. Ask for more, and keep going until a
   page comes back short — the same trap as the PostgREST row cap, where
   taking the first page silently means "the fleet is 25 trucks". */
async function motiveAll(path, key, params, pluck) {
  const out = [];
  for (let page = 1; page <= 200; page++) {
    const data = await motive(path, key, { ...params, per_page: 100, page_no: page });
    const batch = pluck(data);
    out.push(...batch);
    if (batch.length < 100) return out;
  }
  throw new MotiveError(`${path} did not stop paging — refusing to loop forever`);
}

/* Motive's documented shape and Motive's actual shape have already
   disagreed once here, so this can hand back what actually arrived
   rather than what we hoped for. Dry run only, behind the token. */
export async function fetchRawVehicles(key, n = 2) {
  const d = await motive("/v2/vehicle_locations", key,
                         { vehicle_status: "active", per_page: n, page_no: 1 });
  return (d.vehicles || []).slice(0, n);
}

export async function fetchVehicleOdometers(key) {
  const rows = await motiveAll(
    "/v2/vehicle_locations", key, { vehicle_status: "active" },
    (d) => d.vehicles || []
  );
  return rows.map((w) => {
    const v = w.vehicle || w;
    /* Documented at vehicle.odometer, but Motive has also been seen
       putting it inside current_location. Take whichever is actually
       there rather than trusting one spelling. */
    const loc = v.current_location || {};
    return {
      motiveId: v.id,
      number: v.number,
      odometer: num(v.odometer ?? loc.odometer),
      trueOdometer: num(v.true_odometer ?? loc.true_odometer),
      at: loc.located_at || null,
    };
  });
}

export async function fetchRawInspections(key, sinceISO, n = 2, status = "with_defects") {
  const d = await motive("/v1/inspection_reports", key,
    { start_date: sinceISO, status, per_page: n, page_no: 1 });
  return (d.inspection_reports || []).slice(0, n);
}

/* A DVIR comes back as every line of the checklist, not just the faults.
   An entry with type "none" means the driver looked at it and it was
   fine. Thirty days of those is roughly three thousand rows, and
   importing them would bury the real defects under "Air Lines — fine".
   So only minor and major are defects; everything else is a clean
   inspection and is dropped.

   Every field here sits one level lower than Motive documents it:
   defects[].defect.{...}, the report is keyed log_id rather than id,
   and there is no nested vehicle object at all — just vehicle_number.
   All of that was found by looking at a real response. */
const REAL_DEFECT = new Set(["minor", "major"]);

/* `status` filters which reports come back. Motive accepts exactly
   all, with_defects, with_no_defects, with_signature_missing, unknown,
   harmless and corrected — "open" is NOT among them and the endpoint
   answers 400 "status does not have a valid value".

   That matters because a report carries its own `status` field whose
   value IS "open", which is what led to asking for it as a filter. The
   report-level status is the DVIR's paperwork state, and it is already
   in the with_defects feed, so reading it needs no second call. */
export async function fetchInspectionDefects(key, sinceISO, status = "with_defects") {
  const rows = await motiveAll(
    "/v1/inspection_reports", key,
    { start_date: sinceISO, status },
    (d) => d.inspection_reports || []
  );
  const out = [];
  let checklistLines = 0;
  for (const w of rows) {
    const r = w.inspection_report || w;
    const reportId = r.log_id ?? r.id;
    for (const dw of r.defects || []) {
      const d = dw.defect || dw;
      const type = (d.type || "").toLowerCase();
      if (!REAL_DEFECT.has(type)) { checklistLines++; continue; }
      out.push({
        /* Stable across runs, and prefixed so it can never collide with
           a hand-logged defect — those are keyed manual:unit:timestamp. */
        key: `motive:${reportId}:${d.id}`,
        motiveVehicleId: r.vehicle?.id ?? null,
        unit: r.vehicle?.number || r.vehicle_number || "",
        date: (r.date || r.time || "").slice(0, 10),
        where: r.location || null,
        category: d.category || null,
        note: d.notes || null,
        area: d.area || null,
        /* Motive's own word for it. The report-level status is about the
           paperwork being signed off, not about the truck. */
        unsafe: type === "major",
        /* The DVIR's own paperwork state. Kept for the dry run's
           reportStates, and deliberately NOT what closing runs on — a
           report can read "resolved" while the defect on it is still
           open. See planClosuresFromParts. */
        reportStatus: r.status || null,
        /* Deliberately not kept: picture_url is a signed S3 link that
           expires in fifteen minutes, so storing it would save a dead
           link. */
      });
    }
  }
  out.checklistLines = checklistLines;
  return out;
}

/* The state of every inspected part, which is what says whether a fault
   has been dealt with in Motive.

   This reads /v2, not the /v1 feed the import uses, because v1 hands
   back a report-level `defects` array and v2 hands back `inspected_parts`
   with a `status` on each one. That per-part status is the whole point:
   the report's own status is not it. A live example — HT-1373 on
   2026-09-04, report 10954864043 — comes back with status "resolved"
   while its one defect part, "Check engine and wrench light is on", is
   still "open". Closing on the report status would have marked that
   fault dealt with while the truck still had it.

   Asked for as with_defects: a report that had a defect still has one
   after the defect is resolved, so the resolution shows up here. If
   Motive ever moves resolved reports out of that feed, parts stop being
   seen and nothing closes — which is the safe way for this to break. */
export async function fetchInspectionParts(key, sinceISO, status = "with_defects") {
  const rows = await motiveAll(
    "/v2/inspection_reports", key,
    { start_date: sinceISO, status },
    (d) => d.inspection_reports || []
  );
  const out = new Map();
  for (const w of rows) {
    const r = w.inspection_report || w;
    const logId = r.log_id ?? r.id;
    for (const part of r.inspected_parts || []) {
      out.set(`${logId}:${part.id}`, {
        logId,
        partId: part.id,
        reportId: r.id ?? null,
        status: part.status || null,
        type: (part.type || "").toLowerCase(),
        /* Filled in when a mechanic actually records a resolution.
           Unambiguous where a bare status is not. */
        hasMechanic: part.mechanic_details != null,
      });
    }
  }
  return out;
}

const num = (x) => (x == null || x === "" || Number.isNaN(Number(x)) ? null : Number(x));

export const todayISO = () => new Date().toISOString().slice(0, 10);

/* ── Deciding what to write ──────────────────────────────────────── */

/* An odometer only goes up. If Motive says a truck has fewer miles than
   we already recorded, something is wrong — the wrong field, a remapped
   unit, a replaced ECM — and writing it would put a backwards reading
   into the middle of a wear calculation. Report it, do not write it. */
export function planOdometer(fromMotive, vehicles, latestByVehicle, field = WHICH_ODOMETER) {
  const byMotiveId = new Map(
    vehicles.filter((v) => v.motive_vehicle_id != null)
            .map((v) => [String(v.motive_vehicle_id), v])
  );
  const write = [], backwards = [], unmatched = [], noReading = [];

  for (const r of fromMotive) {
    const v = byMotiveId.get(String(r.motiveId));
    if (!v) { unmatched.push({ motiveId: r.motiveId, number: r.number }); continue; }

    const raw = field === "true_odometer" ? r.trueOdometer : r.odometer;
    if (raw == null) { noReading.push({ unit: v.number }); continue; }
    const odometer = Math.round(raw);

    const known = latestByVehicle.get(v.id);
    if (known != null && odometer < known) {
      backwards.push({ unit: v.number, weHave: known, motiveSays: odometer });
      continue;
    }
    write.push({
      vehicle_id: v.id,
      reading_date: (r.at || "").slice(0, 10) || todayISO(),
      odometer,
      source: "motive",
      recorded_by: "motive-sync",
      _unit: v.number,
      _gain: known == null ? null : odometer - known,
    });
  }
  return { write, backwards, unmatched, noReading };
}

/* Which of the two fields actually lines up with the readings people
   typed in. Run before trusting either. */
export function compareOdometers(fromMotive, vehicles, latestByVehicle) {
  const byMotiveId = new Map(
    vehicles.filter((v) => v.motive_vehicle_id != null)
            .map((v) => [String(v.motive_vehicle_id), v])
  );
  const rows = [];
  for (const r of fromMotive) {
    const v = byMotiveId.get(String(r.motiveId));
    if (!v) continue;
    const known = latestByVehicle.get(v.id);
    if (known == null) continue;
    rows.push({
      unit: v.number,
      weHave: known,
      odometer: r.odometer == null ? null : Math.round(r.odometer),
      trueOdometer: r.trueOdometer == null ? null : Math.round(r.trueOdometer),
      offBy: r.odometer == null ? null : Math.round(r.odometer) - known,
      trueOffBy: r.trueOdometer == null ? null : Math.round(r.trueOdometer) - known,
    });
  }
  return rows;
}

/* Motive issues a fresh defect id on every inspection, so the same broken
   mirror reported Monday and Tuesday arrives as two unrelated defects. If
   we took them at face value the board would fill with duplicates of one
   physical problem.

   So a defect that matches one already open on the same unit, in the same
   category, is treated as the same fault reported again: it bumps the
   count and the last-reported date rather than opening a second row. That
   is what report_count and last_reported are in the schema for.

   A REPAIRED defect is never matched against. If the mirror was fixed and
   is written up again, it genuinely broke again, and that is a new job —
   not a reopening of the closed one. */
export function planDefects(fromMotive, vehicles, existing) {
  const byMotiveId = new Map(
    vehicles.filter((v) => v.motive_vehicle_id != null)
            .map((v) => [String(v.motive_vehicle_id), v])
  );
  /* Inspection reports carry no vehicle id, only vehicle_number, so the
     unit number has to be able to do the matching on its own. */
  const byNumber = new Map(vehicles.map((v) => [norm(v.number), v]));

  const seenKeys = new Set(existing.map((d) => d.defect_key));
  /* Only open and claimed ones are candidates to be "the same fault".
     A repaired or closed one is finished business: a fresh report of the
     same fault is a NEW defect, not a reason to reopen the old row and
     lose who fixed it and what they wrote. */
  const openIdx = new Map();
  for (const d of existing) {
    if (d.state === "repaired" || d.state === "closed") continue;
    openIdx.set(faultOf(d.unit_number, d.category, d.note), d);
  }

  const create = [], bump = [], already = [];
  /* Every DVIR a fault was written up on, not just the one that opened
     the row. A fault reported eight mornings running is eight separate
     Motive defects on eight separate reports; the board rightly shows
     one job, but telling Motive it is fixed means telling all eight.
     Without this only the first would ever be closed. */
  const links = [];
  const link = (ownerKey, d, unit, date) => {
    const [, logId, partId] = d.key.split(":");
    links.push({
      owner_key: ownerKey,
      log_id: Number(logId),
      part_id: Number(partId),
      unit_number: unit,
      reported_on: date,
    });
  };

  for (const d of fromMotive) {
    if (seenKeys.has(d.key)) { already.push(d.key); continue; }
    const v = (d.motiveVehicleId != null && byMotiveId.get(String(d.motiveVehicleId)))
      || byNumber.get(norm(d.unit)) || null;
    const unit = v ? v.number : (d.unit || "unknown");
    const date = d.date || todayISO();

    const open = openIdx.get(faultOf(unit, d.category, d.note));

    /* Matched a row this same run created rather than one already in the
       database. There is no id to update yet, so fold the repeat into the
       pending insert instead of emitting an UPDATE against a null id. */
    if (open && open.id == null) {
      link(open.defect_key, d, unit, date);
      open.report_count = (open.report_count || 1) + 1;
      if (date > open.last_reported) open.last_reported = date;
      if (date < open.first_reported) open.first_reported = date;
      if (d.unsafe) { open.severity = "major"; open.safety = "unsafe"; }
      continue;
    }

    if (open) {
      link(open.defect_key, d, unit, date);
      bump.push({
        id: open.id,
        unit,
        category: d.category,
        /* Dates only ever move forward. A backfill reaching further back
           than the row's first_reported would otherwise make
           last_reported < first_reported and trip the check constraint. */
        last_reported: date > open.last_reported ? date : open.last_reported,
        first_reported: date < open.first_reported ? date : open.first_reported,
        report_count: (open.report_count || 1) + 1,
        /* An unsafe write-up on a fault we had logged as minor upgrades
           it. It never downgrades: once a truck is called unsafe, a later
           quieter report is not permission to put it back on the road. */
        ...(d.unsafe ? { severity: "major", safety: "unsafe" } : {}),
      });
      open.report_count = (open.report_count || 1) + 1;
      open.last_reported = date > open.last_reported ? date : open.last_reported;
      continue;
    }

    const row = {
      defect_key: d.key,
      report_count: 1,
      vehicle_id: v ? v.id : null,
      unit_number: unit,
      category: d.category,
      note: d.note,
      driver: d.driver || null,
      location: d.where,
      severity: d.unsafe ? "major" : "minor",
      safety: d.unsafe ? "unsafe" : "safe",
      first_reported: date,
      last_reported: date,
      source: "motive",
      state: "open",
      created_by: "motive-sync",
    };
    create.push(row);
    link(d.key, d, unit, date);
    /* The same object, not a copy: a repeat later in this run folds into
       the row that is about to be inserted. */
    openIdx.set(faultOf(unit, d.category, d.note), row);
  }
  return { create, bump, already, links };
}

/* What counts as "the same fault reported again".

   The notes are part of it, not just the category. Motive's commonest
   category is literally "Other", where the note IS the fault — merging
   two different "Other" write-ups on one truck would silently lose a
   real defect. Splitting when we should have merged leaves a visible
   duplicate somebody can close in a second; merging when we should have
   split loses a fault nobody ever sees. So it splits. */
const norm = (x) => (x || "").trim().toLowerCase().replace(/\s+/g, " ");
const faultOf = (unit, category, note) =>
  `${norm(unit)}|${norm(category)}|${norm(note)}`;


/* ── Closing a defect ─────────────────────────────────────────────
   Jason's rule 1 stands: Motive owns whether a fault is dealt with, and
   this only ever agrees with Motive. What changed is that there is now a
   signal worth agreeing with.

   The first attempt read a second feed, `status=open`, and closed
   anything missing from it. That feed does not exist — `open` is a value
   the report-level status FIELD takes, not a value the status FILTER
   accepts, and Motive answers 400. The live dry run caught it.

   The rebuild after that was going to use the report-level status from
   the feed we already fetch. That is also wrong, and it took a live
   report to see why: report 10954864043 on HT-1373 comes back with
   status "resolved" while the defect on it is still "open". A report's
   status is about the report. A defect's status is on the part.

   So closing now reads the per-part status out of the v2 feed, and it is
   a POSITIVE rule — Motive says this part is no longer open — rather
   than the absence-inference it started as. Absence closes nothing:
   a part we did not see stays open here, so a broken feed, a bad key or
   a changed parameter can only ever fail to close, never over-close.

   Four fences, and each one guards a different way of being wrong:

   1. **Only Motive's own.** A hand-logged defect is not Motive's to
      close.

   2. **Only parts we actually saw, with a status we actually got.** No
      part in the feed, or a null status, means no opinion, means leave
      it alone.

   3. **"good" is not "repaired".** A part we imported as a defect coming
      back "good" is a contradiction, not a repair — most likely the
      record changed shape under us. It closes only if a mechanic's
      details are attached, which is somebody actually signing off.
      Every other non-open value (repaired, resolved, corrected,
      no_repair_needed, harmless, and whatever Motive adds next) means
      dealt with. Stated as a positive rule about `open` rather than a
      list of closed-states to match, because the next unseen value would
      otherwise read as still open forever.

   4. **A collapsed run refuses.** Closing more than 80% of candidates at
      once, above a floor of four, looks like a feed problem rather than
      a week's repairs.

   Closing never touches repaired_by or repair_note. Who fixed it and
   what they wrote is the record; closing only says Motive agrees. */

export const CLOSE_GUARD = { maxRatio: 0.8, minToApplyRatio: 4 };

/* `parts` is the map from fetchInspectionParts, keyed "<log_id>:<part_id>".
   `links` are our tw_defect_dvirs rows — every DVIR each fault was
   written up on. `defects` are the rows the shop holds.

   A fault is closed when ANY of its DVIRs says Motive is done with it.
   The shop sees one job; the moment somebody deals with it in Motive,
   that job is finished here, whether or not the older write-ups of the
   same fault were each resolved individually. An older report left open
   cannot drag it back: planDefects never matches a repeat against a
   closed row, so a genuine recurrence arrives as a new defect with its
   own key — which is what an auditor should read. */
export function planClosuresFromParts(parts, links, defects, { guard = CLOSE_GUARD } = {}) {
  const byId = new Map(defects.map((d) => [d.id, d]));
  const statusSeen = {};
  const dealtWith = new Map();

  for (const l of links) {
    const part = parts.get(`${l.log_id}:${l.part_id}`);
    if (!part) continue;
    const status = (part.status || "").toLowerCase();
    /* Counted for every part we looked at, so a value nobody has thought
       about is visible in a dry run before it ever matters. */
    statusSeen[status || "(none)"] = (statusSeen[status || "(none)"] || 0) + 1;
    if (!status || status === "open") continue;
    if (status === "good" && !part.hasMechanic) continue;
    if (!dealtWith.has(l.defect_id))
      dealtWith.set(l.defect_id, { status, hasMechanic: part.hasMechanic, logId: l.log_id });
  }

  const candidates = defects.filter((d) => d.source === "motive" && d.state !== "closed");
  const close = [];
  for (const d of candidates) {
    const hit = dealtWith.get(d.id);
    if (!hit) continue;
    close.push({
      id: d.id,
      defect_key: d.defect_key,
      unit_number: d.unit_number,
      category: d.category,
      motiveStatus: hit.status,
      logId: hit.logId,
      /* Reported separately because they mean different things: a
         repaired one closing is the loop finishing, an open one closing
         means somebody dealt with it outside this system. */
      wasRepaired: d.state === "repaired",
    });
  }

  const ratio = candidates.length ? close.length / candidates.length : 0;
  const refuse =
    close.length >= guard.minToApplyRatio && ratio > guard.maxRatio
      ? `This would close ${close.length} of ${candidates.length} defects `
        + `(${Math.round(ratio * 100)}%), over the ${Math.round(guard.maxRatio * 100)}% `
        + `guard. That looks like a feed problem rather than a week's repairs, `
        + `so nothing was closed.`
      : null;

  return {
    close: refuse ? [] : close,
    candidates: candidates.length,
    partsSeen: parts.size,
    statusSeen,
    refused: refuse,
  };
}

export { MotiveError, WHICH_ODOMETER };

/* ── Telling Motive a defect was repaired ─────────────────────────
   The other direction, and the one that writes to somebody else's
   system of record. A DVIR is the DOT document; what goes back on it is
   a mechanic's certification that a fault was fixed, so the fences here
   are about never certifying something a person did not.

   What Motive accepts is a `defect_statuses` block: mechanic details
   plus `resolved_defects`, a list of inspected-part ids, and a status of
   open, repaired or no_repair_needed. The part ids are the ones we
   already store — a defect_key of motive:2426508359:5708807065 carries
   the report's log_id and the inspected-part id, and 5708807065 is
   exactly what resolved_defects wants. That was checked against a live
   DVIR rather than assumed.

   What is NOT done here:

   - The report-level status is never sent. With Defect Level Resolution
     enabled Motive answers 400 to it, and this fleet has it enabled
     (every inspected part comes back with its own status and a
     mechanic_details slot). Resolving parts is the whole job.

   - No signature. mechanic_signature_url is produced when a person
     signs in Motive; nothing here forges one. This records who repaired
     the fault and what they wrote, which is what the app actually
     knows. */

const RESOLVE_STATUS = "repaired";

/* Motive's docs are not reachable from the build environment, so the
   request envelope is the one thing here that was not verified against a
   live response. Their other update endpoints wrap the body in the
   resource name, so that is the default; a 400 or 422 retries once
   unwrapped and the result says which shape Motive took. A rejected
   request changed nothing, so the retry cannot double-apply. */
async function putJSON(path, key, body) {
  const res = await fetch(new URL(BASE + path), {
    method: "PUT",
    headers: {
      "X-API-Key": key,
      "X-Metric-Units": "false",
      "content-type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, text: (await res.text()).slice(0, 500) };
}

export async function putDefectStatuses(key, reportId, defectStatuses) {
  const inner = { defect_statuses: defectStatuses };
  let r = await putJSON(`/v2/inspection_reports/${reportId}`, key,
                        { inspection_report: inner });
  let shape = "wrapped";
  if (!r.ok && (r.status === 400 || r.status === 422)) {
    const flat = await putJSON(`/v2/inspection_reports/${reportId}`, key, inner);
    if (flat.ok) { r = flat; shape = "flat"; }
    else r = { ...r, text: `${r.text} | unwrapped retry: ${flat.status} ${flat.text}` };
  }
  return { ...r, shape };
}

/* Finding the id the update endpoint wants.

   A report has two: log_id, which is what a defect_key was built from,
   and id, which is what /v2/inspection_reports/{id} addresses. They are
   different numbers on the same report — 2426508359 and 10955122615 on
   the DVIR this was checked against. Defects imported before this
   existed only carry log_id, so it is looked up: the day's reports for
   that one vehicle, matched on log_id. One extra GET per report, and the
   answer is cached on the row afterwards. */
export async function findReportId(key, { motiveVehicleId, date, logId }) {
  if (!date || !logId) return null;

  const match = (d) => {
    for (const w of d.inspection_reports || []) {
      const r = w.inspection_report || w;
      if (String(r.log_id) === String(logId)) return r.id ?? null;
    }
    return null;
  };

  /* Narrowed to the one vehicle when we can. Whether Motive wants
     vehicle_ids repeated or comma-joined is not something the docs here
     could settle, so a filter that silently matches nothing falls
     through to the unfiltered day rather than reporting "no such
     report". Slower, and right either way. */
  if (motiveVehicleId) {
    const d = await motive("/v2/inspection_reports", key, {
      vehicle_ids: [motiveVehicleId],
      start_date: date, end_date: date, status: "all",
      per_page: 100, page_no: 1,
    });
    const hit = match(d);
    if (hit) return hit;
  }

  for (let page = 1; page <= 20; page++) {
    const d = await motive("/v2/inspection_reports", key, {
      start_date: date, end_date: date, status: "all",
      per_page: 100, page_no: page,
    });
    const hit = match(d);
    if (hit) return hit;
    if ((d.inspection_reports || []).length < 100) return null;
  }
  return null;
}

/* Which DVIR links have drifted from what the shop holds.

   Kept as a plain function over two lists rather than a PostgREST
   embedded filter. The query it replaces would have been one round trip,
   but `!inner` with a filter on the embedded table is a shape nothing
   else in this codebase uses and that nothing here can exercise — and
   the failure mode of getting it subtly wrong is sending the wrong
   defect to a federal record. Two small reads and a join in memory is
   the same answer, provably. */
export function pickPending(links, defectsById, { maxAttempts = 3 } = {}) {
  const out = [];
  for (const l of links) {
    if ((l.attempts || 0) >= maxAttempts) continue;
    const d = defectsById.get(l.defect_id);
    if (!d || d.source !== "motive") continue;

    /* Never sent, and the shop says it is fixed. */
    if (!l.sent_status && d.state === "repaired") { out.push({ link: l, defect: d, want: "repaired" }); continue; }
    /* We told Motive it was fixed and it is back on the queue. */
    if (l.sent_status === "repaired" && (d.state === "open" || d.state === "claimed"))
      out.push({ link: l, defect: d, want: "open" });
    /* Everything else agrees, or is closed, and is left alone. */
  }
  return out;
}

/* What to send, worked out without touching the network so it can be
   tested and so a dry run shows the exact payload.

   Two directions, because both are true statements about a truck:

     repaired — the app holds the fault as fixed, and Motive has not been
                told yet.
     open     — we told Motive it was fixed and the shop has since put it
                back on the queue. Leaving "repaired" standing on the
                DVIR after that is the one outcome worth more than a bit
                of extra code: it is a federal record saying a fault was
                certified fixed when the people who would know say it
                is not.

   One PUT per report, because that is what the endpoint addresses.
   Inside it, one defect_statuses entry per (mechanic, note, status)
   pair: two mechanics who fixed two faults on the same DVIR each get
   their own name against their own parts rather than one being credited
   with both. */
export function planResolve(pending, { mechanics = new Map(), limit = 25 } = {}) {
  const calls = [];
  const skipped = [];
  const byReport = new Map();

  for (const p of pending) {
    /* Belt and braces. runResolve already asks the database for exactly
       these, but this is the last point before a write to a DOT record,
       and a query that quietly widened is not something to find out
       about afterwards. */
    if (p.source !== "motive") { skipped.push({ ...p, why: "not a Motive defect" }); continue; }
    if (!p.partId || !p.logId) { skipped.push({ ...p, why: "no Motive ids" }); continue; }
    if (p.want === "repaired") {
      if (p.state !== "repaired") { skipped.push({ ...p, why: `state is ${p.state}` }); continue; }
      if (!p.repairedBy) { skipped.push({ ...p, why: "nobody is recorded as having repaired it" }); continue; }
    } else if (p.want === "open") {
      if (p.state === "repaired") { skipped.push({ ...p, why: "repaired again before the reopen was sent" }); continue; }
    } else {
      skipped.push({ ...p, why: `not a status this sends: ${p.want}` });
      continue;
    }

    if (!byReport.has(p.logId)) byReport.set(p.logId, []);
    byReport.get(p.logId).push(p);
  }

  for (const [logId, rows] of byReport) {
    if (calls.length >= limit) break;
    const groups = new Map();
    for (const p of rows) {
      /* On a reopen the repair details are gone from the defect — the
         app clears them, because leaving a repaired_by on something that
         is not repaired would be a lie. The name that went to Motive is
         kept on the link instead, so the correction carries the same
         signature as the claim it withdraws. */
      const who = p.want === "open" ? (p.sentBy || p.repairedBy || "Shop") : p.repairedBy;
      const note = p.want === "open"
        ? "Reopened in the shop — the fault is still present."
        : ((p.repairNote || "").trim() || "Repaired");
      const gk = `${p.want}|${who}|${note}`;
      if (!groups.has(gk)) {
        groups.set(gk, {
          /* Sent when we know it. Most of the shop are Motive users, but
             the names do not always match — Dylan/Dillon, Isaah/Isiaih —
             so this is a stored mapping rather than a fuzzy match on a
             name, which would credit the wrong person. */
          ...(mechanics.get(who) ? { mechanic_id: mechanics.get(who) } : {}),
          mechanic_name: who,
          mechanic_note: note,
          status: p.want,
          resolved_defects: [],
        });
      }
      groups.get(gk).resolved_defects.push(p.partId);
    }
    calls.push({
      logId,
      reportId: rows[0].reportId || null,
      motiveVehicleId: rows[0].motiveVehicleId || null,
      unit: rows[0].unit,
      date: rows[0].reportedOn,
      /* Carried per link, because one PUT can be half repairs and half
         reopens and each row has to be stamped with what it actually
         said. */
      links: rows.map((r) => ({ id: r.linkId, want: r.want, by: r.want === "open"
        ? (r.sentBy || r.repairedBy || "Shop") : r.repairedBy })),
      defect_statuses: [...groups.values()],
    });
  }
  return { calls, skipped };
}

export { RESOLVE_STATUS };
