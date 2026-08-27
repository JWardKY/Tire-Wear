/* The Motive sync logic, tested without Motive.

   Everything that decides what gets written is a pure function over
   fixtures here, which is the point of keeping it separate from the
   fetching: the interesting failures are all in the deciding, and they
   are the ones that would quietly corrupt real data.

   Run:  node scripts/test-motive.mjs
*/
import { planOdometer, planDefects, compareOdometers } from "../netlify/functions/lib/motive.mjs";
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
                      category: "Mirrors", state: "open", report_count: 1,
                      first_reported: "2026-08-20", last_reported: "2026-08-20" }];
  const p = planDefects([d({})], VEH, existing);
  is(p.create.length, 0, "the same defect key twice creates nothing");
  is(p.already.length, 1, "it is counted as already held");
}

{
  /* Motive gives a new id per inspection, so the same fault written up
     again arrives looking brand new. */
  const existing = [{ id: "d1", defect_key: "motive:1:1", unit_number: "DT-882",
                      category: "Mirrors", state: "open", report_count: 1,
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
                      category: "Mirrors", state: "repaired", report_count: 1,
                      first_reported: "2026-08-20", last_reported: "2026-08-20" }];
  const p = planDefects([d({ key: "motive:2:7", date: "2026-08-25" })], VEH, existing);
  is(p.create.length, 1, "the same fault after a repair is a NEW job, not a reopening");
  is(p.bump.length, 0, "the repaired row is left alone");
}

{
  const existing = [{ id: "d1", defect_key: "motive:1:1", unit_number: "DT-882",
                      category: "Mirrors", state: "open", report_count: 1,
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
       state: "open", report_count: 1, first_reported: "2026-08-20", last_reported: "2026-08-20" }]);
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
  stub(() => ok({ inspection_reports: [{
    inspection_report: {
      id: 55, date: "2026-08-26", status: "with_defects",
      driver: { first_name: "Jason", last_name: "Ward" },
      vehicle: { id: 101, number: "DT-882" },
      defects: [{ id: 7, category: "Brakes", notes: "soft pedal" },
                { id: 8, category: "Mirrors", notes: null }],
    },
  }] }));
  const got = await fetchInspectionDefects("k", "2026-08-01");
  is(got.length, 2, "one inspection with two defects becomes two rows");
  is(got[0].key, "motive:55:7", "keyed by inspection and defect together");
  is(got[1].key, "motive:55:8", "so two defects on one report stay distinct");
  is(got[0].driver, "Jason Ward", "the driver name is joined up");
  is(got[0].unsafe, true, "a with_defects report reads as unsafe");
  is(got[0].date, "2026-08-26", "dated from the report");
}

report(state, true);
