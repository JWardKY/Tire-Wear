/* ── Tread that cannot be right ───────────────────────────────────
   DT-899 came back from a walk-around with 3RI reading 17/32 for the
   third time running, 4RI at 10/32 after reading 11/32 eleven days
   earlier, and 4RO at 14/32 after reading 10/32. Rubber does not grow
   back.

   The screen said none of it. The only symptom was a blank in the
   miles-per-32nd column — which is what you get when there is no wear
   to divide by, and which nobody reads as "these numbers are wrong".
   Four wheels looked unmeasured when they had been measured twice.

   A tire's depth only ever goes down. So today's reading cannot be
   more than the shallowest figure already recorded for it, whether
   that came from a gauge or from the depth keyed when it was mounted.
   That is the whole rule.

   The one thing it allows for is the gauge. Two people reading the
   same tire, or one person reading a different groove, differ by
   about a 32nd; flagging that would fire on half the fleet every
   walk-around and teach everybody to ignore the flag. More than a
   32nd is not where you put the gauge, it is a wrong number. On
   DT-899 that catches 1L (+4), 2R (+2) and 4RO (+4) and stays quiet
   about the +0.5 on 3LO. */

export const GAUGE_SLOP = 1;

/* A depth, or nothing. The explicit null and "" are the point of it:
   Number(null) is 0 and so is Number(""), so a point with no depth
   would come through as a tire worn to the cords, become the
   shallowest figure on record, and make every later reading look
   impossible. A tire read to nothing IS a real reading, so zero has
   to survive — which is exactly why the absence of one cannot be
   allowed to look like it. */
function num(x) {
  if (x == null || x === "" || typeof x === "boolean") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/* The points are the ones the Tires screen already builds per tire:
   the mount, then every reading, sorted by odometer.
     [{ odo, d, date, mount? }, …] */
const usable = (pts) => (pts || []).filter((p) => p && num(p.d) != null);

/* The shallowest point so far, which is as deep as the next reading
   can possibly be. Ties go to the earlier point, so the message names
   where the figure first appeared rather than the last time it was
   repeated. */
export function ceilingFrom(pts) {
  let best = null;
  for (const p of usable(pts)) if (best == null || num(p.d) < num(best.d)) best = p;
  return best;
}

/* Is this depth impossible against what is already recorded?
   Returns nothing when it is fine, or what it contradicts. */
export function checkDepth(depth, pts) {
  const d = num(depth);
  if (d == null) return null;
  const cap = ceilingFrom(pts);
  if (!cap) return null;                       // nothing to contradict yet
  const by = Math.round((d - num(cap.d)) * 10) / 10;
  if (by <= GAUGE_SLOP) return null;
  return { was: num(cap.d), when: cap.date, fromMount: !!cap.mount, by, typed: d };
}

/* The same rule over what is already saved, for a tire nobody is
   typing into. Each step that reads deeper than something before it,
   worst first. */
export function risesIn(pts) {
  const ps = usable(pts);
  const out = [];
  let cap = null;
  for (const p of ps) {
    if (cap) {
      const by = Math.round((num(p.d) - num(cap.d)) * 10) / 10;
      if (by > GAUGE_SLOP) {
        out.push({ was: num(cap.d), when: cap.date, fromMount: !!cap.mount,
                   now: num(p.d), at: p.date, by });
      }
    }
    if (cap == null || num(p.d) < num(cap.d)) cap = p;
  }
  return out.sort((a, b) => b.by - a.by);
}

/* The worst step in a tire's history, or nothing if it reads straight. */
export function worstRise(pts) {
  return risesIn(pts)[0] || null;
}

const on = (date) => {
  if (!date) return "";
  const [y, m, d] = String(date).slice(0, 10).split("-");
  return y && m && d ? ` on ${m}/${d}/${String(y).slice(2)}` : "";
};

const n32 = (x) => `${Math.round(+x * 10) / 10}/32`;

/* What the form says beside the box somebody is typing in. */
export function sayTyped(bad) {
  if (!bad) return "";
  return bad.fromMount
    ? `Deeper than the ${n32(bad.was)} it was mounted at${on(bad.when)}.`
    : `Deeper than the ${n32(bad.was)} it read${on(bad.when)}.`;
}

/* What the banner says about a wheel whose saved history goes the
   wrong way. `pos` is the wheel, so the sentence stands on its own in
   a list of them. */
export function sayRise(pos, r) {
  if (!r) return "";
  const from = r.fromMount
    ? `mounted at ${n32(r.was)}`
    : `read ${n32(r.was)}${on(r.when)}`;
  return `${pos} ${from}, then ${n32(r.now)}${on(r.at)} — ${n32(r.by)} deeper than it started.`;
}

/* A mount depth is the floor everything is measured from, so one keyed
   too shallow makes a tire look as though it never wears. That is the
   other half of DT-899: 4RI mounted at 10/32 and gauged at 11/32 two
   weeks later, so the wear came out as nothing at all and the wheel
   went blank. Checked against the readings already taken, which is
   the evidence that the mount figure is the wrong one. */
export function checkMount(depth, readings) {
  const d = num(depth);
  if (d == null) return null;
  let worst = null;
  for (const r of usable(readings)) {
    if (num(r.d) - d > GAUGE_SLOP && (worst == null || num(r.d) > num(worst.d))) worst = r;
  }
  if (!worst) return null;
  return { read: num(worst.d), when: worst.date,
           by: Math.round((num(worst.d) - d) * 10) / 10, typed: d };
}

export function sayMount(bad) {
  if (!bad) return "";
  return `It gauged ${n32(bad.read)}${on(bad.when)}, deeper than the `
    + `${n32(bad.typed)} here. A tire does not gain tread, so one of the two is wrong.`;
}

/* ── Why a wheel has no wear rate ─────────────────────────────────
   The blank is what sent somebody looking. Four wheels on DT-899 read
   "—" in the miles-per-32nd column and the obvious reading of that is
   "the data never went in" — when in fact it had gone in twice, and
   said the tire had not worn at all in 4,138 miles.

   Miles per 32nd is miles divided by 32nds worn. With nothing worn
   there is nothing to divide by, so the app is right to print no
   number; it was wrong to print no reason. Each of these is a
   statement of fact, not a judgement. Somebody who reads "no wear
   measured in 4,138 mi" knows what to do about it; "—" tells them
   nothing at all.

   `st` is the per-tire stats the screen already holds: depth, miles,
   worn, miPer32 and the point series. */
export function whyNoRate(st) {
  if (!st) return null;
  if (st.miPer32) return null;                 // there is a rate; nothing to explain
  if (st.depth == null) return { kind: "unmeasured", say: "not measured yet" };

  const rise = worstRise(st.pts);
  if (rise) {
    return { kind: "grew", rise,
      say: rise.fromMount
        ? `reads ${n32(rise.by)} deeper than when it was mounted`
        : `reads ${n32(rise.by)} deeper than it did${on(rise.when)}` };
  }
  const miles = num(st.miles);
  if (miles == null || miles <= 0) {
    return { kind: "no-miles", say: "no miles since it went on" };
  }
  return { kind: "no-wear", miles,
    say: `no wear measured in ${miles.toLocaleString()} mi` };
}
