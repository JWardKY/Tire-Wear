/* The Motive sync logic, tested without Motive.

   Everything that decides what gets written is a pure function over
   fixtures here, which is the point of keeping it separate from the
   fetching: the interesting failures are all in the deciding, and they
   are the ones that would quietly corrupt real data.

   Run:  node scripts/test-motive.mjs
*/
import { planOdometer, planDefects, planClosures, CLOSE_GUARD }
  from "../netlify/functions/lib/motive.mjs";
import { compareOdometers } from "../netlify/functions/lib/motive.mjs";
import { makeChecks, report } from "./_testkit.mjs";

const { state, is, truthy } = makeChecks();

const VEH = [
  { id: "v1", number: "DT-882", motive_vehicle_id: 101, active: true },
  { id: "v2", number: "DT-901", motive_vehicle_id: 102, active: true },
  { id: "v3", number: "HT-140", motive_vehicle_id: null, active: true },
];
const at = (d) => `${d}T12:00:00Z`;

/* ── Odometer ─────────────────────────────────────────────────── */

{
  const motive = [
    { motiveId: 101, number: "DT-882", odometer: 412350.4, trueOdometer: 160274, at: at("2026-08-27") },
    { motiveId: 102, number: "DT-901", odometer: 88000, trueOdometer: 87990, at: at("2026-08-27") },
    { motiveId: 999, number: "GHOST-1", odometer: 5, trueOdometer: 5, at: at("2026-08-27") },
  ];
  const latest = new Map([["v1", 412000]]);
  const p = planOdometer(motive, VEH, latest);

  is(p.write.length, 2, "two trucks matched by their Motive id");
  is(p.unmatched.length, 1, "a Motive truck we do not have is reported, not guessed at");
  is(p.unmatched[0].number, "GHOST-1", "and it says which one");
  is(p.write[0].odometer, 412350, "the reading is rounded to a whole mile");
  is(p.write[0].source, "motive", "and marked as coming from Motive");
  is(p.write[0].reading_date, "2026-08-27", "dated from Motive's own timestamp");
  is(p.write[0]._gain, 350, "the gain since our last reading is reported");
  is(p.write[1]._gain, null, "a truck with no previous reading has no gain");
}

{
  /* The one that matters. Our tire math subtracts a mounted odometer from
     a current one, so a reading that goes backwards produces negative
     miles run and a wear rate that is nonsense. */
  const motive = [
    { motiveId: 101, number: "DT-882", odometer: 160274, trueOdometer: 160274, at: at("2026-08-27") },
  ];
  const p = planOdometer(motive, VEH, new Map([["v1", 412000]]));
  is(p.write.length, 0, "a reading below what we already have is NOT written");
  is(p.backwards.length, 1, "it is reported instead");
  is(p.backwards[0].weHave, 412000, "saying what we hold");
  is(p.backwards[0].motiveSays, 160274, "and what Motive claimed");
}

{
  const motive = [
    { motiveId: 101, number: "DT-882", odometer: 412000, trueOdometer: 412000, at: at("2026-08-27") },
  ];
  const p = planOdometer(motive, VEH, new Map([["v1", 412000]]));
  is(p.write.length, 1, "a reading equal to what we have is allowed through");
  truthy(p.backwards.length === 0, "and is not treated as going backwards");
}

{
  const motive = [{ motiveId: 101, number: "DT-882", odometer: null, trueOdometer: null, at: at("2026-08-27") }];
  const p = planOdometer(motive, VEH, new Map());
  is(p.write.length, 0, "a truck with no odometer at all is skipped");
  is(p.noReading.length, 1, "and counted");
}

{
  const motive = [{ motiveId: 101, number: "DT-882", odometer: 1, trueOdometer: 999, at: at("2026-08-27") }];
  const p = planOdometer(motive, VEH, new Map(), "true_odometer");
  is(p.write[0].odometer, 999, "asking for true_odometer uses that field instead");
}

{
  const motive = [{ motiveId: 101, number: "DT-882", odometer: 412350, trueOdometer: 160274, at: at("2026-08-27") }];
  const rows = compareOdometers(motive, VEH, new Map([["v1", 412000]]));
  is(rows.length, 1, "the field comparison only covers trucks we can check");
  is(rows[0].offBy, 350, "the dash reading is 350 off ours");
  is(rows[0].trueOffBy, -251726, "and the calibrated one is wildly off, which is the point");
}

{
  const motive = [{ motiveId: 101, number: "DT-882", odometer: 5, trueOdometer: 5, at: null }];
  const p = planOdometer(motive, VEH, new Map());
  truthy(/^\d{4}-\d{2}-\d{2}$/.test(p.write[0].reading_date),
         "a missing Motive timestamp falls back to today rather than writing null");
}

/* ── Defects ──────────────────────────────────────────────────── */

const d = (o) => ({
  key: "motive:1:1", motiveVehicleId: 101, unit: "DT-882",
  date: "2026-08-20", category: "Mirrors", note: "cracked",
  driver: "Jason Ward", unsafe: false, ...o,
});

{
  const p = planDefects([d({})], VEH, []);
  is(p.create.length, 1, "a new defect is created");
  is(p.create[0].vehicle_id, "v1", "matched to our truck by Motive id");
  is(p.create[0].unit_number, "DT-882", "with our unit number, not Motive's string");
  is(p.create[0].source, "motive", "marked as coming from Motive");
  is(p.create[0].state, "open", "and open");
  truthy(p.create[0].defect_key.startsWith("motive:"),
         "keyed so it can never collide with a hand-logged defect");
}

{
  const existing = [{ id: "d1", defect_key: "motive:1:1", unit_number: "DT-882",
                      category: "Mirrors", note: "cracked", state: "open", report_count: 1,
                      first_reported: "2026-08-20", last_reported: "2026-08-20" }];
  const p = planDefects([d({})], VEH, existing);
  is(p.create.length, 0, "the same defect key twice creates nothing");
  is(p.already.length, 1, "it is counted as already held");
}

{
  /* Motive gives a new id per inspection, so the same fault written up
     again arrives looking brand new. */
  const existing = [{ id: "d1", defect_key: "motive:1:1", unit_number: "DT-882",
                      category: "Mirrors", note: "cracked", state: "open", report_count: 1,
                      first_reported: "2026-08-20", last_reported: "2026-08-20" }];
  const p = planDefects([d({ key: "motive:2:7", date: "2026-08-25" })], VEH, existing);
  is(p.create.length, 0, "a repeat of an open fault does not open a second row");
  is(p.bump.length, 1, "it bumps the existing one");
  is(p.bump[0].report_count, 2, "counting the second report");
  is(p.bump[0].last_reported, "2026-08-25", "and moving the last-reported date");
  is(p.bump[0].first_reported, "2026-08-20", "while leaving first-reported alone");
}

{
  const existing = [{ id: "d1", defect_key: "motive:1:1", unit_number: "DT-882",
                      category: "Mirrors", note: "cracked", state: "repaired", report_count: 1,
                      first_reported: "2026-08-20", last_reported: "2026-08-20" }];
  const p = planDefects([d({ key: "motive:2:7", date: "2026-08-25" })], VEH, existing);
  is(p.create.length, 1, "the same fault after a repair is a NEW job, not a reopening");
  is(p.bump.length, 0, "the repaired row is left alone");
}

{
  const existing = [{ id: "d1", defect_key: "motive:1:1", unit_number: "DT-882",
                      category: "Mirrors", note: "cracked", state: "open", report_count: 1,
                      first_reported: "2026-08-20", last_reported: "2026-08-20" }];
  const p = planDefects([d({ key: "motive:2:7", date: "2026-08-25", unsafe: true })], VEH, existing);
  is(p.bump[0].safety, "unsafe", "an unsafe repeat upgrades a fault we had as minor");
  const back = planDefects([d({ key: "motive:3:9", date: "2026-08-26", unsafe: false })], VEH,
    [{ ...existing[0], severity: "major", safety: "unsafe" }]);
  truthy(!("safety" in back.bump[0]),
         "but a quieter later report never downgrades it back to safe");
}

{
  /* Two write-ups of one fault inside a single run, with nothing in the
     database yet. Must collapse to one insert, and must not emit an
     update against a row that has no id yet. */
  const p = planDefects([
    d({ key: "motive:1:1", date: "2026-08-20" }),
    d({ key: "motive:2:7", date: "2026-08-25" }),
  ], VEH, []);
  is(p.create.length, 1, "two reports of one fault in one run make one row");
  is(p.bump.length, 0, "with no update against a row that does not exist yet");
  is(p.create[0].report_count, 2, "the count still reflects both");
  is(p.create[0].last_reported, "2026-08-25", "and the later date wins");
}

{
  const p = planDefects([d({ key: "a", date: "2026-08-25" }),
                         d({ key: "b", date: "2026-08-20" })], VEH, []);
  is(p.create[0].first_reported, "2026-08-20",
     "an out-of-order pair still keeps the earliest as first-reported");
  is(p.create[0].last_reported, "2026-08-25", "and the latest as last-reported");
  truthy(p.create[0].last_reported >= p.create[0].first_reported,
         "so the dates never trip the check constraint");
}

{
  const p = planDefects([d({ motiveVehicleId: 999, unit: "GHOST-1" })], VEH, []);
  is(p.create[0].vehicle_id, null, "a defect on a truck we do not have is still recorded");
  is(p.create[0].unit_number, "GHOST-1", "under Motive's unit number, so it is not lost");
}

{
  const p = planDefects([d({ category: "  mirrors  " })], VEH,
    [{ id: "d1", defect_key: "x", unit_number: "DT-882", category: "Mirrors",
       note: "cracked", state: "open", report_count: 1,
       first_reported: "2026-08-20", last_reported: "2026-08-20" }]);
  is(p.bump.length, 1, "category matching ignores case and stray spacing");
}


/* ── Talking to Motive, with fetch stubbed ────────────────────── */

const { fetchVehicleOdometers, fetchInspectionDefects } =
  await import("../netlify/functions/lib/motive.mjs");

const stub = (handler) => { globalThis.fetch = async (u) => handler(new URL(u)); };
const ok = (body) => new Response(JSON.stringify(body), { status: 200 });

{
  /* 134 trucks against a default page size of 25 is the whole point:
     taking the first page would sync a quarter of the fleet and look
     like it worked. */
  const fleet = Array.from({ length: 134 }, (_, i) => ({
    vehicle: { id: 1000 + i, number: `T-${i}`, odometer: 1000 + i,
               true_odometer: 900 + i, current_location: { located_at: at("2026-08-27") } },
  }));
  let pages = 0, sawKey = null, sawUnits = null;
  stub((u) => {
    pages++;
    sawKey = "set";
    const per = Number(u.searchParams.get("per_page"));
    const page = Number(u.searchParams.get("page_no"));
    return ok({ vehicles: fleet.slice((page - 1) * per, page * per) });
  });
  const got = await fetchVehicleOdometers("k");
  is(got.length, 134, "every truck comes back, not just the first page");
  is(pages, 2, "which took two pages of 100");
  is(got[0].motiveId, 1000, "the id is unwrapped from the vehicle envelope");
  is(got[0].odometer, 1000, "as is the odometer");
  is(got[133].number, "T-133", "and the last page is not dropped");
}

{
  /* An exact multiple of the page size must still terminate. */
  const fleet = Array.from({ length: 200 }, (_, i) => ({ vehicle: { id: i, number: `T-${i}`, odometer: i } }));
  let pages = 0;
  stub((u) => {
    pages++;
    const page = Number(u.searchParams.get("page_no"));
    return ok({ vehicles: fleet.slice((page - 1) * 100, page * 100) });
  });
  const got = await fetchVehicleOdometers("k");
  is(got.length, 200, "a fleet that is an exact multiple of the page size reads fully");
  is(pages, 3, "stopping on the first short page rather than looping");
}

{
  let headers = null;
  globalThis.fetch = async (u, opt) => { headers = opt.headers; return ok({ vehicles: [] }); };
  await fetchVehicleOdometers("secret-key");
  is(headers["X-API-Key"], "secret-key", "the key goes in X-API-Key, as Motive documents");
  is(headers["X-Metric-Units"], "false",
     "and units are pinned to imperial — km would read as 1.6x the miles");
}

{
  stub(() => new Response('{"error":"The access token is invalid"}', { status: 401 }));
  let msg = "";
  try { await fetchVehicleOdometers("bad"); } catch (e) { msg = e.message; }
  truthy(msg.includes("401"), "a 401 throws rather than returning an empty fleet");
  truthy(msg.includes("access token is invalid"),
         "and carries Motive's own words, so the cause is not guessed at");
}

{
  stub(() => new Response("<html>gateway timeout</html>", { status: 200 }));
  let msg = "";
  try { await fetchVehicleOdometers("k"); } catch (e) { msg = e.message; }
  truthy(msg.includes("not JSON"), "an HTML error page throws instead of parsing to nothing");
}

{
  /* The real shape, taken from an actual response. Every field sits one
     level lower than Motive documents it, and most of the "defects" are
     checklist lines that were inspected and found fine. */
  stub(() => ok({ inspection_reports: [{
    inspection_report: {
      log_id: 2413521978,
      date: "2026-08-26",
      time: "2026-08-26T20:24:13Z",
      vehicle_number: "DT-899",
      location: "Interstate Dr, Lexington, KY, US",
      status: "resolved",
      inspection_type: "post_trip",
      defects: [
        { defect: { id: 1, category: "Other", notes: "Broken board mount.", type: "minor", area: "tractor" } },
        { defect: { id: 2, category: "Air Lines", notes: null, type: "none", area: "tractor" } },
        { defect: { id: 3, category: "Battery", notes: null, type: "none", area: "tractor" } },
        { defect: { id: 4, category: "Brakes", notes: "grinding", type: "major", area: "tractor" } },
      ],
    },
  }] }));
  const got = await fetchInspectionDefects("k", "2026-08-01");
  is(got.length, 2, "only real defects come through, not the whole checklist");
  is(got.checklistLines, 2, "and the clean lines are counted, not silently dropped");
  is(got[0].key, "motive:2413521978:1", "keyed on log_id, which is what the report calls its id");
  is(got[0].category, "Other", "the category is read from inside the defect envelope");
  is(got[0].note, "Broken board mount.", "as are the notes");
  is(got[0].unit, "DT-899", "the unit comes from vehicle_number — there is no vehicle object");
  is(got[0].where, "Interstate Dr, Lexington, KY, US", "and the inspection location is kept");
  is(got[0].unsafe, false, "a minor defect is not unsafe");
  is(got[1].unsafe, true, "a major one is");
  is(got[0].date, "2026-08-26", "dated from the report");
  is(got[0].reportStatus, "resolved", "and carries the DVIR's own state");
  is(got[1].reportStatus, "resolved", "on every defect off that report, not just the first");
}

{
  /* The bug the first live dry run found. Motive answers 400 to a status
     it does not accept, and because the closing read ran before any
     write, it took the whole defect import down with it — a feature that
     was never verified would have stopped new defects landing at all.

     So: whatever status this asks for has to be one Motive takes. */
  const MOTIVE_TAKES = new Set(["all", "with_defects", "with_no_defects",
                                "with_signature_missing", "unknown",
                                "harmless", "corrected"]);
  truthy(!MOTIVE_TAKES.has("open"),
         "\"open\" is not a status filter Motive accepts — it is a value the report FIELD takes");
  let asked = null;
  stub((url) => { asked = url.searchParams.get("status");
                  return ok({ inspection_reports: [] }); });
  await fetchInspectionDefects("k", "2026-08-01");
  truthy(MOTIVE_TAKES.has(asked),
         `the defect feed asks for a status Motive accepts, not "${asked}"`);
}

{
  stub(() => ok({ inspection_reports: [{ inspection_report: {
    log_id: 9, date: "2026-08-26", vehicle_number: "DT-899",
    status: "with_defects",
    defects: [{ defect: { id: 1, category: "Tires", notes: null, type: "none" } }],
  } }] }));
  const got = await fetchInspectionDefects("k", "2026-08-01");
  is(got.length, 0,
     "a report whose every line is clean yields nothing, whatever its status says");
}

/* ── Matching and splitting, on the real shape ─────────────────── */

{
  /* No vehicle id in an inspection report, so the unit number has to
     carry the match on its own. */
  const p = planDefects(
    [{ key: "motive:1:1", motiveVehicleId: null, unit: " dt-882 ",
       date: "2026-08-20", category: "Brakes", note: "soft", unsafe: false }],
    VEH, []);
  is(p.create[0].vehicle_id, "v1", "matched by unit number, case and spacing ignored");
  is(p.create[0].unit_number, "DT-882", "and stored under our spelling of it");
}

{
  /* The one that matters. Motive's commonest category is "Other", where
     the note is the only thing saying which fault it is. */
  const base = { motiveVehicleId: 101, unit: "DT-882", date: "2026-08-20",
                 category: "Other", unsafe: false };
  const p = planDefects([
    { ...base, key: "motive:1:1", note: "Broken board mount, left rear" },
    { ...base, key: "motive:1:2", note: "Cracked mirror" },
  ], VEH, []);
  is(p.create.length, 2,
     "two different 'Other' faults on one truck stay two defects");
}

{
  const base = { motiveVehicleId: 101, unit: "DT-882", category: "Other",
                 note: "Broken board mount", unsafe: false };
  const p = planDefects([
    { ...base, key: "motive:1:1", date: "2026-08-20" },
    { ...base, key: "motive:2:9", date: "2026-08-25" },
  ], VEH, []);
  is(p.create.length, 1, "but the same one written up twice is still one defect");
  is(p.create[0].report_count, 2, "reported twice");
}


/* ── Closing a defect when Motive stops reporting it ──────────────
   Jason's rule 1. The whole risk here is closing something that is
   actually still open on a truck, so most of these are about refusing
   to act rather than acting. */
{
  const SINCE = "2026-08-01";
  const base = (over = {}) => ({
    id: "d1", defect_key: "motive:1:1", unit_number: "DT-882",
    category: "Brakes", note: "grinding", state: "open", source: "motive",
    first_reported: "2026-08-10", last_reported: "2026-08-10", ...over,
  });

  /* Still in the feed: nothing happens. */
  {
    const p = planClosures([{ key: "motive:1:1" }], [base()], { since: SINCE });
    is(p.close.length, 0, "a defect Motive still reports open is left alone");
    is(p.candidates, 1, "but it was considered");
  }

  /* Gone from the feed, with something else still there so the guard
     does not trip. */
  {
    const rows = [base(), base({ id: "d2", defect_key: "motive:2:2" })];
    const p = planClosures([{ key: "motive:2:2" }], rows, { since: SINCE });
    is(p.close.length, 1, "a defect Motive no longer reports is closed");
    is(p.close[0].id, "d1", "the right one");
    is(p.close[0].wasRepaired, false, "and it says it was not repaired here");
    is(p.refused, null, "with no refusal");
  }

  /* A repaired one closing is the loop finishing, and is called out. */
  {
    const rows = [base({ state: "repaired" }), base({ id: "d2", defect_key: "motive:2:2" })];
    const p = planClosures([{ key: "motive:2:2" }], rows, { since: SINCE });
    is(p.close.length, 1, "a repaired defect closes when Motive drops it");
    is(p.close[0].wasRepaired, true, "and is reported as the repair loop finishing");
  }

  /* The three fences. */
  {
    const rows = [base({ source: "manual", defect_key: "manual:DT-882:1" }),
                  base({ id: "d2", defect_key: "motive:2:2" })];
    const p = planClosures([{ key: "motive:2:2" }], rows, { since: SINCE });
    is(p.close.length, 0, "a hand-logged defect is never closed by Motive's silence");
  }
  {
    const rows = [base({ last_reported: "2026-07-02" }),
                  base({ id: "d2", defect_key: "motive:2:2" })];
    const p = planClosures([{ key: "motive:2:2" }], rows, { since: SINCE });
    is(p.close.length, 0,
       "a defect last reported before the window is not a candidate — the feed " +
       "would not show it even if it were wide open");
  }
  {
    const rows = [base({ state: "closed" }), base({ id: "d2", defect_key: "motive:2:2" })];
    const p = planClosures([{ key: "motive:2:2" }], rows, { since: SINCE });
    is(p.close.length, 0, "an already-closed defect is not closed twice");
  }

  /* The guards. An empty feed is a broken feed, not a fixed fleet. */
  {
    const p = planClosures([], [base()], { since: SINCE });
    is(p.close.length, 0, "an empty open feed closes nothing");
    truthy(/came back empty/.test(p.refused || ""), "and says why in words");
  }
  {
    const many = Array.from({ length: 10 }, (_, i) =>
      base({ id: `d${i}`, defect_key: `motive:${i}:${i}` }));
    const p = planClosures([{ key: "motive:0:0" }], many, { since: SINCE });
    is(p.close.length, 0, "closing nearly everything at once is refused");
    truthy(/guard/.test(p.refused || ""), "and named as the guard tripping");
  }
  {
    /* Below the ratio: a normal week's repairs go through. */
    const many = Array.from({ length: 10 }, (_, i) =>
      base({ id: `d${i}`, defect_key: `motive:${i}:${i}` }));
    const feed = many.slice(3).map((d) => ({ key: d.defect_key }));
    const p = planClosures(feed, many, { since: SINCE });
    is(p.close.length, 3, "three of ten closing is a normal week and goes through");
    is(p.refused, null, "no refusal");
  }
  {
    /* A small run is not held to the ratio: two of two is fine when
       two is all there was. */
    const rows = [base(), base({ id: "d2", defect_key: "motive:2:2" })];
    const p = planClosures([{ key: "motive:9:9" }], rows, { since: SINCE });
    is(p.close.length, 2, "a tiny fleet-wide clear-out is not blocked by the ratio");
    truthy(CLOSE_GUARD.minToApplyRatio > 2, "because the ratio only applies above a floor");
  }
}

/* A closed defect must not be dragged back by a later report of the
   same fault — that would lose who fixed it and what they wrote. */
{
  const existing = [{ id: "d1", defect_key: "motive:1:1", unit_number: "DT-882",
                      category: "Brakes", note: "grinding", state: "closed",
                      source: "motive", report_count: 1,
                      first_reported: "2026-08-01", last_reported: "2026-08-01" }];
  const p = planDefects(
    [{ key: "motive:9:9", unit: "DT-882", category: "Brakes", note: "grinding",
       date: "2026-08-20", unsafe: false }],
    [{ id: "v1", number: "DT-882", motive_vehicle_id: null, active: true }],
    existing);
  is(p.bump.length, 0, "a new report of a closed fault does not reopen the closed row");
  is(p.create.length, 1, "it is a new defect instead");
}

report(state, true);
