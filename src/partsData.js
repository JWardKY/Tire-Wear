import { supabase } from "./supabase.js";
import { fetchAll } from "./data.js";

/* Parts inventory. This app is the system of record for stock now, so
   the one rule that matters is that on_hand is never written directly —
   every movement goes in as a transaction and a database trigger applies
   the delta. The count and the log therefore cannot disagree, and the
   answer to "why is there one left" is always in the log.

   That includes the import: bringing a CSV in writes an 'import'
   transaction for the difference rather than overwriting the count, so
   re-importing a corrected export shows up as a correction instead of
   silently rewriting history. */

function check({ error }) {
  if (error) throw error;
}

const toPart = (r) => ({
  id: r.id,
  num: r.part_number,
  name: r.name || "",
  shop: r.shop,
  category: r.category || "",
  uom: r.uom,
  onHand: Number(r.on_hand),
  allocated: Number(r.allocated),
  onOrder: Number(r.on_order),
  available: Number(r.available),
  min: r.min_qty == null ? null : Number(r.min_qty),
  max: r.max_qty == null ? null : Number(r.max_qty),
  bin: r.bin || "",
  cost: r.unit_cost == null ? null : Number(r.unit_cost),
  tags: r.tags || "",
  tracked: r.tracked,
  state: r.stock_state,
  suggested: r.suggested_order == null ? null : Number(r.suggested_order),
});

export async function listParts() {
  const rows = await fetchAll("tw_parts_reorder", "*", "part_number");
  return rows.map(toPart);
}

export async function listTxns(partId) {
  const { data, error } = await supabase
    .from("tw_part_txns")
    .select("*")
    .eq("part_id", partId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.map((r) => ({
    id: r.id, kind: r.kind, delta: Number(r.qty_delta),
    vehId: r.vehicle_id, workOrder: r.work_order || "",
    note: r.note || "", who: r.who || "", at: r.created_at,
  }));
}

/* A movement. qty is always positive here and the direction comes from
   the kind, because "issue 3" is how a person says it and getting the
   sign wrong on a stock count is not a small mistake. */
export async function move(partId, kind, qty, extra = {}, who) {
  const n = Math.abs(Number(qty));
  if (!n) throw new Error("A quantity is needed.");
  const delta = kind === "issue" ? -n : n;
  check(
    await supabase.from("tw_part_txns").insert({
      part_id: partId,
      kind,
      qty_delta: delta,
      vehicle_id: extra.vehId || null,
      work_order: extra.workOrder || null,
      note: extra.note || null,
      who,
    })
  );
}

/* A count correction: says what the shelf actually holds, and the log
   records the difference from what we thought. */
export async function setCount(partId, currentOnHand, countedTo, note, who) {
  const delta = Number(countedTo) - Number(currentOnHand);
  if (!delta) return;
  check(
    await supabase.from("tw_part_txns").insert({
      part_id: partId, kind: "adjust", qty_delta: delta,
      note: note || "Counted", who,
    })
  );
}

export async function updatePart(id, fields) {
  const cols = {};
  if ("name" in fields) cols.name = fields.name || null;
  if ("category" in fields) cols.category = fields.category || null;
  if ("bin" in fields) cols.bin = fields.bin || null;
  if ("min" in fields) cols.min_qty = fields.min === "" ? null : Number(fields.min);
  if ("max" in fields) cols.max_qty = fields.max === "" ? null : Number(fields.max);
  if ("cost" in fields) cols.unit_cost = fields.cost === "" ? null : Number(fields.cost);
  if ("tracked" in fields) cols.tracked = !!fields.tracked;
  if ("active" in fields) cols.active = !!fields.active;
  cols.updated_at = new Date().toISOString();
  check(await supabase.from("tw_parts").update(cols).eq("id", id));
}

/* ── Carrying an import out ───────────────────────────────────── */

export async function runImport(plan, who) {
  /* New parts start at zero and get their opening balance as an import
     transaction, exactly like an existing one being corrected. One code
     path, so the log reads the same either way. */
  for (const { fields } of plan.create) {
    const { data, error } = await supabase.from("tw_parts").insert({
      part_number: fields.num, name: fields.name || null, shop: fields.shop,
      category: fields.category || null, uom: fields.uom,
      allocated: fields.allocated, on_order: fields.onOrder,
      min_qty: fields.min, max_qty: fields.max,
      bin: fields.bin || null, unit_cost: fields.cost, tags: fields.tags || null,
    }).select("id").single();
    if (error) throw error;
    if (fields.onHand) {
      check(await supabase.from("tw_part_txns").insert({
        part_id: data.id, kind: "import", qty_delta: fields.onHand,
        note: "Opening balance from import", who,
      }));
    }
  }

  for (const { fields, part, delta } of plan.change) {
    check(await supabase.from("tw_parts").update({
      name: fields.name || part.name || null,
      category: fields.category || part.category || null,
      allocated: fields.allocated, on_order: fields.onOrder,
      min_qty: fields.min, max_qty: fields.max,
      bin: fields.bin || part.bin || null,
      unit_cost: fields.cost, tags: fields.tags || part.tags || null,
      updated_at: new Date().toISOString(),
    }).eq("id", part.id));
    check(await supabase.from("tw_part_txns").insert({
      part_id: part.id, kind: "import", qty_delta: delta,
      note: `Import: counted ${fields.onHand}, we had ${part.onHand}`, who,
    }));
  }

  return { created: plan.create.length, changed: plan.change.length, untouched: plan.same.length };
}
