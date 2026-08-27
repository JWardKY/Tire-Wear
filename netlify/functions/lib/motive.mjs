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

export async function fetchRawInspections(key, sinceISO, n = 2) {
  const d = await motive("/v1/inspection_reports", key,
    { start_date: sinceISO, status: "with_defects", per_page: n, page_no: 1 });
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

export async function fetchInspectionDefects(key, sinceISO) {
  const rows = await motiveAll(
    "/v1/inspection_reports", key,
    { start_date: sinceISO, status: "with_defects" },
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
        /* Deliberately not kept: picture_url is a signed S3 link that
           expires in fifteen minutes, so storing it would save a dead
           link. */
      });
    }
  }
  out.checklistLines = checklistLines;
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
  /* Only open and claimed ones are candidates to be "the same fault". */
  const openIdx = new Map();
  for (const d of existing) {
    if (d.state === "repaired") continue;
    openIdx.set(faultOf(d.unit_number, d.category, d.note), d);
  }

  const create = [], bump = [], already = [];

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
      open.report_count = (open.report_count || 1) + 1;
      if (date > open.last_reported) open.last_reported = date;
      if (date < open.first_reported) open.first_reported = date;
      if (d.unsafe) { open.severity = "major"; open.safety = "unsafe"; }
      continue;
    }

    if (open) {
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
    /* The same object, not a copy: a repeat later in this run folds into
       the row that is about to be inserted. */
    openIdx.set(faultOf(unit, d.category, d.note), row);
  }
  return { create, bump, already };
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

export { MotiveError, WHICH_ODOMETER };
