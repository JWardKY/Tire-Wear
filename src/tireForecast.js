/* ── When tires will need replacing ───────────────────────────────
   What to buy, and when. A tire's tread above its pull point, divided
   by how fast it is wearing, is how many miles it has left; divided
   again by how far its truck runs in a month, it is a date. Add those
   up by size and you have a purchasing forecast.

   Two things make that arithmetic lie if it is done naively, and both
   are in this fleet's real data. This module exists mostly to stop
   them.

   ── A wear rate measured over too few miles is not a wear rate ──

   Across the 258 tires on trucks with a rate, the amount "worn" sits
   at about 2.3/32 whatever the distance — under a thousand miles or
   over five thousand. That is not wear. It is the gap between the
   depth keyed when a tire was mounted and the first real gauge, and it
   is roughly constant. Divide a constant 2.3/32 by 800 miles and you
   get a tire wearing 1/32 every 143 miles: bald in a few weeks. The
   measured median climbs from 143 mi/32 under 1,000 miles to over
   3,000 mi/32 past 5,000 miles, which is that offset being diluted
   rather than the tires changing.

   So a rate is only used when it is built over MIN_RATE_MILES or more.
   Below that the tire is reported as not forecastable yet — never
   quietly dropped, and never forecast to need replacing next week
   because it has barely turned a wheel.

   ── An odometer that jumps is not a truck that drove ──

   HT-1404 "ran" 203,629 miles in 68 days. DT-870, which carries twelve
   tires, came out at 46,000 miles a month the obvious way — first and
   last reading — because one low value sits in its history. Its actual
   daily readings run about 200 miles a day. Pace is therefore the sum
   of FORWARD steps between consecutive readings, ignoring any step
   backwards (a replaced odometer, a typo) and any step faster than a
   truck can physically go. That puts DT-870 back at about 4,000.

   Nothing here touches the database. */

/* Distance a wear rate has to be built over before it is believed.
   Chosen from this fleet's own data: below about 2,500 miles the
   mount-to-first-gauge offset dominates and rates run several times
   too fast. Named so it can be tuned rather than buried. */
export const MIN_RATE_MILES = 2500;

/* ── A rate that depends on the mount depth being right ───────────
   A tire gauged once has a wear rate only because its mount depth is
   the other end of the measurement — and the mount depth is typed in
   by hand. DT-1810 has three tires mounted at 27, 26 and 21 that each
   lost exactly 9/32 by their first gauge. Three tires do not wear
   identically; that is an offset in how the mount depth was keyed, and
   no amount of mileage filters it out because the whole rate rests on
   that one figure.

   Two gauges remove the mount depth from the arithmetic entirely, so a
   tire gauged twice is measured gauge to gauge. A tire gauged once is
   still used — but when its rate implies wear faster than this, it is
   moved to "check before ordering" rather than allowed to put tires on
   a purchase order. 500 miles per 32nd is a full drive tire gone in
   about 12,000 miles; this fleet's settled median is three times that. */
export const SUSPECT_RATE = 500;

/* How far back a truck's pace is read from. Long enough to smooth a
   week in the shop, short enough that a truck moved to a different job
   in the spring is not still forecast on its old route. */
export const PACE_DAYS = 180;

/* Below this a truck's pace is not measured, it is guessed. */
export const MIN_PACE_DAYS = 30;

/* Faster than any of these trucks can drive in a day. A step between
   two readings that implies more is an odometer problem, not a trip. */
export const MAX_MILES_PER_DAY = 1200;

export const DAYS_PER_MONTH = 30.44;

/* The horizons asked for. "Past the limit" is its own bucket ahead of
   all of these, and "later" catches everything beyond the last. */
export const HORIZONS = [1, 3, 6, 12];

const num = (x) => {
  if (x == null || x === "" || typeof x === "boolean") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const dayMs = 86400000;
const toDay = (d) => {
  const t = Date.parse(String(d).slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(t) ? t : null;
};

/* ── How far a truck runs in a month ──────────────────────────────
   `odos` is every odometer row for ONE vehicle: [{ date, odo }, …].
   Returns { miPerMonth, days, readings, ignored } or, when there is no
   honest answer, { miPerMonth: null, why }. */
export function paceOf(odos = [], { today = new Date(), days = PACE_DAYS } = {}) {
  const end = toDay(today instanceof Date ? today.toISOString() : today);
  const from = end - days * dayMs;
  const pts = odos
    .map((o) => ({ t: toDay(o.date), odo: num(o.odo) }))
    .filter((p) => p.t != null && p.odo != null && p.t >= from && p.t <= end)
    .sort((a, b) => a.t - b.t || a.odo - b.odo);

  if (pts.length < 2) {
    return { miPerMonth: null, why: "no mileage recorded on this truck lately" };
  }
  const span = (pts[pts.length - 1].t - pts[0].t) / dayMs;
  if (span < MIN_PACE_DAYS) {
    return { miPerMonth: null,
      why: `only ${Math.round(span)} days of mileage — not enough to set a pace` };
  }

  let miles = 0, ignored = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const step = pts[i].odo - pts[i - 1].odo;
    const gap = Math.max(1, (pts[i].t - pts[i - 1].t) / dayMs);
    /* Backwards is a replaced odometer or a typo; impossibly far is a
       bad reading. Neither is driving, and either one counted would
       swamp a month of real miles. */
    if (step < 0 || step / gap > MAX_MILES_PER_DAY) { ignored += 1; continue; }
    miles += step;
  }
  const miPerMonth = Math.round((miles / span) * DAYS_PER_MONTH);
  return { miPerMonth, days: Math.round(span), readings: pts.length, ignored };
}

/* Every vehicle's pace at once, keyed by vehicle number. */
export function pacesByVehicle(odos = [], opts) {
  const by = new Map();
  odos.forEach((o) => {
    const k = o.veh;
    if (!k) return;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(o);
  });
  const out = {};
  by.forEach((rows, k) => { out[k] = paceOf(rows, opts); });
  return out;
}

/* ── One tire ─────────────────────────────────────────────────────
   `stats` is the per-tire record the Tires screen already builds:
   depth, pull, miPer32, miles (the distance the rate is built on).

   state:
     "past"     at or below its pull point today
     "forecast" a date can be given
     "unsettled" a rate exists but on too few miles to trust
     "no-rate"  gauged, but nothing to measure wear against yet
     "no-pace"  wear is known but the truck's mileage is not
     "parked"   the truck has not moved, so mileage will not wear it
     "suspect"  a rate resting on one gauge and a mount depth, wearing
                faster than this fleet plausibly wears */
export function forecastTire(stats = {}, pace = {}) {
  const depth = num(stats.depth);
  const pull = num(stats.pull);
  if (depth == null || pull == null) return { state: "no-rate", why: "no depth on record" };

  if (depth <= pull) {
    return { state: "past", over: Math.round((pull - depth) * 10) / 10, monthsLeft: 0 };
  }

  const m = rateOf(stats);
  if (!m.rate) {
    return { state: m.state || "no-rate", why: m.why
      || "needs a second gauge before wear can be measured" };
  }
  if (m.builtOn < MIN_RATE_MILES) {
    return { state: "unsettled", basis: m.basis,
      why: `wear measured over ${Math.round(m.builtOn).toLocaleString()} mi — needs `
        + `${MIN_RATE_MILES.toLocaleString()} before it can be trusted` };
  }
  /* Only a mount-based rate is second-guessed. Two real gauges are two
     real readings; one gauge against a typed mount depth is one. */
  if (m.basis === "mount" && m.rate < SUSPECT_RATE) {
    return { state: "suspect", basis: m.basis, rate: m.rate,
      why: `lost ${m.worn}/32 in ${Math.round(m.builtOn).toLocaleString()} mi against a `
        + `mount depth of ${m.from} — check the mount depth before ordering` };
  }
  const rate = m.rate;

  const milesLeft = (depth - pull) * rate;
  const mpm = num(pace.miPerMonth);
  if (mpm == null) return { state: "no-pace", milesLeft, why: pace.why || "no mileage on this truck" };
  if (mpm <= 0) return { state: "parked", milesLeft, why: "the truck has not moved" };

  return { state: "forecast", milesLeft: Math.round(milesLeft),
    monthsLeft: Math.round((milesLeft / mpm) * 10) / 10, rate, mpm,
    basis: m.basis, builtOn: m.builtOn };
}

/* The wear rate to forecast from, and what it rests on.

   `stats.pts` is the series the Tires screen builds: the mount point
   (flagged mount: true) then every gauge, by odometer. With two or
   more gauges the first and last GAUGE are used and the mount depth
   plays no part. With one gauge the mount is the only other end.
   Falls back to the view's own figure when no series is supplied. */
export function rateOf(stats = {}) {
  const pts = (stats.pts || [])
    .map((p) => ({ odo: num(p.odo), d: num(p.d), mount: !!p.mount }))
    .filter((p) => p.odo != null && p.d != null)
    .sort((a, b) => a.odo - b.odo);
  const gauges = pts.filter((p) => !p.mount);
  const mount = pts.find((p) => p.mount);

  /* Gauge to gauge first, when it is long enough to mean something:
     the mount depth plays no part. */
  let gaugedShort = null;
  if (gauges.length >= 2) {
    const a = gauges[0], b = gauges[gauges.length - 1];
    const span = b.odo - a.odo, worn = Math.round((a.d - b.d) * 10) / 10;
    if (span > 0 && worn > 0 && span >= MIN_RATE_MILES) {
      return { rate: span / worn, builtOn: span, worn, basis: "gauged", from: a.d };
    }
    /* Too short, or read the same or deeper — nothing measurable worn
       yet between the gauges. Kept as the answer only if the mount
       cannot give a longer baseline below. */
    gaugedShort = span > 0
      ? { state: "unsettled", basis: "gauged", builtOn: Math.max(0, worn > 0 ? span : 0),
          why: worn > 0
            ? `wear measured over ${span.toLocaleString()} mi — needs `
              + `${MIN_RATE_MILES.toLocaleString()} before it can be trusted`
            : `no wear measured between gauges over ${span.toLocaleString()} mi` }
      : { state: "no-rate", why: "both gauges at the same mileage" };
  }

  /* Mount to the LAST gauge — the longest baseline there is. Used for a
     tire gauged once, and for one gauged twice too close together. It
     rests on the typed mount depth, so it is marked "mount" and goes
     through the suspect check in forecastTire. */
  if (mount && gauges.length >= 1) {
    const g = gauges[gauges.length - 1];
    const span = g.odo - mount.odo, worn = Math.round((mount.d - g.d) * 10) / 10;
    if (span > 0 && worn > 0) {
      return { rate: span / worn, builtOn: span, worn, basis: "mount", from: mount.d };
    }
  }
  if (gaugedShort) return gaugedShort;
  if (mount && gauges.length === 1) {
    return { state: "no-rate", why: "needs a second gauge before wear can be measured" };
  }

  /* No series handed over — use what the database view worked out. It
     measures from the mount, so it is treated as mount-based. */
  const r = num(stats.miPer32), builtOn = num(stats.miles);
  if (r) {
    return { rate: r, builtOn: builtOn ?? 0, basis: "mount",
      worn: num(stats.worn), from: num(stats.first) };
  }
  return { state: "no-rate" };
}

/* Which horizon a forecast falls in. Months are compared exactly, so
   a tire due in 1.0 months is a one-month tire and one due in 1.1 is
   a three-month tire. */
export function horizonOf(f = {}) {
  if (f.state === "past") return "past";
  if (f.state !== "forecast") return null;
  for (const h of HORIZONS) if (f.monthsLeft <= h) return h;
  return "later";
}

/* What size to buy. Size is the purchasing key; brand and model are
   a preference. A tire with no size on record is grouped as such
   rather than dropped, so the totals still add up. */
export const sizeOf = (t = {}) => normalizeSize(t.size) || "Size not recorded";

/* One size, one spelling. This fleet has 425/65R22.5 recorded as
   "425/65R22.5", "425/65 R22.5", "425/65r22.5", "425/65/r22.5" and
   "425/65/22.5" — five rows on a purchase order for one tire. Case,
   spaces and the slash-for-R habit are folded together. Anything that
   does not parse is returned as typed rather than guessed at: a wrong
   merge would put the wrong tire on an order. */
export function normalizeSize(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  const s = t.toUpperCase().replace(/\s+/g, "");
  /* Metric: 425/65R22.5, 425/65/22.5, 425/65/R22.5 */
  let m = s.match(/^(\d{3})\/(\d{2})(?:\/?R|\/)(\d{2}(?:\.5)?)$/);
  if (m) return `${m[1]}/${m[2]}R${m[3]}`;
  /* Imperial: 11R22.5, 11/22.5 */
  m = s.match(/^(\d{2})(?:R|\/)(\d{2}(?:\.5)?)$/);
  if (m) return `${m[1]}R${m[2]}`;
  return t;
}

/* ── The whole fleet ──────────────────────────────────────────────
   `rows` is [{ tire, stats }]. Pass `paces` from pacesByVehicle.

   Returns:
     past        tires at or under their pull point now
     due         every forecast tire, soonest first, with its horizon
     bands       per horizon: the tires falling in it, and the running
                 total — "how many by then" is what purchasing orders
                 against
     bySize      per size, running totals at each horizon
     unknown     tires that could not be forecast, grouped by reason
     covered     how much of the fleet the forecast actually speaks for */
export function forecastFleet(rows = [], paces = {}) {
  const past = [], due = [], check = [];
  const unknown = { unsettled: [], "no-rate": [], "no-pace": [], parked: [] };

  rows.forEach(({ tire, stats }) => {
    const f = forecastTire(stats, paces[tire.veh] || {});
    const item = { tire, stats, f, size: sizeOf(tire) };
    if (f.state === "past") past.push(item);
    else if (f.state === "forecast") due.push({ ...item, horizon: horizonOf(f) });
    else if (f.state === "suspect") check.push(item);
    else if (unknown[f.state]) unknown[f.state].push(item);
  });

  due.sort((a, b) => a.f.monthsLeft - b.f.monthsLeft);
  past.sort((a, b) => b.f.over - a.f.over);

  /* Running totals INCLUDE what is already past the limit: a tire due
     now is still a tire to buy by the end of the month. */
  let running = past.length;
  const bands = HORIZONS.map((h, i) => {
    const lo = i === 0 ? 0 : HORIZONS[i - 1];
    const inBand = due.filter((d) => d.f.monthsLeft > lo && d.f.monthsLeft <= h);
    running += inBand.length;
    return { months: h, tires: inBand, count: inBand.length, byThen: running };
  });
  const later = due.filter((d) => d.horizon === "later");

  const sizes = new Map();
  const bump = (size, key) => {
    if (!sizes.has(size)) {
      sizes.set(size, { size, past: 0, ...Object.fromEntries(HORIZONS.map((h) => [h, 0])) });
    }
    sizes.get(size)[key] += 1;
  };
  past.forEach((p) => bump(p.size, "past"));
  due.forEach((d) => { if (d.horizon !== "later") bump(d.size, d.horizon); });
  const bySize = [...sizes.values()].map((s) => {
    let run = s.past;
    const byThen = {};
    HORIZONS.forEach((h) => { run += s[h]; byThen[h] = run; });
    return { size: s.size, past: s.past, inBand: Object.fromEntries(HORIZONS.map((h) => [h, s[h]])), byThen };
  }).sort((a, b) => b.byThen[HORIZONS[HORIZONS.length - 1]] - a.byThen[HORIZONS[HORIZONS.length - 1]]);

  const unknownCount = Object.values(unknown).reduce((a, l) => a + l.length, 0);
  return {
    past, due, bands, later, bySize, unknown, check,
    covered: { total: rows.length, forecast: past.length + due.length,
               unknown: unknownCount, check: check.length },
  };
}

/* ── Saying it ────────────────────────────────────────────────── */

export const UNKNOWN_LABEL = {
  unsettled: "Wear measured over too few miles",
  "no-rate": "Gauged once — needs a second reading",
  "no-pace": "No recent mileage on the truck",
  parked: "Truck not moving",
};

export const CHECK_LABEL = "Check before ordering";

/* The line under the totals. More than half this fleet cannot be
   forecast yet, and a number with no word about what it leaves out
   reads as the whole answer. */
export function sayCoverage(c = {}) {
  const { total = 0, forecast = 0, unknown = 0, check = 0 } = c;
  if (!total) return "No tires on trucks.";
  const pct = Math.round((forecast / total) * 100);
  const left = unknown + check;
  if (!left) return `Covers all ${total} tires on trucks.`;
  return `Covers ${forecast} of ${total} tires on trucks (${pct}%). The other ${left} `
    + `cannot be forecast yet, so these totals are a floor, not the whole bill.`;
}

export function sayMonths(m) {
  const n = num(m);
  if (n == null) return "—";
  if (n <= 0) return "now";
  if (n < 1) return `${Math.max(1, Math.round(n * DAYS_PER_MONTH / 7))} wk`;
  return `${n.toFixed(1)} mo`;
}

/* A date for the list, from today plus the months left. */
export function dueDate(monthsLeft, today = new Date()) {
  const n = num(monthsLeft);
  if (n == null) return null;
  const d = new Date(today.getTime() + n * DAYS_PER_MONTH * dayMs);
  return d.toISOString().slice(0, 10);
}
