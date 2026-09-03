/* Exercises the tire data layer against the real database.
   Read scripts/_testkit.mjs before changing anything here.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-tires.mjs
*/
import * as db from "../src/data.js";
import { client, MARK, makeChecks, findIdleVehicle, cleanup, report } from "./_testkit.mjs";

const c = client();
const { state, ok, is, truthy } = makeChecks();

const CASING = MARK;          // marks the tire rows
const WHO = "test@invalid";   // marks readings and odometer rows

let truck = null;
let originalConfig = null;
let cleanupOk = false;

try {
  const d0 = await db.loadAll();
  is(d0.vehicles.length, 134, "134 vehicles load");
  is(d0.brands.length, 6, "brand list loads");
  truthy(d0.settings.pullSteer > 0 && d0.settings.pullOther > 0, "pull thresholds load");

  truck = await findIdleVehicle(c);
  if (!truck) {
    console.log("\n  -- every truck now has tires or mileage on it.");
    console.log("     Skipping the write tests rather than writing to one the shop is using.");
    console.log("     Point this at a Supabase branch to keep covering the write path.");
  } else {
    console.log(`  --  writing to ${truck.number}, which has no tires and no mileage`);
    originalConfig = truck.axle_config;

    /* Mount → the position must be free, or somebody got there first. */
    const POS = "3RO";
    await db.mountTire(truck.id, {
      pos: POS, brand: "Bridgestone", model: "TESTONLY", size: "11R24.5", type: "virgin",
      wheel: "aluminum", newDepth: 28, onDate: "2026-01-05", onOdo: 100000,
      cost: 500, casing: CASING,
    }, WHO);

    let d = await db.loadAll();
    let tire = d.tires.find((t) => t.casing === CASING);
    truthy(tire, "a tire can be mounted");

    is(tire.wheel, "aluminum", "the wheel material is stored with the mount");

    is(d.wear[tire.id]?.miPer32 ?? null, null,
       "no wear rate from the mount record alone");

    /* One walk-around: 32,000 miles for 8/32 of tread = 4,000 mi per 32nd. */
    await db.saveInspection(truck.id, "2026-06-10", 132000,
      [{ tireId: tire.id, depth: 20 }], WHO);
    d = await db.loadAll();
    let w = d.wear[tire.id];
    is(w.miPer32, 4000, "wear rate is 4,000 mi per 32nd");
    is(w.miles, 32000, "32,000 miles run");
    is(w.depth, 20, "current depth 20/32");
    truthy(Math.abs(w.miPerMil - 128) < 0.05, "128 miles per mil");

    /* Same odometer again corrects the reading instead of duplicating. */
    await db.saveInspection(truck.id, "2026-06-10", 132000,
      [{ tireId: tire.id, depth: 21 }], WHO);
    d = await db.loadAll();
    is(d.readings.filter((r) => r.tire === tire.id).length, 1,
       "re-entering a depth at the same odometer corrects it");
    is(d.wear[tire.id].depth, 21, "the correction took");

    /* Axle config: read first, restore to what it actually was. */
    const other = originalConfig === "dump12" ? "tandem10" : "dump12";
    await db.setVehicleConfig(truck.id, other);
    d = await db.loadAll();
    is(d.vehicles.find((v) => v.id === truck.id).cfg, other, "axle config change persists");
    await db.setVehicleConfig(truck.id, originalConfig);
    d = await db.loadAll();
    is(d.vehicles.find((v) => v.id === truck.id).cfg, originalConfig,
       "and is put back to what it was");
    originalConfig = null; // restored; nothing for finally to undo

    /* Pull frees the position for a remount. */
    await db.pullTire(tire.id, { offDate: "2026-08-01", offOdo: 145000, offReason: "Worn out" });
    d = await db.loadAll();
    truthy(d.tires.find((t) => t.id === tire.id).offDate, "a tire can be pulled");
    truthy(!d.tires.some((t) => t.vehId === truck.id && t.pos === POS && !t.offDate),
           "the position frees up after a pull");
  }
} catch (e) {
  state.failed.push(`threw: ${e.message}`);
  console.log("  !!  threw: " + e.message);
} finally {
  const steps = [];

  if (originalConfig && truck) {
    steps.push({
      label: `axle config on ${truck.number}`,
      run: async () => { await db.setVehicleConfig(truck.id, originalConfig); },
      verify: async () => {
        const { data } = await c.from("tw_vehicles").select("axle_config").eq("id", truck.id).single();
        return data && data.axle_config === originalConfig ? 0 : 1;
      },
      manual: `update tw_vehicles set axle_config='${originalConfig}' where id='${truck.id}';`,
    });
  }

  steps.push(
    {
      label: "tires (and their readings, by cascade)",
      run: async () => { await c.from("tw_tires").delete().eq("casing_id", CASING); },
      verify: async () => {
        const { count } = await c.from("tw_tires")
          .select("*", { count: "exact", head: true }).eq("casing_id", CASING);
        return count || 0;
      },
      manual: `delete from tw_tires where casing_id='${CASING}';`,
    },
    {
      label: "odometer rows",
      run: async () => { await c.from("tw_odometer_log").delete().eq("recorded_by", WHO); },
      verify: async () => {
        const { count } = await c.from("tw_odometer_log")
          .select("*", { count: "exact", head: true }).eq("recorded_by", WHO);
        return count || 0;
      },
      manual: `delete from tw_odometer_log where recorded_by='${WHO}';`,
    }
  );

  cleanupOk = await cleanup(c, steps);
}

report(state, cleanupOk);
