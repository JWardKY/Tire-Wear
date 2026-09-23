/* ── How many times a casing has been capped ──────────────────────
   A retread is not one thing. A first cap on a good casing and a
   third cap on a tired one wear differently and cost differently, and
   the app could not tell them apart: every retread on the fleet
   looked identical to every other, including on the Analysis page
   where retread is compared against virgin.

   So the mount form asks, and will not save a retread without an
   answer.

   It does NOT ask on the edit form. 138 retreads are on trucks right
   now with nothing recorded, and demanding a number there would mean
   somebody fixing a misspelt brand on a 2019 casing has to invent one
   first. Blank on those means nobody was ever asked — which is the
   truth, and better than a guess that reads like a fact.

   Nothing here touches the database. */

/* What the form offers. A casing's working life is three or four
   caps; the column allows up to ten so a real fifth one is not
   refused, because a form that rejects the truth teaches people to
   type a lie. */
export const CAPS = [1, 2, 3, 4];

export const isRetread = (type) => type === "retread";

/* 1st, 2nd, 3rd, 4th … and 11th through 13th, which are the ones a
   naive rule gets wrong. */
export function capLabel(n) {
  const i = Number(n);
  if (!Number.isInteger(i) || i < 1) return "";
  const tens = i % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th"
    : i % 10 === 1 ? "st"
    : i % 10 === 2 ? "nd"
    : i % 10 === 3 ? "rd" : "th";
  return `${i}${suffix}`;
}

/* "Virgin" · "Retread" · "Retread · 2nd cap". The bare "Retread" is
   for the ones nobody was asked about, and must stay distinguishable
   from a first cap — they are not the same claim. */
export function sayType(type, count) {
  if (!isRetread(type)) return "Virgin";
  const cap = capLabel(count);
  return cap ? `Retread · ${cap} cap` : "Retread";
}

/* The diagram card has room for about four words. */
export function sayTypeTight(type, count) {
  if (!isRetread(type)) return "";
  const cap = capLabel(count);
  return cap ? `retread ${cap}` : "retread";
}

/* What stops a mount saving. Returns a sentence, or nothing when the
   tire is fine to record. */
export function capNeeded(type, count) {
  if (!isRetread(type)) return "";
  return capLabel(count) ? "" : "Say how many times this casing has been capped.";
}

/* A virgin tire may not carry a count — the database refuses it, and
   the form should never send one. Used when a type is switched back
   after a count was already picked. */
export const capFor = (type, count) => (isRetread(type) && capLabel(count)
  ? Number(count) : null);
