/* ── Why a tire came off ──────────────────────────────────────────
   Six reasons, and the two that were missing were the two worth the
   most.

   A tire that BLEW is not a tire that wore out, and the list had
   nowhere to put it: seventy tires have come off this fleet and
   forty-one of them say "Worn out", which cannot all be true. A
   blowout is a tow, a lost load and sometimes a wrecked fender, and
   none of that is visible if it is filed as ordinary wear.

   And a RETREAD FAILURE is the single most valuable thing this app
   can record. The argument for running caps is money; the argument
   against is a cap coming apart on the road. If that gets written
   down as "Road hazard" the retread programme looks better than it
   is, forever, and nobody can tell from the figures.

   Which is why that one is only offered on a retread. It is not a
   thing that can happen to a virgin casing, and a list that offers it
   anyway is a list that will eventually be used to record one — at
   which point the retread figures carry a failure that never
   happened. The same shape of rule as the cap count: ask the question
   only where it has an answer.

   Nothing here touches the database, and nothing here is written to
   it that the column has not always allowed — removed_reason is free
   text, so no tire already pulled has to be touched. */

/* In the order somebody reaches for them, with the two failures
   together near the top where they will be looked for and the
   everyday ones where they have always been. */
export const REASONS = [
  { label: "Worn out" },
  { label: "Tire blew", failure: true },
  { label: "Retread failure", failure: true, retreadOnly: true },
  { label: "Road hazard", failure: true },
  { label: "Sidewall damage", failure: true },
  { label: "Irregular wear" },
  { label: "Rotated off" },
  { label: "Casing sent to retread" },
];

export const DEFAULT_REASON = REASONS[0].label;

const isRetread = (t) => String(t?.type || t?.tire_type || "").toLowerCase() === "retread";

/* What to offer for this tire. A tire that is not a retread cannot
   have a retread fail on it. */
export function reasonsFor(tire) {
  return REASONS.filter((r) => !r.retreadOnly || isRetread(tire)).map((r) => r.label);
}

const find = (reason) =>
  REASONS.find((r) => r.label.toLowerCase() === String(reason || "").trim().toLowerCase());

/* The tire did not get to the end of its life. Worn out and rotated
   off are a tire finishing its job; these are a tire stopping. */
export const isFailure = (reason) => !!find(reason)?.failure;

/* The one that is an argument about the retread programme rather
   than about a piece of road. */
export const isRetreadFailure = (reason) =>
  !!find(reason)?.retreadOnly && isFailure(reason);

/* Keep a chosen reason honest when the tire under it changes — the
   move dialog picks a reason for whichever tire is being displaced,
   and that can change to a virgin casing between one click and the
   next with "Retread failure" still sitting in the box. */
export function keepReason(reason, tire) {
  return reasonsFor(tire).includes(reason) ? reason : DEFAULT_REASON;
}

/* Said under the box when a tire is coming off early, because the
   note is the only record there will ever be of what happened. */
export function sayReason(reason, tire) {
  if (!isFailure(reason)) return "";
  if (isRetreadFailure(reason)) {
    const caps = Number(tire?.caps);
    return Number.isFinite(caps) && caps > 0
      ? `A ${caps === 1 ? "1st" : caps === 2 ? "2nd" : caps === 3 ? "3rd" : `${caps}th`} cap that came apart. This is the figure the retread programme gets judged on, so it is worth the miles being right.`
      : "A cap that came apart. This is the figure the retread programme gets judged on, so it is worth the miles being right.";
  }
  return "It came off early, so its miles stop here and its cost per mile will read dearer than a tire that wore out. That is the point of recording it.";
}
