/* Shared safety rig for the scripts that write to the database.
   ─────────────────────────────────────────────────────────────────
   These tests run against the SAME database the shop is using. There is
   no staging copy. Everything here exists to make that survivable:

   1. Every row a test creates carries MARK in a column, and cleanup
      deletes by MARK and nothing else. No "delete where created_at >
      something" — that is how you take somebody's real work with you.

   2. Cleanup runs in a finally, and the script cannot exit before it.
      Throw to fail; never process.exit() mid-test. The first version of
      these scripts exited early on a failed assertion and left an
      out-of-service defect sitting at the top of the shop's board.

   3. Anything a test changes rather than creates is read first and put
      back to what it was — never to what the test assumed it was. The
      first version reset an axle config to a hardcoded 'dump12'.

   4. Tests that need a truck ask for an idle one instead of naming a
      favourite. As the shop fills the fleet in, a hardcoded truck turns
      into somebody's real data.

   5. If cleanup fails, say so loudly with what to run by hand. A silent
      leak is worse than a failed test. */

import { createClient } from "@supabase/supabase-js";

export const MARK = "AUTOMATED-TEST-DO-NOT-USE";

/* Mechanics are deliberately not deletable by the app — that is a
   property the PIN tests check — so any test that needs one leaves a
   row behind. Both tests use THIS email so there is only ever one to
   clear, and both print the SQL for it. */
export const TEST_MECHANIC = "pin-test@invalid";

export function client() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first:");
    console.error("  set -a && . ./.env.local && set +a && node scripts/<script>.mjs");
    process.exit(2);
  }
  return createClient(url, key);
}

/* ── Assertions that fail by throwing, so finally still runs ────── */

export function makeChecks() {
  const state = { passed: 0, failed: [] };
  const ok = (m) => { state.passed++; console.log("  ok  " + m); };
  const is = (actual, expected, m) => {
    if (actual === expected) ok(m);
    else { state.failed.push(m); console.log(`  !!  ${m} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
  };
  const truthy = (v, m) => {
    if (v) ok(m);
    else { state.failed.push(m); console.log("  !!  " + m); }
  };
  return { state, ok, is, truthy };
}

/* ── Finding a truck it is safe to write to ─────────────────────── */

/* A truck with no tires mounted, no tread readings and no mileage is one
   nobody has started on. Writing to it cannot collide with the shop's
   work, and the odometer row a test adds is not sitting in a series
   anybody is reading. Returns null rather than picking a busy one. */
export async function findIdleVehicle(c) {
  const { data: vehicles, error: ve } = await c
    .from("tw_vehicles").select("id,number,axle_config,division").eq("active", true).order("number");
  if (ve) throw ve;

  const [tires, odos] = await Promise.all([
    c.from("tw_tires").select("vehicle_id"),
    c.from("tw_odometer_log").select("vehicle_id"),
  ]);
  if (tires.error) throw tires.error;
  if (odos.error) throw odos.error;

  const busy = new Set([
    ...tires.data.map((r) => r.vehicle_id),
    ...odos.data.map((r) => r.vehicle_id),
  ]);

  /* From the back of the list: the shop works front to back, so the
     tail is least likely to be picked up mid-test. */
  const idle = vehicles.filter((v) => !busy.has(v.id));
  return idle.length ? idle[idle.length - 1] : null;
}

/* ── Cleanup that is loud when it fails ─────────────────────────── */

export async function cleanup(c, steps) {
  const leaks = [];
  for (const { label, run, verify, manual } of steps) {
    try {
      await run();
      const left = verify ? await verify() : 0;
      /* A verify that cannot answer must not be read as "nothing left".
         The first version counted with select("*"), which anon is denied
         on tw_mechanics — the error came back as undefined and got
         treated as a clean sweep while the row was still sitting there. */
      if (left === null || left === undefined || Number.isNaN(left)) {
        leaks.push({ label, left: "unknown — the check itself failed", manual });
      } else if (left) leaks.push({ label, left, manual });
    } catch (e) {
      leaks.push({ label, left: "?", manual, error: e.message });
    }
  }
  if (leaks.length) {
    console.error("\n*** CLEANUP DID NOT FINISH — TEST DATA IS STILL IN THE DATABASE ***");
    for (const l of leaks) {
      console.error(`  ${l.label}: ${l.left} row(s) left${l.error ? ` (${l.error})` : ""}`);
      if (l.manual) console.error(`    run: ${l.manual}`);
    }
    return false;
  }
  console.log("  ok  every row this test created was removed");
  return true;
}

export function report(state, cleanupOk) {
  const bad = state.failed.length;
  console.log(bad ? `\n${bad} check(s) FAILED:` : "\nall checks passed");
  state.failed.forEach((f) => console.log("  - " + f));
  if (!cleanupOk) console.log("\nCLEANUP FAILED — see above, this needs a person.");
  process.exitCode = bad || !cleanupOk ? 1 : 0;
}
