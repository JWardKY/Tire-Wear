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

/* Quarter hours, because that is the unit payroll charges in — and a
   job that happened is never nought: ten minutes rounds to a quarter
   rather than to nothing, which the database would refuse anyway. */
export function quarters(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s === 0) return 0;
  return Math.max(0.25, Math.round((s / 3600) * 4) / 4);
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
    hours: quarters(secs),
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
