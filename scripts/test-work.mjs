/* Work orders and the work-history view, against the real database.

   The property that matters most is idempotence: the board asks for a
   number on every load, so asking twice must give back the same one. A
   truck with four numbers for one fault is paperwork that has stopped
   meaning anything.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-work.mjs
*/
import * as buy from "../src/purchasingData.js";
import { client, MARK, makeChecks, cleanup, report } from "./_testkit.mjs";

const c = client();
const { state, is, truthy } = makeChecks();
const KEY = `manual:${MARK}:worktest`;
const WHO = "test@invalid";
let cleanupOk = false;
let preExisting = null;
/* Defects that already carried a work-order number before this ran, so
   the ones this test caused can be un-linked again. */
const defectsBefore = new Map(
  ((await c.from("tw_defects").select("id,work_order").limit(1000)).data || [])
    .map((d) => [d.id, d.work_order]));

try {
  /* ── Opening one ────────────────────────────────────────────── */
  const a = await buy.openWorkOrder("defect", KEY,
    { unit: "DT-882", title: `${MARK} Brakes`, detail: "soft pedal", priority: "now" }, WHO);
  truthy(a.ok, "a work order opens");
  is(a.created, true, "as a new one");
  truthy(/^WO-\d\d-\d{4}$/.test(a.wo_number),
         `numbered WO-yy-nnnn (${a.wo_number})`);

  const b = await buy.openWorkOrder("defect", KEY,
    { unit: "DT-882", title: `${MARK} Brakes` }, WHO);
  is(b.created, false, "asking again does not open a second");
  is(b.wo_number, a.wo_number, "and hands back the same number");

  /* A different fault on the same truck is a different job. */
  const other = await buy.openWorkOrder("defect", `${KEY}-2`,
    { unit: "DT-882", title: `${MARK} Mirror` }, WHO);
  truthy(other.wo_number !== a.wo_number,
         "a different fault gets its own number");

  /* ── Assigning and closing ──────────────────────────────────── */
  let list = await buy.listWorkOrders(["open", "in progress"]);
  const mine = list.find((w) => w.wo === a.wo_number);
  truthy(mine, "it shows on the board");
  is(mine.priority, "now", "at the priority it was opened with");
  is(mine.state, "open", "and open");

  const add = await c.rpc("tw_mechanic_add",
    { p_email: "work-test@invalid", p_name: `${MARK} Fitter` });
  const mech = { id: add.data.id, name: `${MARK} Fitter` };

  await buy.assignWorkOrder(mine.id, mech);
  list = await buy.listWorkOrders(["in progress"]);
  const assigned = list.find((w) => w.id === mine.id);
  truthy(assigned, "assigning it moves it to in progress");
  is(assigned.assignedName, `${MARK} Fitter`, "with the name on it");

  await buy.assignWorkOrder(mine.id, null);
  is((await buy.listWorkOrders(["open"])).find((w) => w.id === mine.id)?.state,
     "open", "unassigning puts it back to open");

  const bad = await c.from("tw_work_orders")
    .update({ state: "in progress", assigned_to: null }).eq("id", mine.id);
  truthy(bad.error, "the database refuses in-progress with nobody on it");

  await buy.closeWorkOrder(mine.id, "replaced the shoes", WHO);
  const done = (await buy.listWorkOrders(["done"])).find((w) => w.id === mine.id);
  truthy(done, "closing it works");
  is(done.completionNote, "replaced the shoes", "and records what was done");

  const bad2 = await c.from("tw_work_orders")
    .update({ state: "done", completed_at: null }).eq("id", mine.id);
  truthy(bad2.error, "and refuses done with no completion time");

  /* ── Numbering the real defects ─────────────────────────────── */
  /* This one touches production: it opens a work order for every open
     defect there actually is. That is the feature working, but a test
     must not leave sixty rows behind, so note what existed first and
     remove exactly the difference afterwards. */
  const before = new Set((await buy.listWorkOrders(null)).map((w) => w.id));
  preExisting = before;

  const sync = await buy.syncDefectWorkOrders(WHO);
  truthy(sync.ok, "every open defect can be given a number");
  const again = await buy.syncDefectWorkOrders(WHO);
  is(again.opened, 0, "and running it again opens none, being idempotent");

  const defects = await c.from("tw_defects")
    .select("work_order,safety,state").neq("state", "repaired").limit(400);
  truthy(!defects.error, "the defects read back");
  truthy(defects.data.every((d) => d.work_order),
         "and every one that is not repaired now carries a number");

  const unsafe = defects.data.find((d) => d.safety === "unsafe");
  if (unsafe) {
    const w = (await buy.listWorkOrders(null))
      .find((x) => x.wo === unsafe.work_order);
    is(w?.priority, "now", "an out-of-service truck reads as priority now");
  }

  /* ── The history view ───────────────────────────────────────── */
  const hist = await buy.workHistory({ from: "2026-01-01", to: "2026-12-31" });
  truthy(hist.length > 0, "the work history reads");
  truthy(hist.every((r) => r.at && r.kind && r.what),
         "every line has a time, a kind and a description");
  truthy(hist.some((r) => r.kind === "defect"), "defects appear in it");
  for (let i = 1; i < Math.min(hist.length, 50); i++) {
    if (hist[i].at > hist[i - 1].at) {
      throw new Error("history is not in newest-first order");
    }
  }
  truthy(true, "and it is ordered newest first");

  const narrow = await buy.workHistory({ from: "2026-01-01", to: "2026-01-02" });
  truthy(narrow.length <= hist.length, "a narrower range returns no more");
} catch (e) {
  state.failed.push(`threw: ${e.message}`);
  console.log("  !!  threw: " + e.message);
} finally {
  cleanupOk = await cleanup(c, [
    {
      label: "test work orders",
      run: async () => { await c.from("tw_work_orders").delete().like("source_key", `manual:${MARK}%`); },
      verify: async () => {
        const { count, error } = await c.from("tw_work_orders")
          .select("id", { count: "exact", head: true }).like("source_key", `manual:${MARK}%`);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_work_orders where source_key like 'manual:${MARK}%';`,
    },
    {
      /* The real-defect sync above opened one per open defect. Remove
         exactly those, and put the defects' work_order back to what it
         was, so a test run leaves production as it found it. */
      label: "work orders the defect sync opened",
      run: async () => {
        if (!preExisting) return;
        const after = await buy.listWorkOrders(null);
        for (const w of after) {
          if (!preExisting.has(w.id)) await c.from("tw_work_orders").delete().eq("id", w.id);
        }
        for (const [id, was] of defectsBefore) {
          await c.from("tw_defects").update({ work_order: was }).eq("id", id);
        }
      },
      verify: async () => {
        if (!preExisting) return 0;
        const after = await buy.listWorkOrders(null);
        return after.filter((w) => !preExisting.has(w.id)).length;
      },
      manual: "check tw_work_orders for rows this run opened",
    },
    {
      label: "test mechanic",
      run: async () => { await c.rpc("tw_purge_test_mechanic", { p_email: "work-test@invalid" }); },
      verify: async () => {
        const { count, error } = await c.from("tw_mechanics")
          .select("id", { count: "exact", head: true }).eq("email", "work-test@invalid");
        return error ? null : (count || 0);
      },
      manual: `delete from tw_mechanics where email='work-test@invalid';`,
    },
  ]);
}

report(state, cleanupOk);
