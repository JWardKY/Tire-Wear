/* Exercises the timecard data layer against the real database.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-timecards.mjs

   Like test-pins.mjs, this needs a mechanic and the app cannot delete
   one. It uses the same TEST_MECHANIC row, cleans up every time entry
   it makes, and prints the SQL for the mechanic. */
import * as time from "../src/timeData.js";
import { client, MARK, TEST_MECHANIC, makeChecks, findIdleVehicle, cleanup, report }
  from "./_testkit.mjs";

const c = client();
const { state, ok, is, truthy } = makeChecks();

const PIN = "4271";
const DATE = "2019-01-02";  // far from anything real, so a leak is obvious
let mechanicId = null;
let cleanupOk = false;

try {
  const codes = await time.listCostCodes();
  is(codes.length, 14, "14 cost codes load");
  truthy(codes.some((x) => x.code === "873" && x.group === "Vehicle"),
         "873 Service is a Vehicle code");
  const CODE = "873";

  /* Reuse the test mechanic if a previous run left it, otherwise make it. */
  let m = await time.findMechanic(TEST_MECHANIC);
  if (!m) {
    const r = await time.registerMechanic(TEST_MECHANIC, MARK, PIN);
    truthy(r.ok, "a test mechanic can be registered");
    m = await time.findMechanic(TEST_MECHANIC);
  } else {
    console.log(`  --  reusing the test mechanic left from a previous run`);
  }
  truthy(m, "the mechanic reads back");
  mechanicId = m.id;
  truthy(m.pin_set === true, "and reports that a PIN is set");
  truthy(!("pin_hash" in m), "without the hash coming with it");

  const truck = await findIdleVehicle(c);

  /* An hour against a truck. */
  await time.addEntry({
    mechanicId, date: DATE, vehId: truck ? truck.id : null,
    unitLabel: truck ? null : "Shop bench",
    where: "shop", hours: 2.5, costCode: CODE,
    workOrder: "WO-TEST", note: MARK,
  });

  /* An hour that is not against a truck at all. */
  await time.addEntry({
    mechanicId, date: DATE, vehId: null, unitLabel: "Parts run",
    where: "road", hours: 1.25, costCode: CODE, note: MARK,
  });

  let day = await time.listDay(mechanicId, DATE);
  is(day.length, 2, "both entries land on the day");
  is(day.reduce((a, e) => a + e.hours, 0), 3.75, "the day totals 3.75 hours");
  truthy(day.some((e) => e.unit === "Parts run"),
         "an entry with no truck keeps its label");
  truthy(day.every((e) => e.costCodeName), "the cost code name comes through the view");

  /* Editing. */
  await time.updateEntry(day[0].id, {
    date: DATE, vehId: day[0].vehId, unitLabel: day[0].unit,
    where: "field", hours: 3, costCode: CODE, workOrder: "WO-TEST", note: MARK,
  });
  day = await time.listDay(mechanicId, DATE);
  const edited = day.find((e) => e.id === day[0].id);
  is(edited.hours, 3, "an entry can be corrected");
  is(edited.where, "field", "and where it was worked");

  /* The constraint that stops an hour with nowhere to go. */
  const homeless = await c.from("tw_time_entries").insert({
    mechanic_id: mechanicId, work_date: DATE, hours: 1, cost_code: CODE,
  });
  truthy(homeless.error, "database refuses an hour with no truck and no label");

  const badHours = await c.from("tw_time_entries").insert({
    mechanic_id: mechanicId, work_date: DATE, unit_label: "x", hours: 30, cost_code: CODE,
  });
  truthy(badHours.error, "and refuses 30 hours in a day");

  const badCode = await c.from("tw_time_entries").insert({
    mechanic_id: mechanicId, work_date: DATE, unit_label: "x", hours: 1, cost_code: "999",
  });
  truthy(badCode.error, "and refuses a cost code that does not exist");

  /* The range view the Hours screen reads. */
  const range = await time.listRange(DATE, DATE);
  is(range.length, 2, "the range view returns the same entries");
  truthy(range.every((r) => r.mechanic === MARK), "each carries the mechanic's name");

  /* Removing. */
  await time.deleteEntry(day[0].id);
  is((await time.listDay(mechanicId, DATE)).length, 1, "an entry can be removed");
} catch (e) {
  state.failed.push(`threw: ${e.message}`);
  console.log("  !!  threw: " + e.message);
} finally {
  cleanupOk = await cleanup(c, [
    {
      label: "time entries",
      run: async () => {
        if (mechanicId) {
          await c.from("tw_time_entries").delete().eq("mechanic_id", mechanicId);
        }
      },
      verify: async () => {
        if (!mechanicId) return 0;
        const { count, error } = await c.from("tw_time_entries")
          .select("id", { count: "exact", head: true }).eq("mechanic_id", mechanicId);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_time_entries where mechanic_id='${mechanicId}';`,
    },
    {
      label: "test mechanic",
      /* Deletable only through tw_purge_test_mechanic, which refuses any
         address that is not @invalid. The app itself still cannot delete
         a mechanic, which is the point. */
      run: async () => { await c.rpc("tw_purge_test_mechanic", { p_email: TEST_MECHANIC }); },
      verify: async () => {
        const { count, error } = await c.from("tw_mechanics")
          .select("id", { count: "exact", head: true }).eq("email", TEST_MECHANIC);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_mechanics where email='${TEST_MECHANIC}';`,
    },
  ]);
}

report(state, cleanupOk);
