/* ── A work order as a page ───────────────────────────────────────
   The board shows a work order as a row, and a row answers "is this
   done yet". Somebody walking to a truck wants the other questions:
   what is wrong with it, what has already been tried, who has been on
   it, what came off the shelf, and how long it has been sitting.

   So the same order gets a page, and the page prints. A shop runs on
   paper more than anybody building software expects — the packet goes
   on the dash, gets written on in pencil, and comes back.

   Two things this settles that the row never had to.

   Hours are grouped by the day the work happened, not the day somebody
   keyed them in. Donald books his whole week on Friday at five; ordered
   by entry those six lines are one blur, and ordered by work date they
   are the week the truck actually had.

   And the status is a sentence with a number of days in it. "Open" on
   a job raised in March is technically true and practically a lie.

   Nothing here touches the database. */

const DAY = 86400000;

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/* Whole days between two instants, floored — "2 days" means two days
   have actually passed, not that the clock ticked past midnight twice.
   Null when there is nothing to measure from. */
export function daysSince(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY));
}

export function sayAge(days) {
  if (days == null) return "";
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/* Where the job stands, in a sentence somebody can act on. The day
   count is the point: a row that says "open" on a job raised in March
   is true and useless. */
export function sayStatus(w = {}, now = Date.now()) {
  const state = String(w.state || "").toLowerCase();

  if (state === "done") {
    const d = daysSince(w.completedAt, now);
    return {
      tone: "done",
      line: `Finished${w.completedBy ? ` by ${w.completedBy}` : ""}`
        + (d == null ? "" : d === 0 ? " today" : ` ${sayAge(d)} ago`),
    };
  }

  if (state === "hold" || w.holdReason) {
    const d = daysSince(w.holdSince || w.at, now);
    return {
      tone: "hold",
      line: `On hold${w.holdReason ? ` — ${w.holdReason}` : ""}`
        + (d == null ? "" : ` · ${sayAge(d)}`),
    };
  }

  /* Started is not a state in the table — it is whether an hour has
     ever been booked. A job somebody has spent a day on and a job
     nobody has touched read identically otherwise, and they are the
     two most different rows on the board. */
  const age = daysSince(w.at, now);
  if (w.startedAt || w.worked) {
    const d = daysSince(w.startedAt, now);
    return {
      tone: "working",
      line: "In progress" + (d == null ? "" : ` · started ${sayAge(d)} ago`),
    };
  }
  return {
    tone: age != null && age >= 7 ? "stale" : "open",
    line: "Not started" + (age == null ? "" : ` · raised ${sayAge(age)} ago`),
  };
}

/* Everybody on the job, the assigned name first and no one twice. The
   board keeps a crew table and the order keeps its own assigned_name,
   and they disagree often enough that printing both is how a packet
   ends up naming one person twice. */
export function crewOf(w = {}) {
  const out = [];
  const seen = new Set();
  const add = (name) => {
    const v = String(name || "").trim();
    const k = v.toLowerCase();
    if (v && !seen.has(k)) { seen.add(k); out.push(v); }
  };
  add(w.assignedName);
  (w.crew || []).forEach((c) => add(typeof c === "string" ? c : c?.name));
  return out;
}

/* Hours by the day the work happened. Newest day first, because the
   question a packet is picked up to answer is "where did they get to",
   and that is the last thing anybody did. */
export function byDay(hours = []) {
  const m = new Map();
  hours.forEach((h) => {
    const k = h.date || "";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(h);
  });
  return [...m.entries()]
    .map(([date, rows]) => ({
      date: date || null,
      rows,
      hours: rows.reduce((a, h) => a + n(h.hours), 0),
      /* Who was on it that day, so the line reads "Dylan Barnes,
         Tyler Coffey — 6.5 h" rather than repeating a name per entry. */
      who: [...new Set(rows.map((h) => String(h.who || "").trim()).filter(Boolean))],
    }))
    /* Undated entries last: they are real hours and must not vanish,
       but they cannot be placed on the week. */
    .sort((a, b) => (a.date == null) - (b.date == null) || String(b.date).localeCompare(String(a.date)));
}

/* What was actually done, in the mechanics' own words, oldest first —
   this is the running story of the job and it only reads forwards. */
export function whatWasDone(hours = []) {
  return hours
    .filter((h) => String(h.did || "").trim())
    .map((h) => ({
      date: h.date || null,
      who: String(h.who || "").trim(),
      did: String(h.did).trim(),
      hours: n(h.hours),
    }))
    .sort((a, b) => (a.date == null) - (b.date == null) || String(a.date).localeCompare(String(b.date)));
}

/* The whole packet, assembled. `lines` is what workOrderLines returns.

   Totals are deliberately not one number: labour is hours and parts are
   dollars, and a shop rate that would add them together is not
   something this app knows. Saying so beats inventing one. */
export function packet(w = {}, lines = {}, now = Date.now()) {
  const hours = lines.hours || [];
  const parts = lines.parts || [];
  const days = byDay(hours);

  return {
    status: sayStatus({ ...w, worked: hours.length > 0 }, now),
    crew: crewOf(w),
    days,
    done: whatWasDone(hours),
    parts,
    hoursTotal: hours.reduce((a, h) => a + n(h.hours), 0),
    partsCost: parts.reduce((a, p) => a + (p.cost == null ? 0 : n(p.cost)), 0),
    /* A total with holes in it has to say so, or somebody quotes it. */
    partsWithoutCost: parts.filter((p) => p.cost == null).length,
    /* Nothing booked and nothing issued is its own state, and the page
       should say it plainly rather than printing two empty tables. */
    untouched: hours.length === 0 && parts.length === 0,
  };
}
