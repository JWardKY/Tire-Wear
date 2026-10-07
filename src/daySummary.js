/* ── A shop day, written up ───────────────────────────────────────
   The timecards already hold everything: who worked, which truck, how
   long, what they found and what they did about it. What they do not
   hold is the shape of the day — that eleven of the twenty-three hours
   went on one rear differential, that the truck is still down waiting
   on a yoke nut, that a transmission looks finished but nothing says
   it was road-tested.

   This module turns the rows into the material the write-up is made
   from, and nothing else. It does no writing and makes no judgements:
   it decides what is worth including, groups it the way somebody
   reading would group it, and hands over a block of plain facts.

   Three rules, all of them about not lying:

     1. Every figure here comes from a row. Hours are summed, never
        estimated; a note is quoted, never paraphrased.
     2. An entry with no note contributes no narrative. Half this
        shop's lines carry a write-up and half carry nothing, and the
        ones carrying nothing must not be filled in from the ones that
        do.
     3. A day holding one twenty-minute job is a day holding one
        twenty-minute job. It gets three lines, not three paragraphs.

   Nothing here touches the database or the API. */

const num = (x) => {
  if (x == null || x === "" || typeof x === "boolean") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const clean = (s) => String(s ?? "").trim();
const round2 = (n) => Math.round(n * 100) / 100;

export const hoursOf = (rows = []) =>
  round2(rows.reduce((a, r) => a + (num(r.hours) || 0), 0));

/* What a line was against: the truck, or the words somebody typed for
   work that was not against one. */
export const unitOf = (e = {}) => clean(e.unit) || clean(e.unitLabel) || "Unassigned";

/* The write-up on a line. work_performed is the equipment card's own
   field; note is what the simpler Add-hours form writes. Either can be
   the only one filled in, and an entry with neither says nothing —
   which is a fact about the entry, not a gap to paper over. */
export const toldOf = (e = {}) => clean(e.workPerformed) || clean(e.note) || "";

/* ── Is there anything to write about ─────────────────────────────
   An empty day and a day nobody has entered yet are different things
   and must read differently: one is a Sunday, the other is a card
   somebody still owes. The caller can tell them apart because it knows
   whether anyone was clocked in. */
export function whyNothingToWrite(rows = [], { clocked = 0 } = {}) {
  if (!rows.length) {
    return num(clocked) > 0
      ? "Nobody has booked any hours against this day yet, though the clock ran. "
        + "There is nothing to write up until the cards go in."
      : "Nothing was booked on this day.";
  }
  return "";
}

/* ── Grouping ─────────────────────────────────────────────────────
   Two cuts, because a supervisor reads a day two ways: down the
   roster — what did each of my people do — and across the fleet —
   what did we spend the day on. */

export function byMechanic(rows = []) {
  const m = new Map();
  rows.forEach((e) => {
    const who = clean(e.mechanic) || "Unnamed";
    if (!m.has(who)) m.set(who, { mechanic: who, hours: 0, lines: [] });
    const g = m.get(who);
    g.hours = round2(g.hours + (num(e.hours) || 0));
    g.lines.push(e);
  });
  return [...m.values()]
    .map((g) => ({ ...g, lines: g.lines.sort((a, b) => (num(b.hours) || 0) - (num(a.hours) || 0)) }))
    .sort((a, b) => b.hours - a.hours);
}

export function byUnit(rows = []) {
  const m = new Map();
  rows.forEach((e) => {
    const unit = unitOf(e);
    if (!m.has(unit)) m.set(unit, { unit, hours: 0, lines: [], who: new Set(), codes: new Set() });
    const g = m.get(unit);
    g.hours = round2(g.hours + (num(e.hours) || 0));
    g.lines.push(e);
    if (clean(e.mechanic)) g.who.add(clean(e.mechanic));
    if (clean(e.costCode)) g.codes.add(clean(e.costCode));
  });
  return [...m.values()]
    .map((g) => ({ ...g, who: [...g.who], codes: [...g.codes] }))
    .sort((a, b) => b.hours - a.hours);
}

/* What the day mostly went on. Not every unit — the ones that carried
   enough of the day to be the story of it. A single-job day has one
   and that is correct; a day spread thin across fourteen trucks has
   none, and saying so is better than naming an arbitrary three. */
export const BIG_SHARE = 0.15;

export function bigJobs(rows = [], share = BIG_SHARE) {
  const total = hoursOf(rows);
  if (!total) return [];
  return byUnit(rows).filter((g) => g.hours / total >= share && g.lines.length > 0);
}

/* ── The facts, as the write-up receives them ─────────────────────
   Deliberately plain text rather than JSON. The figures are already
   computed, so there is no arithmetic left to get wrong, and each line
   carries its own hours so nothing has to be held in the head. Notes
   are quoted exactly: a paraphrase here would be a paraphrase of a
   paraphrase by the time it reached the page. */
export function factsFor(date, rows = [], { clocked = null, mechanics = null } = {}) {
  const total = hoursOf(rows);
  const people = byMechanic(rows);
  const out = [];

  out.push(`DATE: ${date}`);
  out.push(`TOTAL BOOKED: ${total.toFixed(2)} hr across ${rows.length} `
    + `entr${rows.length === 1 ? "y" : "ies"} by ${people.length} `
    + `mechanic${people.length === 1 ? "" : "s"}`);
  if (num(clocked) != null) out.push(`TOTAL CLOCKED: ${num(clocked).toFixed(2)} hr`);
  if (num(mechanics) != null) out.push(`MECHANICS ON THE CLOCK: ${mechanics}`);

  out.push("");
  out.push("EVERY ENTRY, BY MECHANIC:");
  people.forEach((g) => {
    out.push(`  ${g.mechanic} — ${g.hours.toFixed(2)} hr`);
    g.lines.forEach((e) => {
      const told = toldOf(e);
      const code = clean(e.costCode)
        ? `${clean(e.costCode)}${clean(e.costCodeName) ? ` ${clean(e.costCodeName)}` : ""}`
        : "no cost code";
      const kinds = (e.workTypes || []).filter(Boolean).join(", ");
      out.push(`    - ${unitOf(e)} · ${(num(e.hours) || 0).toFixed(2)} hr · ${code}`
        + (kinds ? ` · ${kinds}` : "")
        + (clean(e.workOrder) ? ` · work order ${clean(e.workOrder)}` : ""));
      /* The mechanic's own words, marked as such and never altered. */
      out.push(told ? `      wrote: "${told}"` : `      wrote: (nothing)`);
    });
  });

  const big = bigJobs(rows);
  if (big.length) {
    out.push("");
    out.push("WHERE THE DAY WENT:");
    big.forEach((g) => {
      out.push(`  ${g.unit} — ${g.hours.toFixed(2)} hr `
        + `(${Math.round((g.hours / total) * 100)}% of the day), `
        + `${g.lines.length} entr${g.lines.length === 1 ? "y" : "ies"}, `
        + `${g.who.join(" and ") || "nobody named"}`);
    });
  }
  return out.join("\n");
}

/* ── How long the write-up should be ──────────────────────────────
   "Could be an 8 hour shift or a 20 minute shift." A day with one
   short job must not be padded to look like a full one — padding is
   where a model starts inventing — and a twenty-three-hour day across
   four mechanics must not be squeezed into three lines. */
export function lengthFor(rows = []) {
  const n = rows.length;
  if (n <= 2) return { words: 80, say: "two or three sentences" };
  if (n <= 5) return { words: 200, say: "a short paragraph per mechanic" };
  if (n <= 12) return { words: 450, say: "a line per entry, grouped by mechanic" };
  return { words: 700, say: "a line per entry, grouped by mechanic, kept tight" };
}

/* ── What the write-up is told to do ──────────────────────────────
   The rules here are the ones that keep it honest. Every one of them
   is a thing a summary would otherwise do wrong:

     - inventing a reason a job took as long as it did
     - turning "wrote: (nothing)" into a plausible description
     - rounding 1.89 to "about two hours" and losing the only figure
       anybody can check it against
     - mixing what the cards say with what the summary suspects, which
       is the difference between a report and a rumour */
export function systemPrompt() {
  return [
    "You write up a day in a truck shop for the people who run it.",
    "",
    "You are given every time entry for one day: who, which unit, how long,",
    "what it was charged to, and the mechanic's own write-up where there is",
    "one. Turn it into something a supervisor can read in a minute.",
    "",
    "Rules, in order of importance:",
    "",
    "1. Use only what you are given. Never state a cause, a part, a",
    "   diagnosis or an outcome that is not in an entry. If a line reads",
    "   'wrote: (nothing)', you know the unit, the hours and the cost code",
    "   and nothing else — say only that.",
    "2. Keep every number exactly as given. 1.89 hr is 1.89 hr, not 'about",
    "   two hours'. The figures are what somebody checks you against.",
    "3. Quote or closely follow the mechanic's own words. They know what",
    "   they did; you do not.",
    "4. Anything you infer — a job that looks unfinished, a step nobody",
    "   recorded, two entries that may be the same work — goes under a",
    "   final heading 'Worth checking', phrased as a question or a check,",
    "   never as a statement of fact. If there is nothing worth raising,",
    "   leave the heading out entirely rather than inventing something.",
    "5. Match the day. A day with one short job gets a few sentences. Do",
    "   not pad.",
    "",
    "Structure: a one-line headline with the date, hours, entries and",
    "mechanics; then each mechanic with their hours and what they did;",
    "then, if the day concentrated on one or two units, a short section on",
    "those; then 'Worth checking' if and only if something is.",
    "",
    "Plain text with simple headings. No preamble, no sign-off, no mention",
    "of these instructions.",
  ].join("\n");
}
