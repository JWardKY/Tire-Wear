/* ── A price typed once, on the tires that are already out there ──
   The catalog was built so a price is typed once and every tire
   mounted off that row carries it. That left the tires already on the
   trucks: 490 of the 640 on this fleet went in with no cost at all,
   and typing a price into the catalog did nothing for any of them.
   The obvious thing to do — go and put $655.24 on a hundred and forty
   tires by hand — is the thing the catalog exists to stop.

   So changing a price here offers to put it on the tires that row is
   already fitted to. Three rules keep that from being a thing
   somebody regrets.

   ONLY TIRES STILL ON A TRUCK. A tire that has come off is history:
   what it cost is part of what the fleet spent last quarter, and a
   price list changed this morning must not reach back and rewrite it.
   That is also the line the cost-per-mile figures depend on — a
   pulled tire's cost per mile is settled, and it has to stay settled.

   A TIRE THAT ALREADY SAYS SOMETHING IS A SEPARATE DECISION. A blank
   is a gap and filling it is plainly right. A tire that says $612 was
   probably typed off an invoice by somebody holding it, and that is
   better information than a list price. Both are offered, counted
   separately, and the second one is not ticked by default.

   AND IT SAYS WHAT IT IS ABOUT TO DO BEFORE IT DOES IT, with the
   count and the money, because this is one click that writes to a
   hundred and forty rows.

   Nothing here touches the database. */

import { sameModel } from "./tireModel.js";

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* Which tires this catalog row is fitted to right now.

   Matched on the row it was mounted off where there is one, and on
   the squashed brand, model, size and type where there is not — the
   141 Continental HDC3s already carry their row, but the twelve HAC3s
   were mounted long before the catalog existed and still have to be
   reachable by it, or the catalog only ever helps with tires bought
   after the catalog. */
export function onThisRow(model = {}, tires = []) {
  return tires.filter((t) =>
    !t.offDate && ((model.id && t.modelId === model.id) || sameModel(t, model)));
}

/* What putting this price on them would do, counted three ways. The
   three are different decisions, so they are never one number. */
export function planPrice(model = {}, tires = [], cost) {
  const want = num(cost);
  const fitted = onThisRow(model, tires);
  const blank = [], differs = [], same = [];
  fitted.forEach((t) => {
    const had = num(t.cost);
    if (want == null) return;
    if (had == null) blank.push(t);
    else if (Math.abs(had - want) < 0.005) same.push(t);
    else differs.push(t);
  });
  return { cost: want, fitted, blank, differs, same,
    total: blank.length + differs.length };
}

/* Whether this is worth stopping to ask about at all. Nothing to
   change is not a question. */
export const worthAsking = (plan) => !!plan && plan.cost != null && plan.total > 0;

const tires = (n) => `${n} tire${n === 1 ? "" : "s"}`;
/* One tire says, two tires say. Worth the three characters: a count
   that does not agree with its verb reads as a figure nobody looked
   at, on the one screen in this app that is asking to be trusted
   before it writes to a hundred and forty rows. */
const says = (n) => (n === 1 ? "says" : "say");
const has = (n) => (n === 1 ? "has" : "have");

/* Said as the shop would say it, with the money in it. "Update 141
   records" is a sentence about a database; "122 tires on the trucks
   have no price on them" is a sentence about tires. */
export function sayPlan(plan = {}, money = (v) => `$${v}`) {
  if (!worthAsking(plan)) return "";
  const bits = [];
  if (plan.blank.length) {
    const n = plan.blank.length;
    bits.push(`${tires(n)} on the trucks ${has(n)} no price on ${n === 1 ? "it" : "them"}`);
  }
  if (plan.differs.length)
    bits.push(`${tires(plan.differs.length)} ${says(plan.differs.length)} something different`);
  const n = plan.same.length;
  const had = n ? ` ${tires(n)} already ${says(n)} ${money(plan.cost)}.` : "";
  return `${bits.join(", and ")}.${had}`;
}

/* The ids to write, which is the whole point of the tick. */
export function idsFor(plan = {}, alsoChange = false) {
  const rows = [...(plan.blank || []), ...(alsoChange ? plan.differs || [] : [])];
  return rows.map((t) => t.id);
}

/* What the shop is about to commit to, so it is on the screen before
   the button rather than in a report afterwards. */
export function spendAfter(plan = {}, alsoChange = false) {
  const n = idsFor(plan, alsoChange).length;
  return plan.cost == null ? null : n * plan.cost;
}
