/* ── How many came off the shelf ──────────────────────────────────
   The quantity box would not let go of the number in it. It was
   written as value={qty} with onChange forcing the result back to at
   least 1, so clearing the box gave "" → 0 → 1 before the screen even
   repainted. The 1 was still there the instant the backspace landed.

   The shop's workaround was to type the new figure IN FRONT of the old
   one and then delete the old — "31" for three batteries, then pick
   the 1 out with the caret. On a phone, with a glove on.

   So a box being typed in holds text, including no text at all, and
   only becomes a number when the mechanic leaves it. That is the whole
   fix: nothing may rewrite the box while somebody is still typing in
   it.

   Nothing here touches the database. */

/* What to keep while they are typing. Empty is a real state — it is
   what a box looks like one keystroke into changing 1 to 3 — and
   refusing it is the bug. */
export function typeQty(raw) {
  const s = String(raw == null ? "" : raw);
  /* Digits and one point. A minus sign is not a quantity, and letters
     come from a stray keypress rather than an intention. */
  let out = "";
  let dot = false;
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if ((ch === "." || ch === ",") && !dot && out.length) { out += "."; dot = true; }
  }
  /* Two decimals, because that is what the line is rounded to when it
     is stored. Typing a third is a keystroke that would be thrown away
     later anyway, and throwing it away now is the honest moment. */
  const [whole, frac] = out.split(".");
  return frac === undefined ? whole : `${whole}.${frac.slice(0, 2)}`;
}

/* The number when they leave the box. An empty box means they cleared
   it and walked away, which is one — a part on the list that came off
   the shelf no times is not a thing. */
export function settleQty(raw, fallback = 1) {
  const n = Number(typeQty(raw));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 100) / 100;
}

/* Adding a part that is already on the list. Both sides go through
   settleQty first: while the box is being typed in, qty is a string,
   and "3" + 1 is "31" — which is the exact figure the shop was typing
   by hand to get around the bug it would have recreated. */
export function addQty(a, b) {
  return Math.round((settleQty(a) + settleQty(b)) * 100) / 100;
}

/* What identifies a line on the parts list.

   It used to be partId, and a part nobody has put in the catalog has
   no id — so two typed parts were both null, and changing the quantity
   on one changed both, removing one removed both, and React saw two
   children with the same key. The part number is what the list is
   actually unique on; `put` has always deduplicated by it. */
export const lineKey = (p) => String(p?.num == null ? "" : p.num).trim().toLowerCase();

export const sameLine = (a, b) => lineKey(a) === lineKey(b);
