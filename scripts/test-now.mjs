/* The punch clock and the Now board, against the real database.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-now.mjs
*/
import * as now from "../src/nowData.js";
import { client, MARK, makeChecks, cleanup, report } from "./_testkit.mjs";

const c = client();
const { state, is, truthy } = makeChecks();
const EMAIL = "now-test@invalid";
let mechId = null;
let cleanupOk = false;

try {
  const add = await c.rpc("tw_mechanic_add", { p_email: EMAIL, p_name: `${MARK} Clock` });
  truthy(add.data?.ok, "a test mechanic exists to punch");
  mechId = add.data.id;

  is(await now.openShift(mechId), null, "nobody starts on the clock");

  const inn = await now.punchIn(mechId, MARK);
  truthy(inn.ok, "punching in works");

  const open = await now.openShift(mechId);
  truthy(open, "and leaves a shift open");

  /* The one that matters on a shop tablet: a slow screen and a second
     press must not open a second shift. */
  const twice = await now.punchIn(mechId, MARK);
  is(twice.ok, false, "punching in twice is refused, not duplicated");
  is(twice.error, "Already on the clock.", "and says so in words a person can read");

  const board = await now.listOnClock();
  const mine = board.find((s) => s.mechanicId === mechId);
  truthy(mine, "they show on the board");
  is(mine.mechanic, `${MARK} Clock`, "with their name already joined");
  is(mine.stale, false, "a shift started today is not stale");
  truthy(now.elapsedSec(mine.startedAt) >= 0, "and has a running elapsed time");

  const out = await now.punchOut(mechId);
  truthy(out.ok, "punching out works");
  is(await now.openShift(mechId), null, "and closes the shift");
  truthy(!(await now.listOnClock()).some((s) => s.mechanicId === mechId),
         "so they leave the board");

  const outAgain = await now.punchOut(mechId);
  is(outAgain.ok, false, "punching out when not on the clock says so");

  /* Having closed one, another can be opened — the unique index is on
     open shifts only, not on the mechanic. */
  truthy((await now.punchIn(mechId, MARK)).ok, "a second shift can be opened later");
  await now.punchOut(mechId);

  /* A shift left open from yesterday must read as stale, because a
     nineteen hour timer on the wall is a missed punch-out, not a day. */
  const yest = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
  const ins = await c.from("tw_shifts")
    .insert({ mechanic_id: mechId, started_at: yest, note: MARK }).select("id").single();
  truthy(!ins.error, "a shift can be backdated for the test");
  const stale = (await now.listOnClock()).find((s) => s.mechanicId === mechId);
  truthy(stale, "it shows on the board");
  is(stale.stale, true, "and is flagged as left open");
  await now.closeShift(stale.id);
  truthy(!(await now.listOnClock()).some((s) => s.mechanicId === mechId),
         "closing it from the board clears it");

  const bad = await c.from("tw_shifts").insert({
    mechanic_id: mechId,
    started_at: new Date().toISOString(),
    ended_at: new Date(Date.now() - 3600000).toISOString(),
  });
  truthy(bad.error, "the database refuses a shift that ends before it starts");

  const n = await now.boardNumbers("2026-01-01", "2026-12-31");
  truthy(typeof n.onClock === "number", "the board numbers compute");
  truthy(n.openDefects >= 0, "open defects counted");
  truthy(n.roadPct >= 0 && n.roadPct <= 100, "the road-call share is a percentage");
  truthy(n.outOfService <= n.openDefects,
         "units out of service cannot exceed open defects");
} catch (e) {
  state.failed.push(`threw: ${e.message}`);
  console.log("  !!  threw: " + e.message);
} finally {
  cleanupOk = await cleanup(c, [
    {
      label: "test shifts and mechanic (shifts cascade)",
      run: async () => { await c.rpc("tw_purge_test_mechanic", { p_email: EMAIL, p_name: null }); },
      verify: async () => {
        const { count, error } = await c.from("tw_mechanics")
          .select("id", { count: "exact", head: true }).eq("email", EMAIL);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_mechanics where email='${EMAIL}';`,
    },
  ]);
}

report(state, cleanupOk);
