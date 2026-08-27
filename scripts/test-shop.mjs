/* Exercises the defects and PM data layer against the real database.
   Read scripts/_testkit.mjs before changing anything here.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-shop.mjs
*/
import * as shop from "../src/shopData.js";
import { client, MARK, makeChecks, findIdleVehicle, cleanup, report } from "./_testkit.mjs";

const c = client();
const { state, ok, is, truthy } = makeChecks();

const WHO = "test@invalid";
/* The note is the first thing anyone reads on the defect board, so it
   says what this is. And the test defect is minor and safe on purpose:
   an out-of-service one sorts above every real fault, and if cleanup
   ever failed somebody would go looking for a fault that is not there.
   The sort order for unsafe defects is covered in the browser tests,
   where it costs nothing. */
const NOTE = `${MARK} — ignore, automated test`;

let truck = null;
let cleanupOk = false;

try {
  const vehicles = await shop.listVehicles();
  is(vehicles.length, 134, "134 vehicles load");

  truck = await findIdleVehicle(c);
  if (!truck) {
    console.log("\n  -- no idle truck left; falling back to the last unit for read-only checks.");
    truck = vehicles[vehicles.length - 1];
  } else {
    console.log(`  --  writing to ${truck.number}, which has no tires and no mileage`);
  }

  /* ── Defects ───────────────────────────────────────────────── */
  await shop.addDefect({
    unit: truck.number, vehId: truck.id, category: "Cab & interior",
    note: NOTE, driver: "Automated test", severity: "minor", safety: "safe",
    date: "2026-08-20",
  }, WHO);

  let d = (await shop.listDefects()).find((x) => x.note === NOTE);
  truthy(d, "a defect can be logged");
  is(d.state, "open", "it starts open");
  is(d.source, "manual", "marked manual, so a Motive sync will not close it");

  await shop.claimDefect(d.id, WHO);
  d = (await shop.listDefects()).find((x) => x.id === d.id);
  is(d.state, "claimed", "claiming sticks");
  is(d.claimedBy, WHO, "and records who has it");

  await shop.releaseDefect(d.id);
  d = (await shop.listDefects()).find((x) => x.id === d.id);
  is(d.state, "open", "releasing hands it back");
  truthy(!d.claimedBy, "and clears the claim");

  await shop.repairDefect(d.id, { note: "Test repair", hours: 1.5, workOrder: "WO-TEST" }, WHO);
  d = (await shop.listDefects()).find((x) => x.id === d.id);
  is(d.state, "repaired", "marking repaired sticks");
  is(d.repairHours, 1.5, "hours are kept");
  is(d.repairedBy, WHO, "and who did it");

  await shop.reopenDefect(d.id);
  d = (await shop.listDefects()).find((x) => x.id === d.id);
  is(d.state, "open", "reopening works");
  truthy(!d.repairedBy && d.repairHours == null,
         "and clears the repair, so the record cannot lie");

  const halfWritten = await c.from("tw_defects").update({ state: "repaired" }).eq("id", d.id);
  truthy(halfWritten.error, "database refuses 'repaired' with no repairer");

  /* ── PM ────────────────────────────────────────────────────── */
  const programs = await shop.listPrograms();
  is(programs.length, 12, "12 PM programs load");
  const oil = programs.find((p) => p.name === "Engine oil & filter");
  truthy(oil, "the oil change program is there");

  let mine = (await shop.listPmForVehicle(truck.id)).find((r) => r.programId === oil.id);
  is(mine.level, "nobaseline", "no service recorded reads as 'no baseline', not overdue");

  await shop.recordService({
    vehId: truck.id, programId: oil.id, date: "2026-06-01",
    odo: 10000, hours: 2, note: NOTE,
  }, WHO);
  mine = (await shop.listPmForVehicle(truck.id)).find((r) => r.programId === oil.id);
  is(mine.lastOdo, 10000, "recording a service sets the baseline");
  is(mine.dueAtOdo, 25000, "next due at 25,000 mi (10,000 + a 15,000 mi interval)");

  await shop.recordService({
    vehId: truck.id, programId: oil.id, date: "2026-08-01",
    odo: 26000, hours: 2, note: NOTE,
  }, WHO);
  mine = (await shop.listPmForVehicle(truck.id)).find((r) => r.programId === oil.id);
  is(mine.lastOdo, 26000, "the newest service becomes the baseline");
  is((await shop.listCompletions(truck.id, oil.id)).length, 2,
     "and the older one stays in the history");

  const counts = await shop.pmLevelCounts();
  is(Object.values(counts).reduce((a, b) => a + b, 0), 12 * 134,
     "every truck-and-service pair is accounted for");
} catch (e) {
  state.failed.push(`threw: ${e.message}`);
  console.log("  !!  threw: " + e.message);
} finally {
  cleanupOk = await cleanup(c, [
    {
      label: "PM completions",
      run: async () => { await c.from("tw_pm_completions").delete().eq("done_by", WHO); },
      verify: async () => {
        const { count } = await c.from("tw_pm_completions")
          .select("*", { count: "exact", head: true }).eq("done_by", WHO);
        return count || 0;
      },
      manual: `delete from tw_pm_completions where done_by='${WHO}';`,
    },
    {
      label: "defects",
      run: async () => { await c.from("tw_defects").delete().eq("created_by", WHO); },
      verify: async () => {
        const { count } = await c.from("tw_defects")
          .select("*", { count: "exact", head: true }).eq("created_by", WHO);
        return count || 0;
      },
      manual: `delete from tw_defects where created_by='${WHO}';`,
    },
  ]);
}

report(state, cleanupOk);
