/* ── A clock on a job ─────────────────────────────────────────────
   The equipment card has always had one. Driving got the same one
   when the form it started as turned out to ask way too much, and the
   tread walk-around has it now for the same reason: a mechanic with a
   gauge in one hand is not going to go and type hours in afterwards,
   so the screen they are already on has to count them.

   One implementation, because three clocks that drift apart is three
   different answers to "how long did that take".

   Nothing here touches the database. */

export const hms = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/* What the clock reads now: what it has banked, plus the stint it is
   in the middle of. A device whose clock has jumped backwards never
   subtracts from the banked time. */
export const liveSeconds = (d = {}, now = Date.now()) =>
  (Number(d.seconds) || 0)
  + (d.runningAt ? Math.max(0, (now - new Date(d.runningAt).getTime()) / 1000) : 0);

/* Real time. Five minutes is five minutes.

   This used to round up to the nearest quarter hour, which is how
   payroll charges — and it meant a four-second press of Start and Stop
   booked fifteen minutes, and a twenty-minute walk-around booked
   thirty. Jason's answer was to book what the clock actually read, so
   that is what it does.

   Two decimal places because that is all tw_time_entries.hours holds:
   numeric(5,2), and the payroll export writes it with toFixed(2). So
   the finest this can be is a hundredth of an hour, which is 36
   seconds. Five minutes lands at 0.08 rather than 0.0833 — the exact
   seconds are kept on the entry beside it, in unit_seconds, so nothing
   is actually lost.

   Anything under eighteen seconds rounds to nought all by itself, and
   nought hours is a row the database refuses. That is the right
   answer rather than a problem: a clock started and stopped in the
   same breath is a mis-tap, not a job. SHORTEST names where the
   rounding lands on zero so the screens can say so plainly instead of
   failing — it is not a second guard, and test-jobclock holds the two
   to each other so they cannot drift if the precision ever changes. */
export const SHORTEST = 18;

export function realHours(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  return Math.round((s / 3600) * 100) / 100;
}

/* The clock in words, for beside the decimal. "0.08" on a card is not
   a thing anybody recognises; "5 minutes" is. */
export function sayLong(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem
    ? `${h} hour${h === 1 ? "" : "s"} ${rem} minute${rem === 1 ? "" : "s"}`
    : `${h} hour${h === 1 ? "" : "s"}`;
}

/* The cost code nobody is asked for. What this mechanic has already
   charged to today is the best guess by a distance — a day is usually
   spent on one or two jobs — and a shop code is the honest fallback.
   It lands on the saved line where it can be changed. */
export function suggestCode(codes = [], entries = []) {
  const live = entries.filter((e) => e.costCode);
  for (let i = live.length - 1; i >= 0; i -= 1) {
    const c = codes.find((x) => x.code === live[i].costCode);
    if (c) return c.code;
  }
  /* All three spellings on purpose. listCostCodes maps code_group to
     `group`; the database row says code_group; parts of the app say
     codeGroup. Checking only two of the three is how this quietly
     charged a mechanic's first trip of the day to whatever sorted
     first — 873 Service on this fleet — instead of to a shop. */
  const groupOf = (c) => String(c.group || c.codeGroup || c.code_group || "").toLowerCase();
  const shop = codes.find((c) => groupOf(c) === "shop");
  return (shop || codes[0] || {}).code || "";
}

/* ── What tire work charges to ────────────────────────────────────
   Tread walk-arounds are not shop time. Every piece of tire work this
   shop has ever booked by hand — tread depths, tread checks, airing a
   tire up, changing a set of drives — went to the tire code, and the
   clock on the walk-around has to go to the same place or the fleet
   cannot add up what tires cost it.

   So this is NOT suggestCode: the code is not a guess from what the
   mechanic happened to charge earlier in the day, it is what the job
   IS. It still lands on the card where it can be changed, for the
   walk-around that was really part of a bigger job.

   Looked up by number first, then by name, so the chart of accounts
   can be renumbered or renamed without this silently falling back to
   a shop code. Returns "" when the fleet has no tire code at all, and
   the caller falls back rather than refusing to book the hours. */
export const TIRE_CODE = "878";

export function tireCode(codes = []) {
  const hit = codes.find((c) => c.code === TIRE_CODE)
    || codes.find((c) => /\btires?\b/i.test(String(c.name || "")));
  return hit ? hit.code : "";
}

/* Starting and stopping, as one function so the three screens cannot
   disagree about what a stint is. */
export function toggle(d = {}, at = Date.now()) {
  const when = new Date(at).toISOString();
  if (!d.runningAt) return { ...d, runningAt: when };
  return {
    ...d,
    runningAt: null,
    seconds: liveSeconds(d, at),
    stints: [...(d.stints || []), { start: d.runningAt, stop: when }],
  };
}

export const EMPTY = { seconds: 0, stints: [], runningAt: null };

/* ── The tread walk-around, as a line on a timecard ───────────────
   Gauging twelve wheels is work, and it was the one job in this app
   that left no trace on anybody's hours. It is booked against the
   truck it was done on, as Tires work, so the fleet can finally say
   what tire work costs it. */
export const TIRES = "Tires";

export function treadEntry(d = {}, date) {
  const secs = liveSeconds(d, d.stoppedAt ?? Date.now());
  const n = Number(d.tires) || 0;
  return {
    date: d.date || date,
    vehId: d.vehId || "",
    unitLabel: "",
    where: "shop",
    hours: realHours(secs),
    costCode: d.costCode,
    workTypes: [TIRES],
    /* So a supervisor reading the hours board can see what the time
       was actually spent on rather than just a number against a
       truck. */
    workPerformed: n
      ? `Tread readings — ${n} tire${n === 1 ? "" : "s"} gauged`
      : "Tread readings",
    unitSeconds: Math.round(secs),
    stints: d.stints || [],
  };
}
