/* The punch clock and the Now board, against the real database.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-now.mjs
*/
import * as now from "../src/nowData.js";
import { todayISO } from "../src/day.js";
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

  /* Punching straight back out is the case that used to break. started_at
     comes from the database's clock and ended_at used to come from the
     browser's; a client running a second behind produced a shift ending
     before it started and the mechanic got a raw constraint error. Both
     ends are stamped by the server now, so this holds however far the
     tablet has drifted. */
  const quick = await now.punchOut(mechId);
  truthy(quick.ok, "punching straight back out works, whatever the tablet's clock says");
  const justClosed = await c.from("tw_shifts")
    .select("started_at,ended_at").eq("mechanic_id", mechId)
    .order("started_at", { ascending: false }).limit(1).single();
  truthy(new Date(justClosed.data.ended_at) >= new Date(justClosed.data.started_at),
         "and the shift does not end before it starts");

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

  /* The clock the punch is stamped with is the server's, not this
     machine's. Proven by measuring the skew and showing the punch does
     not carry it — on a container running behind, a browser-stamped
     punch-out lands in the past. */
  {
    const { data: dbNow } = await c.rpc("tw_punch_out", { p_mechanic: mechId });
    is(dbNow.ok, false, "punching out when not on the clock is refused by the server too");
    is(dbNow.error, "Not on the clock.", "in the same words the app uses");

    await now.punchIn(mechId, MARK);
    const before = Date.now();
    await now.punchOut(mechId);
    const row = await c.from("tw_shifts").select("ended_at").eq("mechanic_id", mechId)
      .order("started_at", { ascending: false }).limit(1).single();
    const skew = new Date(row.data.ended_at).getTime() - before;
    truthy(Math.abs(skew) < 120000,
           `the punch is stamped within two minutes of real time (skew ${skew} ms)`);
  }

  /* ── The shift card: lunch, corrections, and the reconciliation ── */
  const today = todayISO();   // the shop's day, Eastern, same as the view stamps
  await now.punchIn(mechId, MARK);
  let sd = await now.shiftForDay(mechId, today);
  truthy(sd, "the day's shift reads back");
  is(sd.lunch, 30, "with a default lunch of thirty minutes");
  is(sd.open, true, "and still open");

  await now.editShift(sd.id, today, { start: "07:00", stop: "15:30", lunch: 30 });
  sd = await now.shiftById(sd.id);
  is(sd.clockHours, 8, "seven to half three less a half hour lunch is eight hours");

  await now.editShift(sd.id, today, { lunch: 60 });
  sd = await now.shiftById(sd.id);
  is(sd.clockHours, 7.5, "an hour lunch takes it to seven and a half");

  await now.editShift(sd.id, today, { lunch: 0 });
  sd = await now.shiftById(sd.id);
  is(sd.clockHours, 8.5, "and no lunch gives the full eight and a half");

  /* The one that would otherwise produce a negative shift. */
  await now.editShift(sd.id, today, { start: "22:00", stop: "06:00", lunch: 0 });
  sd = await now.shiftById(sd.id);
  is(sd.clockHours, 8, "a shift running past midnight is eight hours, not minus sixteen");

  await now.editShift(sd.id, today, { start: "07:00", stop: "15:30", lunch: 30 });
  sd = await now.shiftById(sd.id);

  const acc = (h, es) => now.accountedFor(h, es);
  let a = acc(8, [{ hours: 5, where: "shop", unit: "DT-882" },
                  { hours: 3, where: "road", unit: "DT-901" }]);
  is(a.booked, 8, "eight hours booked against eight on the clock");
  is(a.diff, 0, "leaves nothing unaccounted");
  is(a.tone, "ok", "and reads as fine");
  is(a.note, "Every hour is accounted for.", "in those words");
  is(a.segments.length, 2, "with a segment per entry");
  is(a.segments[1].kind, "call", "a road entry is a service call");

  a = acc(8, [{ hours: 6, where: "shop", unit: "DT-882" }]);
  is(a.diff, 2, "booking six of eight leaves two");
  is(a.tone, "warn", "which is flagged");
  truthy(a.note.includes("2.00 hrs still need"), "and says how many: " + a.note);

  a = acc(8, [{ hours: 9.5, where: "shop", unit: "DT-882" }]);
  is(a.tone, "warn", "booking more than the clock is flagged too");
  truthy(a.note.includes("more than the clock"), "with its own wording");

  a = acc(0, []);
  is(a.tone, "muted", "no times yet is not an error");
  is(a.note, "Enter a start and stop time to begin.", "it just says what to do");

  a = acc(8, [{ hours: 8, where: "plant", unit: "Shop" }]);
  is(a.segments[0].kind, "idle", "plant and parts-run time reads as indirect");

  await now.punchOut(mechId);

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
