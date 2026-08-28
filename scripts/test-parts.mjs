/* Exercises the parts inventory: the CSV reader and import planner as
   pure functions, then the real thing against the database.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-parts.mjs
*/
import * as parts from "../src/partsData.js";
import { parseCSV, guessMapping, planImport } from "../src/csvImport.js";
import { client, MARK, makeChecks, cleanup, report } from "./_testkit.mjs";

const c = client();
const { state, ok, is, truthy } = makeChecks();

const SHOP = `${MARK} Shop`;   // a shop nobody real will ever have
const WHO = "test@invalid";
let cleanupOk = false;

try {
  /* ── The CSV reader, with the awkward bits ─────────────────── */
  const csv = [
    'Part Number,Description,Shop,Qty On Hand,Reorder Point,Unit Cost',
    '3050,"Lamps - Tail, Stop, Turn",Clays Ferry,5,2,7.20',
    'RC-3030SB,"Chamber ""Service Brake""",Clays Ferry,4,2,$49.99',
    'M63354HYB,"Signal lamp\nwith a newline",Clays Ferry,4,2,54.88',
  ].join("\n");

  const p = parseCSV(csv);
  is(p.headers.length, 6, "the header row reads");
  is(p.rows.length, 3, "three data rows read");
  is(p.rows[0]["Description"], "Lamps - Tail, Stop, Turn",
     "a comma inside quotes does not split the row");
  is(p.rows[1]["Description"], 'Chamber "Service Brake"',
     "a doubled quote becomes one quote");
  truthy(p.rows[2]["Description"].includes("\n"),
     "a newline inside quotes stays in the field");

  /* ── Column guessing ───────────────────────────────────────── */
  const m = guessMapping(p.headers);
  is(m.num, "Part Number", "part number column found");
  is(m.name, "Description", "description column found");
  is(m.onHand, "Qty On Hand", "quantity column found from a different wording");
  is(m.min, "Reorder Point", "reorder point found from a different wording");
  is(m.cost, "Unit Cost", "cost column found");

  /* ── Planning, before anything is written ──────────────────── */
  const existing = [{ id: "x", num: "3050", shop: "Clays Ferry", onHand: 5, name: "", bin: "",
                      category: "", tags: "" }];
  const plan = planImport(p.rows, m, existing, "");
  is(plan.create.length, 2, "two parts are new");
  is(plan.same.length, 1, "one already matches and will not be touched");
  is(plan.change.length, 0, "nothing to correct");
  is(plan.bad.length, 0, "no bad rows");
  truthy(planImport([{ "Part Number": "", "Qty On Hand": "1" }], m, [], "S").bad.length === 1,
         "a row with no part number is skipped, not guessed at");
  truthy(planImport([{ "Part Number": "A", "Qty On Hand": "" }], m, [], "S").bad.length === 1,
         "a row with no quantity is skipped");
  truthy(planImport([{ "Part Number": "A", "Qty On Hand": "1" }], m, [], "").bad.length === 1,
         "a row with no shop and no default is skipped");
  is(planImport(p.rows, m, existing, "").create[0].fields.cost, 49.99,
     "a $ and commas come off the cost");

  /* ── The real thing ────────────────────────────────────────── */
  const realCsv = [
    'Part Number,Description,Shop,Qty On Hand,Reorder Point,Unit Cost',
    `TESTPART-1,${MARK} bearing,${SHOP},10,4,12.50`,
    `TESTPART-2,${MARK} filter,${SHOP},0,2,31.00`,
  ].join("\n");
  const rp = parseCSV(realCsv);
  const rm = guessMapping(rp.headers);
  let live = await parts.listParts();
  const plan1 = planImport(rp.rows, rm, live, "");
  is(plan1.create.length, 2, "the live plan creates two parts");
  const res1 = await parts.runImport(plan1, WHO);
  is(res1.created, 2, "the import creates them");

  live = await parts.listParts();
  const bearing = live.find((x) => x.num === "TESTPART-1" && x.shop === SHOP);
  const filter = live.find((x) => x.num === "TESTPART-2" && x.shop === SHOP);
  truthy(bearing && filter, "both read back");
  is(bearing.onHand, 10, "the opening balance came through the trigger, not a direct write");
  is(bearing.state, "ok", "ten against a reorder point of four is fine");
  is(filter.state, "out", "zero on hand reads as out");

  const opening = await parts.listTxns(bearing.id);
  is(opening.length, 1, "the opening balance is in the log");
  is(opening[0].kind, "import", "recorded as an import");

  /* Issue and receive move the count. */
  await parts.move(bearing.id, "issue", 3, { workOrder: "WO-TEST", note: MARK }, WHO);
  live = await parts.listParts();
  is(live.find((x) => x.id === bearing.id).onHand, 7, "issuing three leaves seven");
  await parts.move(bearing.id, "receive", 5, { note: MARK }, WHO);
  live = await parts.listParts();
  is(live.find((x) => x.id === bearing.id).onHand, 12, "receiving five makes twelve");

  /* Counting the shelf records the difference. */
  await parts.setCount(bearing.id, 12, 9, "Counted", WHO);
  live = await parts.listParts();
  is(live.find((x) => x.id === bearing.id).onHand, 9, "a count correction lands");
  const log = await parts.listTxns(bearing.id);
  is(log.length, 4, "every movement is in the log");
  is(log[0].delta, -3, "and the correction recorded the difference, not the new total");

  /* Re-importing the same file is a correction, not a duplicate. */
  live = await parts.listParts();
  const plan2 = planImport(rp.rows, rm, live, "");
  is(plan2.create.length, 0, "re-importing creates nothing");
  is(plan2.change.length, 1, "and sees the one quantity that drifted");
  is(plan2.change[0].delta, 1, "back up from nine to ten");
  await parts.runImport(plan2, WHO);
  live = await parts.listParts();
  is(live.find((x) => x.id === bearing.id).onHand, 10, "the re-import corrects it");

  /* Constraints. */
  const wrongWay = await c.from("tw_part_txns")
    .insert({ part_id: bearing.id, kind: "issue", qty_delta: 5 });
  truthy(wrongWay.error, "database refuses an issue that adds stock");
  const zero = await c.from("tw_part_txns")
    .insert({ part_id: bearing.id, kind: "adjust", qty_delta: 0 });
  truthy(zero.error, "and refuses a movement of nothing");

  /* ── What "out" means ─────────────────────────────────────────
     Importing the real catalog put 1,285 parts on the reorder board
     that the shop has never carried, because the view called anything
     at zero "out" before it asked whether there was a reorder point.
     A part nobody has set a min or max on is not out of stock. */
  {
    const mk = async (fields) => {
      const { data } = await c.from("tw_parts")
        .insert({ shop: SHOP, uom: "ea", ...fields }).select("id").single();
      return data.id;
    };
    const stateOf = async (id) =>
      (await parts.listParts()).find((p) => p.id === id)?.state;

    const never = await mk({ part_number: `${MARK}-NEVER`, name: "Bought once" });
    is(await stateOf(never), "not stocked",
       "zero on hand with no reorder point reads as not stocked, not out");

    const carried = await mk({ part_number: `${MARK}-CARRIED`, name: "We stock this", min_qty: 2 });
    is(await stateOf(carried), "out",
       "zero on hand WITH a reorder point is genuinely out");

    const byMax = await mk({ part_number: `${MARK}-MAX`, name: "Max only", max_qty: 5 });
    is(await stateOf(byMax), "out",
       "a max on its own is also somebody saying we carry it");

    const stocked = await mk({ part_number: `${MARK}-HAS`, name: "On the shelf" });
    await parts.move(stocked, "receive", 3, { note: MARK }, WHO);
    is(await stateOf(stocked), "no reorder point",
       "stock with no reorder point is still just that");

    const low = await mk({ part_number: `${MARK}-LOW`, name: "Running down", min_qty: 5 });
    await parts.move(low, "receive", 4, { note: MARK }, WHO);
    is(await stateOf(low), "low", "at or under the reorder point is low");

    /* The board itself: of the five made here, only the three somebody
       has said we carry belong on it. Scoped to these five, because the
       suite has already put other parts in this shop. */
    const mine = new Set([`${MARK}-NEVER`, `${MARK}-CARRIED`, `${MARK}-MAX`,
                          `${MARK}-HAS`, `${MARK}-LOW`]);
    const board = (await parts.listParts())
      .filter((p) => mine.has(p.num) && (p.state === "out" || p.state === "low"))
      .map((p) => p.num).sort();
    is(board.join(","), [`${MARK}-CARRIED`, `${MARK}-LOW`, `${MARK}-MAX`].sort().join(","),
       "only the three somebody has said we carry reach the reorder board");
  }
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
  ]);
}

report(state, cleanupOk);
