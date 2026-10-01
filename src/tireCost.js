/* ── What a tire costs ────────────────────────────────────────────
   The Analysis page has always answered "which tire lasts longest",
   in miles per 32nd. That is the wrong question to order off. A tire
   that runs 15% further and costs 40% more is a worse buy, and until
   now nothing in this app could say so.

   Two figures answer it, and they are deliberately different jobs:

   COST PER 32ND is what one thirty-second of usable tread cost. It
   needs no mileage at all — a tire mounted this morning has one. It
   is the figure to compare two quotes with, because it already
   accounts for the fact that a deeper tire at the same price is more
   tire.

   COST PER MILE is what the tire costs to run. It needs a wear rate,
   so it only appears once a tire has been gauged at least once past
   its mount.

   Three rules this module will not bend:

   Usable tread is the mount depth down to the PULL POINT, not down to
   nothing. A 28/32 drive tire pulled at 4/32 gives 24/32, not 28 —
   the last four are the law's, not ours. Dividing by 28 would make
   every tire look 17% cheaper than it is, and would flatter a deep
   tire over a shallow one by more than the difference is worth.

   A tire with no price on it is left out and SAID to be left out. 490
   of the 640 tires on this fleet have no cost, and a brand average
   quietly built on the 23% that do is worse than no figure at all.

   And a group's figure is its total cost over its total miles, never
   the average of each tire's own cost per mile. Averaging ratios lets
   one tire that was scrapped at 2,000 miles count the same as one
   that ran 180,000, which is how a good tire ends up looking dear.

   Nothing here touches the database. */

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* How much tread this tire was ever allowed to give: what it measured
   when it went on, down to the depth it has to come off at. The pull
   point is already worked out per wheel — a steer comes off higher
   than a drive, so the same tire on a steer axle is dearer per mile,
   which is true and is the sort of thing this page exists to show. */
export function usableTread(t = {}, s = {}) {
  const mounted = num(t.newDepth);
  const pull = num(s.pull);
  if (mounted == null || pull == null) return null;
  const usable = mounted - pull;
  return usable > 0 ? usable : null;
}

/* Everything the money columns need for one tire, with the reason it
   cannot say instead of a blank where there is one. A blank that does
   not say why reads as a bug; a sentence reads as a job. */
export function lifeOf(t = {}, s = {}) {
  const cost = num(t.cost);
  const usable = usableTread(t, s);
  const pulled = !!t.offDate;
  const ran = num(s.miles);
  const left = num(s.remain);

  /* What this tire will have run by the time it comes off. A tire
     already off ran what it ran. A tire still on has its miles so far
     plus what today's wear rate says is left in it — which is the
     same arithmetic as usable tread times miles per 32nd, taken from
     the two figures already on the screen so the table adds up in
     front of somebody rather than needing to be believed. */
  const lifeMiles = pulled
    ? (ran != null && ran > 0 ? ran : null)
    : (ran != null && left != null && ran + left > 0 ? ran + left : null);

  const out = {
    cost, usable, lifeMiles,
    projected: !pulled,
    per32: cost != null && usable ? cost / usable : null,
    perMile: cost != null && lifeMiles ? cost / lifeMiles : null,
    why: "",
  };

  if (cost == null) out.why = "no price on it";
  else if (usable == null) out.why = "no mount depth, or it went on at the pull point";
  else if (lifeMiles == null) out.why = pulled ? "no miles recorded against it" : "no wear rate yet";
  return out;
}

/* One line of a cost chart. Total over total, never the mean of the
   ratios — see the rule at the top. The count of what was left out
   travels with it, because a figure covering four tires out of thirty
   is a different claim from one covering thirty. */
export function costGroup(rows = [], keyFn = () => "All") {
  const m = new Map();
  rows.forEach(({ t, s }) => {
    const k = keyFn(t, s) || "Unspecified";
    if (!m.has(k)) m.set(k, { name: k, n: 0, priced: 0, cost: 0,
      costTread: 0, usable: 0, costMiles: 0, miles: 0, milesPriced: 0 });
    const g = m.get(k);
    const L = lifeOf(t, s);
    g.n += 1;
    if (L.cost == null) return;
    g.priced += 1;
    g.cost += L.cost;
    /* Each figure carries its OWN cost total, and only the tires that
       are in its denominator are in its numerator.

       The alternative looks tidier and is wrong: one cost total over
       whichever denominator is being asked for. A tire bought and
       mounted this morning has a price and no miles yet, so its $500
       would land on top of a group's spend while its miles stayed at
       nought — and the brand would read dearer per mile for having
       been bought recently. The same trap the other way round for a
       tire with no mount depth, which has a price and no tread to
       divide it by. */
    if (L.usable) { g.costTread += L.cost; g.usable += L.usable; }
    if (L.lifeMiles) { g.costMiles += L.cost; g.miles += L.lifeMiles; g.milesPriced += 1; }
  });
  return [...m.values()].map((g) => ({
    ...g,
    per32: g.usable > 0 ? g.costTread / g.usable : null,
    perMile: g.miles > 0 ? g.costMiles / g.miles : null,
  }));
}

/* Cheapest first. The miles charts on this page sort the other way
   round and say "higher is better" on them; these say "lower is
   better", and sorting them the same way as the others would be a
   trap set for somebody reading quickly. A line with no figure goes
   to the bottom rather than sorting as nought, which would put the
   tires nobody has priced at the top of a chart about price. */
export function cheapestFirst(groups = [], field = "perMile") {
  return [...groups]
    .filter((g) => g[field] != null)
    .sort((a, b) => a[field] - b[field] || a.name.localeCompare(b.name));
}

/* How much of what is on the screen the money figures actually cover.
   Said as a sentence because the number on its own invites the reader
   to assume the rest. */
export function coverage(rows = []) {
  const total = rows.length;
  const priced = rows.filter(({ t }) => num(t.cost) != null).length;
  const missing = total - priced;
  return {
    total, priced, missing,
    pct: total ? Math.round((priced / total) * 100) : 0,
    /* Said in whole sentences, including the awkward ones. "the other
       1 are left out" is the sort of line that makes somebody trust a
       figure less than they should. */
    say: !total ? "Nothing here yet"
      : !priced ? (total === 1
          ? "This tire has no price on it, so there is nothing to divide"
          : `None of these ${total} tires has a price on it, so there is nothing to divide`)
      : !missing ? (total === 1
          ? "This tire has a price on it"
          : `Every one of these ${total} tires has a price on it`)
      : `${priced} of ${total} tires here have a price on them — the other ${
          missing === 1 ? "one is" : `${missing} are`} left out of the cost figures`,
  };
}

/* Money, said the way a shop says it. Three figures live on this page
   at three different scales and each needs a different number of
   decimals to say anything:

     cost per mile    $0.006   under a dollar, so it keeps three —
                               0.004 and 0.006 rounded to the penny
                               are the same number, and over a
                               100,000-mile casing they are $200 apart
     cost per 32nd    $27.30   cents, the way a quote is written
     a tire           $655.24  cents, the way the invoice is written
     a total        $90,423    nobody reads the cents on a total */
export function money(v, { cents = null } = {}) {
  if (v == null || !Number.isFinite(v)) return "—";
  const d = cents != null ? cents : Math.abs(v) < 1 ? 3 : Math.abs(v) < 10000 ? 2 : 0;
  return `$${Number(v).toLocaleString("en-US",
    { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
