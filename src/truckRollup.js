/* Finding a truck, and adding its file up.
   ─────────────────────────────────────────────────────────────────
   The half of the truck file that is arithmetic rather than reading.
   Its own module, with no database import, for the same reason
   csvImport.js and shiftMath.js are: the totals on this page are what
   somebody quotes in a meeting, and they should be checkable without a
   browser, a key or a network.

   rollUp backs the screen AND the CSV. A file that shows one total and
   exports another is worse than one that shows nothing. */

import { dualMismatches, wheelsFrom, DUAL_LIMIT } from "./dualMatch.js";

const r2 = (n) => Math.round(n * 100) / 100;

export const squash = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* Loose enough for somebody holding a wrench. "881", "dt881" and
   "DT 881" all find DT-881; a bare number matches the digits so nobody
   has to remember whether it is a DT or an HT. */
const digitsOf = (s) => squash(s).replace(/^[A-Z]+/, "");

export function findUnits(units, typed) {
  const q = squash(typed);
  if (!q) return [];
  const digits = /^\d+$/.test(q);
  const hit = units.filter((u) => {
    const n = squash(u.num);
    return digits ? digitsOf(n).startsWith(q) || n.includes(q) : n.includes(q);
  });

  /* Shortest first, then alphabetical. Typing "881" offers DT-881
     before DT-1881, which is what somebody means.

     There was an "exact match first" rule ahead of this and it came
     back out. Every unit number here is a prefix and digits, so the
     match whose digits ARE what was typed is always the shortest one
     too — the rule agreed with length in every case and decided none of
     them. A branch that can never change an answer reads as care and is
     not; the shape of the numbers is what makes this work, and saying
     so is better than a second rule pretending to. */
  return hit.sort((a, b) =>
    a.num.length - b.num.length || a.num.localeCompare(b.num)).slice(0, 12);
}


/* ── The numbers across the top ────────────────────────────────────
   Worked out here rather than in the component so the same arithmetic
   backs the screen and the CSV, and so it can be tested without a
   browser. A file that shows one total and exports another is worse
   than one that shows nothing. */
export function rollUp(f, { from, to, dualMatch = DUAL_LIMIT } = {}) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const inRangeAt = (iso) => inRange(String(iso || "").slice(0, 10));

  const hours = f.hours.filter((h) => inRange(h.date));
  const parts = f.parts.filter((p) => inRangeAt(p.at) && p.kind === "issue");
  const services = f.services.filter((s) => inRange(s.date));

  const byMechanic = new Map();
  for (const h of hours) {
    const k = h.mechanic || "—";
    const g = byMechanic.get(k) || { mechanic: k, hours: 0, days: new Set(), last: null };
    g.hours += h.hours;
    g.days.add(h.date);
    if (!g.last || h.date > g.last) g.last = h.date;
    byMechanic.set(k, g);
  }

  const byCode = new Map();
  for (const h of hours) {
    const k = h.code || "—";
    const g = byCode.get(k) || { code: k, name: h.codeName || "", hours: 0, lines: 0 };
    g.hours += h.hours;
    g.lines += 1;
    byCode.set(k, g);
  }

  const tiresOn = f.tires.filter((t) => t.on);
  const tiresOff = f.tires.filter((t) => !t.on);

  /* Two tires on one end of an axle only share the load if they are
     close to the same size. Never narrowed by the date range — what is
     mounted on the truck is not a date question. */
  const depthAt = (pos) => {
    const t = tiresOn.find((x) => String(x.pos).toUpperCase() === pos);
    return t && t.depth != null ? t.depth : null;
  };
  const mismatchedPairs = dualMismatches(
    wheelsFrom(tiresOn.map((t) => t.pos)), depthAt, dualMatch);

  return {
    labourHours: r2(hours.reduce((a, h) => a + h.hours, 0)),
    lines: hours.length,
    mechanics: [...byMechanic.values()]
      .map((g) => ({ ...g, hours: r2(g.hours), days: g.days.size }))
      .sort((a, b) => b.hours - a.hours),
    codes: [...byCode.values()]
      .map((g) => ({ ...g, hours: r2(g.hours) }))
      .sort((a, b) => b.hours - a.hours),

    partLines: parts.length,
    partsCost: r2(parts.reduce((a, p) => a + (p.cost || 0) * p.qty, 0)),

    servicesDone: services.length,
    openDefects: f.defects.filter((d) => d.state !== "repaired").length,
    /* Deliberately not called "out of service". All this knows is that
       a driver typed the defect major on a DVIR; the phrase means a
       roadside inspector's order, and a report that claims one the shop
       never received is worse than a report that says nothing. */
    majorDefect: f.defects.some((d) => d.state !== "repaired" && d.safety === "unsafe"),
    repairedDefects: f.defects.filter((d) => d.repairedAt && inRangeAt(d.repairedAt)).length,
    openOrders: f.orders.filter((w) => w.state !== "done").length,
    doneOrders: f.orders.filter((w) => w.state === "done" && inRangeAt(w.completedAt)).length,

    mismatchedPairs,
    tiresOn: tiresOn.length,
    tiresOff: tiresOff.length,
    tireSpend: r2(f.tires.reduce((a, t) => a + (t.cost || 0), 0)),
    pmOver: f.pmDue.filter((p) => p.level === "over").length,
    pmSoon: f.pmDue.filter((p) => p.level === "soon").length,
  };
}
