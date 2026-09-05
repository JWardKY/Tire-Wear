import { supabase } from "./supabase.js";
import { fetchAll } from "./data.js";

/* Vendors, orders and requests.

   Two rules from the stock work hold here too, and both live in the
   database rather than in this file, because a rule enforced in the
   browser is a rule until somebody opens the console:

   on_hand is never written directly — receiving writes a transaction
   and the trigger moves the count.

   on_order moves only inside the same statement as the order line or
   the receipt that justifies it. A half-committed order has the shop
   ordering twice for parts already on their way. */

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};
function check({ error }) { if (error) throw error; }

/* ── Vendors ───────────────────────────────────────────────────── */

export async function listVendors() {
  const rows = await fetchAll("tw_vendors", "*", "name");
  return rows.map((v) => ({
    id: v.id, name: v.name, email: v.email || "", cc: v.cc || "",
    phone: v.phone || "", account: v.account || "", note: v.note || "",
    active: !!v.active,
  }));
}

export async function saveVendor(v) {
  const row = {
    name: v.name.trim(), email: v.email || null, cc: v.cc || null,
    phone: v.phone || null, account: v.account || null, note: v.note || null,
    active: v.active !== false,
  };
  if (v.id) check(await supabase.from("tw_vendors").update(row).eq("id", v.id));
  else check(await supabase.from("tw_vendors").insert(row));
}

export async function listCategoryRouting() {
  const rows = await fetchAll("tw_vendor_categories", "*", "category");
  return rows.map((r) => ({ category: r.category, vendorId: r.vendor_id }));
}

export async function routeCategory(category, vendorId) {
  if (!vendorId) {
    check(await supabase.from("tw_vendor_categories").delete().eq("category", category));
    return;
  }
  check(await supabase.from("tw_vendor_categories")
    .upsert({ category, vendor_id: vendorId, updated_at: new Date().toISOString() },
            { onConflict: "category" }));
}

/* Who supplies each part, the override already resolved. */
export async function partVendors() {
  const rows = await fetchAll("tw_part_vendor", "*", "part_id");
  const by = new Map();
  for (const r of rows) {
    by.set(r.part_id, {
      vendorId: r.vendor_id, name: r.vendor_name || "",
      email: r.vendor_email || "", overridden: !!r.overridden,
    });
  }
  return by;
}

export async function setPartVendor(partId, vendorId) {
  check(await supabase.from("tw_parts")
    .update({ vendor_id: vendorId || null, updated_at: new Date().toISOString() })
    .eq("id", partId));
}

/* ── Ordering ──────────────────────────────────────────────────── */

/* Group a draft into one order per vendor, because that is how it gets
   sent: one email each, not one email listing four suppliers' parts. */
export function groupByVendor(draft, parts, vendorOf) {
  const groups = new Map();
  for (const [partId, qty] of Object.entries(draft)) {
    if (!qty || qty <= 0) continue;
    const p = parts.find((x) => x.id === partId);
    if (!p) continue;
    const v = vendorOf.get(partId) || {};
    const key = v.vendorId || "";
    if (!groups.has(key)) {
      groups.set(key, {
        vendorId: v.vendorId || null,
        vendor: v.name || "(no vendor)",
        email: v.email || "",
        lines: [], total: 0,
      });
    }
    const g = groups.get(key);
    const cost = p.cost == null ? 0 : Number(p.cost);
    g.lines.push({ part: p, qty: Number(qty), cost });
    g.total = Math.round((g.total + cost * Number(qty)) * 100) / 100;
  }
  /* Parts with no vendor last, so the ones that can actually be sent
     are at the top. */
  return [...groups.values()].sort((a, b) =>
    (a.vendorId ? 0 : 1) - (b.vendorId ? 0 : 1) || a.vendor.localeCompare(b.vendor));
}

export const nextPoNumber = () => rpc("tw_next_po_number", {});

export const commitOrder = (group, sentHow, who, note) =>
  rpc("tw_commit_order", {
    p_vendor_id: group.vendorId,
    p_lines: group.lines.map((l) => ({
      part_id: l.part.id, qty: l.qty, unit_cost: l.cost || null,
    })),
    p_sent_how: sentHow, p_who: who, p_note: note || null,
  });

export async function listOrders(limit = 60) {
  const { data, error } = await supabase
    .from("tw_purchase_orders").select("*")
    .order("ordered_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data.map((o) => ({
    id: o.id, po: o.po_number, vendorId: o.vendor_id, vendor: o.vendor_name,
    email: o.vendor_email || "", sentHow: o.sent_how || "", state: o.state,
    total: Number(o.total), note: o.note || "", who: o.ordered_by || "",
    at: o.ordered_at,
  }));
}

export async function listOrderLines(poId) {
  const { data, error } = await supabase
    .from("tw_po_lines").select("*").eq("po_id", poId).order("part_number");
  if (error) throw error;
  return data.map((l) => ({
    id: l.id, partId: l.part_id, num: l.part_number, name: l.name || "",
    shop: l.shop || "", qty: Number(l.qty),
    received: Number(l.qty_received), cost: l.unit_cost == null ? null : Number(l.unit_cost),
    outstanding: Number(l.qty) - Number(l.qty_received),
  }));
}

export const receiveLine = (lineId, qty, who) =>
  rpc("tw_receive_po_line", { p_line_id: lineId, p_qty: Number(qty), p_who: who });

/* ── Sending it ────────────────────────────────────────────────── */

/* Outlook truncates a mailto well before the 2048 the spec allows, and
   a silently cut-off purchase order is worse than no purchase order.
   Past this, the screen offers the text to copy instead. */
const MAILTO_LIMIT = 1800;
const ORG = "The Allen Company · Haul Division";

export function orderText(group, poNumber) {
  const lines = group.lines.map((l) =>
    `${String(l.qty).padStart(4)}  ${l.part.num}  ${l.part.name || ""}`.trimEnd()
  );
  return [
    `Purchase order ${poNumber}`,
    ORG,
    "",
    ...lines,
    "",
    group.total ? `Estimated total: $${group.total.toFixed(2)}` : "",
    "",
    "Please confirm price and availability.",
  ].filter((x) => x !== null).join("\n");
}

export function mailto(group, poNumber) {
  const subject = `Purchase order ${poNumber} — ${ORG}`;
  const body = orderText(group, poNumber);
  const cc = group.cc ? `&cc=${encodeURIComponent(group.cc)}` : "";
  const url = `mailto:${encodeURIComponent(group.email || "")}` +
    `?subject=${encodeURIComponent(subject)}${cc}&body=${encodeURIComponent(body)}`;
  return { url, body, subject, tooLong: url.length > MAILTO_LIMIT, chars: url.length };
}

/* ── Requests from the floor ───────────────────────────────────── */

export async function listRequests(states = ["open"]) {
  const { data, error } = await supabase
    .from("tw_part_requests").select("*")
    .in("state", states).order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return data.map((r) => ({
    id: r.id, partId: r.part_id, num: r.part_number || "",
    description: r.description, qty: Number(r.qty), shop: r.shop || "",
    unit: r.unit_label || "", vehId: r.vehicle_id, by: r.requested_by || "",
    state: r.state, note: r.note || "", at: r.created_at,
  }));
}

export async function addRequest(r, who) {
  check(await supabase.from("tw_part_requests").insert({
    part_id: r.partId || null, part_number: r.num || null,
    description: r.description, qty: Number(r.qty) || 1,
    shop: r.shop || null, unit_label: r.unit || null,
    vehicle_id: r.vehId || null, requested_by: who, note: r.note || null,
  }));
}

export async function setRequestState(id, state) {
  check(await supabase.from("tw_part_requests")
    .update({ state, updated_at: new Date().toISOString() }).eq("id", id));
}

/* ── Issued ────────────────────────────────────────────────────── */

export async function recentlyIssued(limit = 200) {
  const { data, error } = await supabase
    .from("tw_part_txns").select("*").eq("kind", "issue")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data.map((t) => ({
    id: t.id, partId: t.part_id, qty: Math.abs(Number(t.qty_delta)),
    vehId: t.vehicle_id, workOrder: t.work_order || "",
    note: t.note || "", who: t.who || "", at: t.created_at,
  }));
}

/* ── Work orders ───────────────────────────────────────────────── */

/* Opening one is idempotent on (kind, key). The board calls it for
   every open defect on every load, so it has to hand back the same
   number rather than a new one — a truck with four numbers for one
   fault is paperwork that has stopped meaning anything. */
export const openWorkOrder = (kind, key, info, who) =>
  rpc("tw_open_work_order", {
    p_kind: kind, p_key: key, p_unit: info.unit || null,
    p_title: info.title || "Untitled", p_detail: info.detail || null,
    p_priority: info.priority || "normal",
    p_vehicle_id: info.vehId || null, p_who: who || null,
  });

export const syncDefectWorkOrders = (who) =>
  rpc("tw_sync_defect_work_orders", { p_who: who || null });

/* A job somebody decided on, rather than one a defect or a service
   interval produced. Same numbering, same board, same history — the
   only difference is where it came from.

   The source key is generated here and never matched by anything: a
   sync looks up its own kind and key, so a hand-made order cannot be
   reopened, renumbered or closed by one. That is the same trick
   addDefect uses for a fault the shop found itself. */
export async function createWorkOrder(info, who) {
  const key = `manual:${Date.now().toString(36)}`;
  const r = await openWorkOrder("other", key, info, who);
  /* Assigning at creation is one action to the person doing it, so the
     board does not make them create a job and then go and find it. */
  if (r?.id && info.assignTo) await assignWorkOrder(r.id, info.assignTo);
  return r;
}

/* What has actually been spent on an order: parts off the shelf and
   hours off the clock, both found by its number.

   tw_part_txns.work_order and tw_time_entries.work_order are text, and
   they were text before this existed — a part issued against WO-1043 by
   somebody typing the number has always counted, and still does. This
   only reads them back in one place.

   Two plain queries rather than an embedded select: the part numbers
   and costs come back in a second read keyed on the ids the first one
   returned. */
export async function workOrderLines(woNumber) {
  if (!woNumber) return { parts: [], hours: [], partsCost: 0, hoursTotal: 0 };

  const [{ data: txns, error: te }, { data: entries, error: he }] = await Promise.all([
    supabase.from("tw_part_txns")
      .select("id,part_id,kind,qty_delta,note,who,created_at")
      .eq("work_order", woNumber).order("created_at", { ascending: false }).limit(200),
    supabase.from("tw_time_entries")
      .select("id,hours,cost_code,note,mechanic_id,created_at")
      .eq("work_order", woNumber).order("created_at", { ascending: false }).limit(200),
  ]);
  if (te) throw te;
  if (he) throw he;

  const ids = [...new Set((txns || []).map((t) => t.part_id).filter(Boolean))];
  const byPart = new Map();
  if (ids.length) {
    const { data, error } = await supabase.from("tw_parts")
      .select("id,part_number,name,unit_cost,uom").in("id", ids);
    if (error) throw error;
    for (const p of data || []) byPart.set(p.id, p);
  }

  const names = new Map();
  const mechIds = [...new Set((entries || []).map((h) => h.mechanic_id).filter(Boolean))];
  if (mechIds.length) {
    const { data, error } = await supabase.from("tw_mechanics").select("id,name").in("id", mechIds);
    if (error) throw error;
    for (const m of data || []) names.set(m.id, m.name);
  }

  const parts = (txns || []).map((t) => {
    const p = byPart.get(t.part_id) || {};
    /* Issues are negative and receives positive in the ledger. What a
       job used is the issue; a return puts stock back and should reduce
       what the job cost, so the sign is kept rather than absolute. */
    const used = -Number(t.qty_delta);
    const cost = p.unit_cost == null ? null : used * Number(p.unit_cost);
    return {
      id: t.id, num: p.part_number || "—", name: p.name || "", uom: p.uom || "each",
      qty: used, cost, who: t.who || "", note: t.note || "", at: t.created_at,
    };
  });

  const hours = (entries || []).map((h) => ({
    id: h.id, hours: Number(h.hours) || 0, costCode: h.cost_code || "",
    note: h.note || "", who: names.get(h.mechanic_id) || "", at: h.created_at,
  }));

  return {
    parts, hours,
    /* Null costs are left out of the total rather than counted as zero,
       and the caller is told how many so a partial total is not read as
       a complete one. */
    partsCost: parts.reduce((n, p) => n + (p.cost || 0), 0),
    partsWithoutCost: parts.filter((p) => p.cost == null).length,
    hoursTotal: hours.reduce((n, h) => n + h.hours, 0),
  };
}

export async function listWorkOrders(states) {
  let q = supabase.from("tw_work_orders").select("*")
    .order("priority").order("wo_number", { ascending: false }).limit(500);
  if (states?.length) q = q.in("state", states);
  const { data, error } = await q;
  if (error) throw error;
  return data.map((w) => ({
    id: w.id, wo: w.wo_number, kind: w.kind, key: w.source_key,
    vehId: w.vehicle_id, unit: w.unit_number || "", title: w.title,
    detail: w.detail || "", priority: w.priority, state: w.state,
    assignedTo: w.assigned_to, assignedName: w.assigned_name || "",
    completedAt: w.completed_at, completionNote: w.completion_note || "",
    at: w.created_at,
  }));
}

export async function assignWorkOrder(id, mechanic) {
  check(await supabase.from("tw_work_orders").update({
    assigned_to: mechanic ? mechanic.id : null,
    assigned_name: mechanic ? mechanic.name : null,
    assigned_at: mechanic ? new Date().toISOString() : null,
    state: mechanic ? "in progress" : "open",
    updated_at: new Date().toISOString(),
  }).eq("id", id));
}

export async function closeWorkOrder(id, note, who) {
  check(await supabase.from("tw_work_orders").update({
    state: "done", completed_at: new Date().toISOString(),
    completed_by: who, completion_note: note || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id));
}

/* ── Work history ──────────────────────────────────────────────── */

export async function workHistory({ from, to, kind, unit, who } = {}) {
  let q = supabase.from("tw_work_history").select("*")
    .order("at", { ascending: false }).limit(1000);
  if (from) q = q.gte("at", `${from}T00:00:00Z`);
  if (to) q = q.lte("at", `${to}T23:59:59Z`);
  if (kind && kind !== "all") q = q.eq("kind", kind);
  if (unit && unit !== "all") q = q.eq("unit", unit);
  if (who && who !== "all") q = q.eq("who", who);
  const { data, error } = await q;
  if (error) throw error;
  return data.map((r) => ({
    at: r.at, kind: r.kind, what: r.what, unit: r.unit || "",
    summary: r.summary || "", who: r.who || "", workOrder: r.work_order || "",
    hours: r.hours == null ? null : Number(r.hours),
    id: r.source_id,
  }));
}

/* ── One mechanic's own worklist ───────────────────────────────── */

export async function myWork(mechanicId) {
  const { data, error } = await supabase
    .from("tw_work_orders").select("*")
    .eq("assigned_to", mechanicId).neq("state", "done")
    .order("priority").order("wo_number", { ascending: false });
  if (error) throw error;
  return data.map((w) => ({
    id: w.id, wo: w.wo_number, kind: w.kind, unit: w.unit_number || "",
    title: w.title, detail: w.detail || "", priority: w.priority,
    state: w.state, vehId: w.vehicle_id, at: w.created_at,
    assignedAt: w.assigned_at, startedAt: w.started_at,
    sourceKey: w.source_key,
  }));
}

export async function startWork(id) {
  const { error } = await supabase.from("tw_work_orders")
    .update({ started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/* One person's own history. Same view as the shop-wide one, narrowed
   to them — a mechanic wants what they touched, not the fleet's day. */
export async function myHistory(who, { from, to } = {}) {
  let q = supabase.from("tw_work_history").select("*")
    .eq("who", who).order("at", { ascending: false }).limit(500);
  if (from) q = q.gte("at", `${from}T00:00:00Z`);
  if (to) q = q.lte("at", `${to}T23:59:59Z`);
  const { data, error } = await q;
  if (error) throw error;
  return data.map((r) => ({
    at: r.at, kind: r.kind, what: r.what, unit: r.unit || "",
    summary: r.summary || "", workOrder: r.work_order || "",
    hours: r.hours == null ? null : Number(r.hours), id: r.source_id,
  }));
}

/* Shifts somebody has closed — "my saved timecards". */
export async function myShifts(mechanicId, limit = 60) {
  const { data, error } = await supabase
    .from("tw_shift_days").select("*")
    .eq("mechanic_id", mechanicId).not("ended_at", "is", null)
    .order("started_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data.map((r) => ({
    id: r.id, date: r.work_date, startedAt: r.started_at, endedAt: r.ended_at,
    lunch: Number(r.lunch_minutes), hours: Number(r.clock_hours),
  }));
}
