/* Duals that do not match.
   ─────────────────────────────────────────────────────────────────
   Two tires on the same end of the same axle carry the load together,
   and they only share it if they are close to the same size. Put a
   27/32 beside a 15/32 and the deep one takes the weight, runs hot and
   scrubs — so the shop buys two tires instead of none.

   Four 32nds between a pair is the number the industry uses and the
   number Jason asked for. It is a setting rather than a constant here,
   in the same place as the pull depths, because it is the kind of
   figure a shop argues about and should not need a deploy to change.

   No database import: this is arithmetic over positions and depths, and
   the two screens that show it should not be the only way to check it.
*/

export const DUAL_LIMIT = 4;

/* Wheel positions read off the position codes themselves — "4RO" is
   axle 4, right side, outer.

   Deliberately not taken from the truck's axle configuration. The config
   says what the truck is supposed to have; the positions say what is
   actually mounted on it. A truck set to a 12-tire config with duals
   mounted on the pusher would have a real mismatched pair that a
   config-driven check could not see, and the tire is on the truck
   either way. */
export function wheelsFrom(positionIds) {
  const out = [];
  for (const id of positionIds || []) {
    const m = /^(\d+)([LR])([IO])?$/.exec(String(id).toUpperCase());
    if (!m) continue;
    out.push({ id: String(id).toUpperCase(), axle: Number(m[1]), side: m[2],
      slot: m[3] || "S" });
  }
  return out;
}

/* The wheel positions that sit beside each other. A position carries a
   slot — I, O, or S for a single — so a pair is an axle and a side with
   both an inner and an outer on it. Steers and super singles have no
   partner and are not in here at all. */
export function dualPairs(positions) {
  const ends = new Map();
  for (const p of positions || []) {
    if (p.slot !== "I" && p.slot !== "O") continue;
    const key = `${p.axle}${p.side}`;
    const g = ends.get(key) || { end: key, axle: p.axle, side: p.side, role: p.role };
    g[p.slot === "I" ? "inner" : "outer"] = p.id;
    ends.set(key, g);
  }
  /* A half-built config — an inner with no outer — is not a pair and
     must not read as one. */
  return [...ends.values()].filter((g) => g.inner && g.outer);
}

/* `depthAt` is asked for a position and answers the tread on it, or null
   for a wheel with no tire or no reading yet.

   A pair with only one depth is skipped rather than flagged. There is
   nothing to compare it to, and a flag that fires on a half-measured
   truck is a flag people learn to ignore. */
export function dualMismatches(positions, depthAt, limit = DUAL_LIMIT) {
  const cap = Number.isFinite(Number(limit)) ? Number(limit) : DUAL_LIMIT;
  const out = [];

  for (const pair of dualPairs(positions)) {
    const i = depthAt(pair.inner);
    const o = depthAt(pair.outer);
    if (i == null || o == null) continue;

    /* Depths are recorded to a tenth, so the difference is rounded to a
       tenth before it is compared — 12.000000000000002 must not read as
       a wider gap than 12. */
    const diff = Math.round(Math.abs(Number(i) - Number(o)) * 10) / 10;
    if (!(diff > cap)) continue;

    out.push({
      ...pair,
      innerDepth: Number(i), outerDepth: Number(o), diff,
      deeper: i > o ? pair.inner : pair.outer,
      shallower: i > o ? pair.outer : pair.inner,
      deepest: Math.max(Number(i), Number(o)),
      shallowest: Math.min(Number(i), Number(o)),
    });
  }
  /* Worst first: the widest gap is the one to deal with. */
  return out.sort((a, b) => b.diff - a.diff || a.end.localeCompare(b.end));
}

/* Every wheel caught in a mismatched pair, for marking a diagram. */
export const mismatchedWheels = (list) =>
  new Set((list || []).flatMap((m) => [m.inner, m.outer]));

/* One line a person can read, on a card or in an email. */
export const sayMismatch = (m) =>
  `${m.end} is ${m.diff}/32 apart — ${m.shallower} at ${m.shallowest}/32 ` +
  `beside ${m.deeper} at ${m.deepest}/32`;
