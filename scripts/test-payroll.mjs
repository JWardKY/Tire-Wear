/* The payroll export, the timecard board and the append-only work log,
   against the real database.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-payroll.mjs

   Like the other timecard tests this needs a mechanic and the app cannot
   delete one, so it reuses a marked test row and purges it at the end. */
import * as time from "../src/timeData.js";
import * as wlog from "../src/logData.js";
import * as parts from "../src/partsData.js";
import { client, MARK, makeChecks, findIdleVehicle, cleanup, report }
  from "./_testkit.mjs";

const c = client();
const { state, ok, is, truthy } = makeChecks();

const EMAIL = "payroll-test@invalid";
const SHOP = `${MARK} Shop`;
const DATE = "2019-01-03";
const CODE = "873";
const PIN = "5163";
let mechanicId = null;
let cleanupOk = false;

try {
  let m = await time.findMechanic(EMAIL);
  if (!m) {
    const r = await time.registerMechanic(EMAIL, MARK, PIN);
    truthy(r.ok, "a test mechanic can be registered");
    m = await time.findMechanic(EMAIL);
  }
  mechanicId = m.id;
  truthy(mechanicId, "the test mechanic reads back");

  /* This suite reuses its mechanic across runs, so a previous run that
     died before cleanup would leave entries on DATE and every count
     below would be wrong for a reason that has nothing to do with the
     code. Say so in one line instead. */
  const before = await time.listDay(mechanicId, DATE);
  if (before.length) {
    await c.from("tw_time_entries").delete()
      .eq("mechanic_id", mechanicId).eq("work_date", DATE);
    console.log(`  --  cleared ${before.length} row(s) left on ${DATE} by an earlier run`);
  }
  is((await time.listDay(mechanicId, DATE)).length, 0, "the test day starts empty");

  const truck = await findIdleVehicle(c);
  const { data: testPart } = await c.from("tw_parts")
    .insert({ part_number: `${MARK}-PR1`, name: "Test belt", shop: SHOP, uom: "ea", min_qty: 0 })
    .select("id").single();
  await parts.move(testPart.id, "receive", 8, { note: MARK }, EMAIL);

  /* ── A full card, the way the equipment block saves one ───────── */
  const entryId = await time.saveCard({
    date: DATE,
    vehId: truck ? truck.id : null,
    unitLabel: truck ? truck.number : "Shop bench",
    where: "road",
    jobLocation: "JOB-4417",
    hours: 3.25,
    costCode: CODE,
    workOrder: "WO-PAY",
    note: MARK,
    workTypes: ["Repair", "Welding / fab"],
    unitSeconds: 10800,
    stints: [
      { start: "2019-01-03T13:00:00.000Z", stop: "2019-01-03T15:00:00.000Z" },
      { start: "2019-01-03T16:00:00.000Z", stop: "2019-01-03T17:00:00.000Z" },
    ],
    workPerformed: `${MARK} welded the bracket`,
    parts: [
      { partId: testPart.id, number: `${MARK}-PR1`, qty: 2 },
      /* Nothing in the catalog. Rule 10: it still gets recorded. */
      { partId: null, number: `${MARK}-TYPED`, qty: 3 },
    ],
    who: MARK,
  }, mechanicId);
  truthy(entryId, "a card saves");

  /* ── A typed part is recorded but moves no stock ──────────────── */
  const onLine = await time.partsForEntry(entryId);
  is(onLine.length, 2, "both parts are on the line");
  const typed = onLine.find((x) => x.number === `${MARK}-TYPED`);
  const fromCat = onLine.find((x) => x.number === `${MARK}-PR1`);
  truthy(typed, "the typed part is recorded");
  is(typed.partId, null, "with no catalog id");
  is(typed.qty, 3, "and the quantity as typed");
  truthy(fromCat.partId, "the catalog part keeps its id");

  const { data: moved } = await c.from("tw_part_txns")
    .select("part_id,qty_delta").eq("time_entry_id", entryId);
  is(moved.length, 1, "only the catalog part moved stock");
  is(moved[0].part_id, testPart.id, "and it was that one");
  is(Number(moved[0].qty_delta), -2, "for the quantity on the line");

  const shelfNow = (await parts.listParts()).find((x) => x.id === testPart.id);
  is(shelfNow.onHand, 6, "the shelf moved for the catalog part only");

  /* The database refuses two lines for one part on one job, whatever
     the app does. */
  const dupe = await c.from("tw_time_entry_parts").insert({
    time_entry_id: entryId, part_number: `${MARK}-typed`, qty: 1,
  });
  truthy(dupe.error, "the database refuses a second line for the same part");

  /* Jason's rule 6 — an hour with no cost code cannot be saved, because
     payroll cannot charge it out. Our schema is stricter than his: the
     column is NOT NULL, so it is refused by the database rather than by
     the app, and no screen can get around it. */
  const uncoded = await c.from("tw_time_entries").insert({
    mechanic_id: mechanicId, work_date: DATE, unit_label: "Parts run",
    where_worked: "plant", hours: 1, cost_code: null, note: MARK,
  });
  truthy(uncoded.error, "the database refuses an hour with no cost code");

  /* A second coded line, so the day has more than one on it. */
  await time.addEntry({
    mechanicId, date: DATE, vehId: null, unitLabel: "Parts run",
    where: "plant", hours: 1, costCode: CODE, note: MARK,
  });

  /* ── Merging typed part lines, as a pure function ─────────────── */
  {
    const m = time.mergeParts([
      { partId: null, number: "AF-1140", qty: 1 },
      { partId: null, number: " af-1140 ", qty: 2 },
      { partId: "cat-id", number: "AF-1140", qty: 0.5, name: "Air filter" },
      { partId: null, number: "", qty: 3 },
      { partId: null, number: "OIL-15W40", qty: 0 },
      { partId: null, number: "OIL-15W40", qty: 4 },
    ]);
    is(m.length, 2, "typing the same number twice makes one line, not two");
    is(m[0].qty, 3.5, "and the quantities add up");
    is(m[0].partId, "cat-id", "a catalog match wins over a typed one for the same number");
    is(m[0].name, "Air filter", "and brings its description with it");
    is(m[0].number, "AF-1140", "the number keeps the spelling it was first given");
    is(m[1].number, "OIL-15W40", "a line with no quantity is dropped, not zeroed");
    is(m[1].qty, 4, "leaving only the real one");
  }

  /* ── The payroll export ───────────────────────────────────────── */
  is(time.PAYROLL_COLUMNS.length, 17, "the export is seventeen columns");
  is(time.PAYROLL_COLUMNS[0], "Date", "starting at the date");
  is(time.PAYROLL_COLUMNS[16], "Work performed", "and ending at the work performed");

  const lines = (await time.payrollLines(DATE, DATE))
    .filter((r) => r.mechanicId === mechanicId);
  /* Two at this point: the shop-time line is added below. */
  is(lines.length, 2, "both lines so far come through");

  const paid = lines.find((r) => r.entryId === entryId);
  truthy(paid, "the card's line is there");
  is(paid.hours, 3.25, "with the hours payroll charges");
  is(paid.trueHours, 3, "and true clocked hours from the sub-clock");
  is(paid.segments, 2, "and the stint count");
  is(paid.where, "Outside service call", "where reads in words, not a database code");
  is(paid.jobLocation, "JOB-4417", "the job carries through for a road call");
  is(paid.workTypes, "Repair · Welding / fab", "the type of work reads as a list");
  is(paid.parts, `2x ${MARK}-PR1; 3x ${MARK}-TYPED`,
     "payroll shows both, so a typed part is not silently dropped");
  truthy(paid.workPerformed.includes("welded"), "and what was performed");
  is(paid.costCodeName, "Service", "the cost code name comes off the join");

  const free = lines.find((r) => r.entryId !== entryId);
  truthy(free, "the second line comes through too");
  is(free.unit, "Parts run", "an entry with no truck keeps its label");
  is(free.where, "Plant", "and its place reads in words");

  is(time.payrollRow(paid).length, 17, "a row has one cell per column");

  /* ── Shop time: no truck, but still a home ────────────────────
     Sweeping the bay is real time somebody pays for. It carries the
     activity where a truck number would go and the shop beside it, and
     it must not vanish from payroll for want of a vehicle_id. */
  {
    const shopId = await time.addEntry({
      mechanicId, date: DATE, vehId: null,
      unitLabel: "Parts run / pickup",
      where: "plant", hours: 0.75, costCode: CODE,
      jobLocation: "Clays Ferry Shop", note: MARK,
      workTypes: ["Repair"], workPerformed: `${MARK} went for a gearbox`,
    });
    truthy(shopId, "shop time saves with no truck on it");

    const line = (await time.payrollLines(DATE, DATE)).find((r) => r.entryId === shopId);
    truthy(line, "and reaches payroll");
    is(line.unit, "Parts run / pickup", "the Unit column says what they were doing");
    is(line.jobLocation, "Clays Ferry Shop", "and Job/location says which shop");
    is(line.where, "Plant", "booked as indirect rather than as shop-on-a-truck");
    is(line.hours, 0.75, "with the hours");

    /* The constraint that stops an hour with nowhere to go still holds. */
    const homeless = await c.from("tw_time_entries").insert({
      mechanic_id: mechanicId, work_date: DATE, hours: 1, cost_code: CODE,
      where_worked: "plant", job_location: "Clays Ferry Shop",
    });
    truthy(homeless.error,
           "a job location on its own is not a home — it still needs a unit or a label");
  }

  /* ── The day, clocked against booked ──────────────────────────── */
  const days = (await time.timecardDays(DATE, DATE))
    .filter((d) => d.mechanicId === mechanicId);
  is(days.length, 1, "one card day for the mechanic");
  is(days[0].bookedHours, 5, "booked hours add all three lines up");
  is(days[0].clockHours, 0, "with nothing on the clock");
  is(days[0].difference, -5, "so the gap is negative — booked more than clocked");
  is(days[0].lines, 3, "and counts the lines");
  is(days[0].uncodedLines, 0, "with nothing uncoded, because nothing can be");

  /* ── The work log ─────────────────────────────────────────────── */
  /* The log is stamped when it happened, not with the work date, so it
     is read without a range here — a 2019 card logged today would fall
     outside any range built from DATE. */
  const mine = (await wlog.listLog({})).filter((r) => r.mechanicId === mechanicId);
  truthy(mine.some((r) => r.type === "timecard_saved"), "saving a card writes to the log");
  const savedRow = mine.find((r) => r.type === "timecard_saved");
  truthy(savedRow.summary.includes("Repair"), "the log says what kind of work it was");
  is(savedRow.detail.entry_id, entryId, "and points at the entry it recorded");
  is(savedRow.actor, MARK, "attributed to whoever saved it");

  /* A log failure must never take down the work it is recording. */
  let threw = false;
  try { await wlog.log({ type: "not_a_real_event", actor: MARK, summary: "x" }); }
  catch { threw = true; }
  truthy(!threw, "a bad log write is swallowed rather than thrown at a mechanic");

  threw = false;
  try { await wlog.logStrict({ type: "not_a_real_event", actor: MARK, summary: "x" }); }
  catch { threw = true; }
  truthy(threw, "but logStrict refuses an unknown event type");

  threw = false;
  try { await wlog.logStrict({ type: "timecard_saved", actor: "", summary: "x" }); }
  catch { threw = true; }
  truthy(threw, "and refuses a write with nobody's name on it");

  /* The properties that make it an audit trail. */
  const row = mine[0];
  const upd = await c.from("tw_work_log").update({ summary: "tampered" }).eq("id", row.id);
  truthy(upd.error, "the work log cannot be updated, by anybody");
  const del = await c.from("tw_work_log").delete().eq("id", row.id);
  truthy(del.error, "and it cannot be deleted either");

  /* ── Deleting a card ──────────────────────────────────────────── */
  let refused = null;
  try { await time.deleteCard(mechanicId, DATE, "no", MARK); }
  catch (e) { refused = e.message; }
  truthy(refused && /reason is required/i.test(refused),
         "a card will not delete without a reason");

  refused = null;
  try { await time.deleteCard(mechanicId, DATE, "entered on the wrong day", ""); }
  catch (e) { refused = e.message; }
  truthy(refused && /named person/i.test(refused),
         "or without a named person to attribute it to");

  is((await time.listDay(mechanicId, DATE)).length, 3,
     "and neither refusal removed anything");

  const removed = await time.deleteCard(mechanicId, DATE, "entered on the wrong day", MARK);
  is(removed, 3, "the whole day goes at once");
  is((await time.listDay(mechanicId, DATE)).length, 0, "and the day is empty after");

  const after = (await wlog.listLog({}))
    .filter((r) => r.mechanicId === mechanicId && r.type === "timecard_deleted");
  is(after.length, 1, "the deletion is on the log");
  is(after[0].detail.reason, "entered on the wrong day", "with the reason it was given");
  is(after[0].detail.entries.length, 3, "and a full snapshot of what was removed");
  is(after[0].detail.hours, 5, "including the hours that went with it");
} catch (e) {
  state.failed.push(`threw: ${e.message}`);
  console.log("  !!  threw: " + e.message);
} finally {
  cleanupOk = await cleanup(c, [
    {
      label: "test parts (movements cascade)",
      run: async () => { await c.from("tw_parts").delete().eq("shop", SHOP); },
      verify: async () => {
        const { count, error } = await c.from("tw_parts")
          .select("id", { count: "exact", head: true }).eq("shop", SHOP);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_parts where shop='${SHOP}';`,
    },
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
      /* The log is append only by design, so the app cannot clear it —
         that is the property under test. It goes out through the same
         SECURITY DEFINER purge that removes the test mechanic. */
      label: "work log rows",
      run: async () => {
        if (mechanicId) await c.rpc("tw_purge_test_work_log", { p_mechanic: mechanicId });
        /* And any row already orphaned by an earlier mechanic purge —
           mechanic_id is ON DELETE SET NULL so the log outlives the row
           it names, which is the point of actor_name being text. */
        await c.rpc("tw_purge_test_work_log_by_actor", { p_actor: MARK });
      },
      verify: async () => {
        if (!mechanicId) return 0;
        const { count, error } = await c.from("tw_work_log")
          .select("id", { count: "exact", head: true }).eq("mechanic_id", mechanicId);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_work_log where mechanic_id='${mechanicId}';`,
    },
    {
      label: "test mechanic",
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
