/* ── What a day was spent on, in one cell ─────────────────────────
   The card board said "6 lines" and stopped there, so finding out
   whether that was six trucks or six goes at the same one meant
   opening the card. A supervisor approving thirteen of them does not
   open thirteen cards.

   A day can carry a dozen units, and a column that grows to fit the
   worst day makes every other row unreadable. So the first few are
   shown and the rest are counted, with the whole list on hover for
   the one time somebody needs it.

   Nothing here touches the database. */

/* The first `max` of a list, plus how many were left. `full` is every
   one of them, for the title attribute — the count is only useful if
   the names behind it can be got at. */
export function summarise(items, max = 3) {
  const all = (items || [])
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);
  const shown = all.slice(0, Math.max(0, max));
  return {
    shown,
    more: Math.max(0, all.length - shown.length),
    full: all.join(", "),
    empty: all.length === 0,
  };
}

/* The same thing as a sentence, for a CSV cell or a tooltip where
   there is no room for two elements. */
export function sayList(items, max = 3) {
  const s = summarise(items, max);
  if (s.empty) return "";
  return s.more ? `${s.shown.join(", ")} +${s.more} more` : s.shown.join(", ");
}
