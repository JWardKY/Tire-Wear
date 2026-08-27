/* Vendors, ordering, receiving and requests, against the real database.

   The invariants worth guarding, both carried over from the stock work:
   on_hand only ever moves through a transaction and the trigger, and
   on_order only moves in the same statement as the line or receipt that
   justifies it.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-purchasing.mjs
*/
import * as buy from "../src/purchasingData.js";
import * as parts from "../src/partsData.js";
import { client, MARK, makeChecks, cleanup, report } from "./_testkit.mjs";

const c = client();
const { state, is, truthy } = makeChecks();
const SHOP = `${MARK} Shop`;
const CAT = `${MARK} Filters`;
const WHO = "test@invalid";
let cleanupOk = false;

const n = (x) => Math.round(Number(x) * 100) / 100;

try {
  /* ── Vendors and routing ────────────────────────────────────── */
  await buy.saveVendor({ name: `${MARK} Supply Co`, email: "orders@invalid", cc: "ap@invalid" });
  let vendors = await buy.listVendors();
  const v = vendors.find((x) => x.name === `${MARK} Supply Co`);
  truthy(v, "a vendor can be added");
  is(v.email, "orders@invalid", "with an email to send orders to");

  await buy.routeCategory(CAT, v.id);
  const routes = await buy.listCategoryRouting();
  truthy(routes.some((r) => r.category === CAT && r.vendorId === v.id),
         "a category routes to a vendor, since the export has no vendor column");

  /* Two parts in that category, one of which names its own vendor. */
  const mk = async (num, onHand, min, cost) => {
    const { data, error } = await c.from("tw_parts").insert({
      part_number: num, name: `${MARK} ${num}`, shop: SHOP, category: CAT,
      min_qty: min, unit_cost: cost,
    }).select("id").single();
    if (error) throw error;
    if (onHand) {
      const t = await c.from("tw_part_txns").insert({
        part_id: data.id, kind: "import", qty_delta: onHand, who: WHO });
      if (t.error) throw t.error;
    }
    return data.id;
  };
  const aId = await mk("TESTBUY-A", 1, 5, 10);
  const bId = await mk("TESTBUY-B", 0, 3, 25);

  let live = await parts.listParts();
  const A = live.find((p) => p.id === aId), B = live.find((p) => p.id === bId);
  is(A.onHand, 1, "the first part is on the shelf");
  is(A.state, "low", "and below its reorder point");
  is(B.state, "out", "the second is out");

  let vOf = await buy.partVendors();
  is(vOf.get(aId).vendorId, v.id, "a part inherits its category's vendor");
  is(vOf.get(aId).overridden, false, "and is marked as inherited, not overridden");

  await buy.saveVendor({ name: `${MARK} Other Co`, email: "other@invalid" });
  const v2 = (await buy.listVendors()).find((x) => x.name === `${MARK} Other Co`);
  await buy.setPartVendor(bId, v2.id);
  vOf = await buy.partVendors();
  is(vOf.get(bId).vendorId, v2.id, "a part can override its category's vendor");
  is(vOf.get(bId).overridden, true, "and says it was overridden");

  /* ── Grouping a draft ───────────────────────────────────────── */
  live = await parts.listParts();
  const draft = { [aId]: 4, [bId]: 2 };
  const groups = buy.groupByVendor(draft, live, vOf);
  is(groups.length, 2, "a draft splits into one order per vendor");
  const gA = groups.find((g) => g.vendorId === v.id);
  is(gA.lines.length, 1, "each order holds only that vendor's lines");
  is(n(gA.total), 40, "and totals the lines it holds");

  const zero = buy.groupByVendor({ [aId]: 0 }, live, vOf);
  is(zero.length, 0, "a line with no quantity is not an order");

  /* ── Committing ─────────────────────────────────────────────── */
  const num = await buy.nextPoNumber();
  truthy(/^HD-\d{4}-\d{4}$/.test(num), `the PO number is shaped HD-year-nnnn (${num})`);

  const res = await buy.commitOrder(gA, "email", WHO);
  truthy(res.ok, "the order commits");
  is(n(res.total), 40, "with the total it was shown");

  live = await parts.listParts();
  is(live.find((p) => p.id === aId).onOrder, 4, "and moves the quantity to on order");
  is(live.find((p) => p.id === aId).onHand, 1, "without touching what is on the shelf");

  const orders = await buy.listOrders();
  const po = orders.find((o) => o.id === res.id);
  truthy(po, "the order is in the history");
  is(po.state, "ordered", "as ordered");
  is(po.vendor, `${MARK} Supply Co`, "against the right vendor");

  const second = await buy.nextPoNumber();
  truthy(second !== num, "the next PO number moves on");

  const empty = await buy.commitOrder({ vendorId: v.id, lines: [] }, "email", WHO);
  is(empty.ok, false, "an empty order is refused");

  /* ── Receiving ──────────────────────────────────────────────── */
  const lines = await buy.listOrderLines(res.id);
  is(lines.length, 1, "the order has its line");
  is(lines[0].outstanding, 4, "all of it outstanding");

  const over = await buy.receiveLine(lines[0].id, 99, WHO);
  is(over.ok, false, "receiving more than was ordered is refused");

  const part1 = await buy.receiveLine(lines[0].id, 3, WHO);
  truthy(part1.ok, "a partial receipt works");
  is(part1.fully_received, false, "and says the line is not finished");

  live = await parts.listParts();
  is(live.find((p) => p.id === aId).onHand, 4, "the stock arrived on the shelf");
  is(live.find((p) => p.id === aId).onOrder, 1, "and came off on order");

  const log = await parts.listTxns(aId);
  truthy(log.some((t) => t.kind === "receive" && t.delta === 3),
         "through a transaction, so the log still explains the count");

  const rest = await buy.receiveLine(lines[0].id, 1, WHO);
  is(rest.fully_received, true, "receiving the rest closes the line");
  is((await buy.listOrders()).find((o) => o.id === res.id).state, "received",
     "and the order reads as received");
  live = await parts.listParts();
  is(live.find((p) => p.id === aId).onOrder, 0, "with nothing left on order");

  /* ── Requests from the floor ────────────────────────────────── */
  await buy.addRequest({ num: "TESTBUY-A", description: `${MARK} need one`,
                         qty: 2, shop: SHOP, unit: "DT-882" }, WHO);
  const reqs = await buy.listRequests(["open"]);
  const r = reqs.find((x) => x.description === `${MARK} need one`);
  truthy(r, "a request from the floor is recorded");
  is(r.qty, 2, "with a quantity");
  is(r.unit, "DT-882", "and the truck it is for");

  await buy.setRequestState(r.id, "ordered");
  truthy(!(await buy.listRequests(["open"])).some((x) => x.id === r.id),
         "and leaves the open list once it is ordered");

  /* ── Issued ─────────────────────────────────────────────────── */
  await parts.move(aId, "issue", 2, { workOrder: "WO-TEST", note: MARK }, WHO);
  const issued = await buy.recentlyIssued();
  truthy(issued.some((i) => i.partId === aId && i.qty === 2),
         "issuing shows in the recently-issued list");
  truthy(issued.every((i) => i.qty > 0),
         "as a positive quantity, not the negative the log stores");

  /* ── The order text that gets sent ──────────────────────────── */
  const txt = buy.orderText(gA, "HD-2026-0001");
  truthy(txt.includes("HD-2026-0001"), "the order text carries the PO number");
  truthy(txt.includes("TESTBUY-A"), "and the part numbers");
  const ml = buy.mailto({ ...gA, email: "orders@invalid" }, "HD-2026-0001");
  truthy(ml.url.startsWith("mailto:"), "a mailto link is built");
  is(ml.tooLong, false, "a short order fits in one");
  const big = { ...gA, lines: Array.from({ length: 200 }, () => gA.lines[0]) };
  is(buy.mailto(big, "HD-2026-0001").tooLong, true,
     "a long one is flagged, because Outlook truncates without saying so");
} catch (e) {
  state.failed.push(`threw: ${e.message}`);
  console.log("  !!  threw: " + e.message);
} finally {
  cleanupOk = await cleanup(c, [
    {
      label: "test requests",
      run: async () => { await c.from("tw_part_requests").delete().eq("shop", SHOP); },
      verify: async () => {
        const { count, error } = await c.from("tw_part_requests")
          .select("id", { count: "exact", head: true }).eq("shop", SHOP);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_part_requests where shop='${SHOP}';`,
    },
    {
      label: "test orders (lines cascade)",
      run: async () => {
        const { data } = await c.from("tw_purchase_orders")
          .select("id,vendor_name").like("vendor_name", `${MARK}%`);
        for (const o of data || []) await c.from("tw_purchase_orders").delete().eq("id", o.id);
      },
      verify: async () => {
        const { count, error } = await c.from("tw_purchase_orders")
          .select("id", { count: "exact", head: true }).like("vendor_name", `${MARK}%`);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_purchase_orders where vendor_name like '${MARK}%';`,
    },
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
      label: "test category routing",
      run: async () => { await c.from("tw_vendor_categories").delete().eq("category", CAT); },
      verify: async () => {
        const { count, error } = await c.from("tw_vendor_categories")
          .select("category", { count: "exact", head: true }).eq("category", CAT);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_vendor_categories where category='${CAT}';`,
    },
    {
      label: "test vendors",
      run: async () => { await c.from("tw_vendors").delete().like("name", `${MARK}%`); },
      verify: async () => {
        const { count, error } = await c.from("tw_vendors")
          .select("id", { count: "exact", head: true }).like("name", `${MARK}%`);
        return error ? null : (count || 0);
      },
      manual: `delete from tw_vendors where name like '${MARK}%';`,
    },
  ]);
}

report(state, cleanupOk);
