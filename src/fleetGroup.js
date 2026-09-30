/* ── Which fleet a comparison is about ────────────────────────────
   The Analysis page answers one question: which tire gets the most
   miles per 32nd. That question only means anything inside a fleet.

   A dump truck grinds 12 tires through quarry entrances at 60,000 lb
   on the drives. A pickup carries a toolbox. Averaged together, the
   pickups drag every brand figure upward by an amount that has nothing
   to do with the tire and everything to do with what it is bolted to —
   and the ranking somebody orders off becomes a ranking of what the
   tire happens to be fitted to.

   That was academic while the app held 135 haul trucks. It stopped
   being academic when 76 light trucks and seven tankers came in from
   Motive, at which point a third of the tires on the page would have
   been pickups.

   So the page is per fleet, always, with no "everything" option — an
   average across all four groups is not a number anybody should be
   shown, and offering it is offering the bug back.

   Nothing here touches the database. */

/* Order is reading order on the page: the haul fleet first because it
   is what the app is for and what the page has always meant. */
export const GROUPS = [
  { key: "haul", label: "Haul", divisions: ["DT", "HT"],
    blurb: "DT and HT — the haul fleet" },
  { key: "light", label: "Light trucks", divisions: ["LT"],
    blurb: "LT — pickups and service trucks" },
  { key: "equipment", label: "Equipment", divisions: ["EQ"],
    blurb: "EQ — trailers and yard plant" },
  { key: "other", label: "Other", divisions: ["OT"],
    blurb: "Rentals, customer trucks and one-offs" },
];

export const DEFAULT_GROUP = "haul";

const BY_DIVISION = new Map();
GROUPS.forEach((g) => g.divisions.forEach((d) => BY_DIVISION.set(d, g.key)));

/* A unit whose division nobody recognised is "other" rather than
   quietly haul. Landing an unknown in with the dump trucks is exactly
   the mixing this exists to stop. */
export function groupOf(division) {
  return BY_DIVISION.get(String(division || "").toUpperCase()) || "other";
}

export const groupLabel = (key) =>
  (GROUPS.find((g) => g.key === key) || {}).label || "";

export const groupBlurb = (key) =>
  (GROUPS.find((g) => g.key === key) || {}).blurb || "";

/* The groups with something in them, in page order, each with its
   count. A tab that opens on an empty chart is a tab nobody should be
   offered. */
export function groupsPresent(divisions = []) {
  const n = new Map();
  divisions.forEach((d) => {
    const k = groupOf(d);
    n.set(k, (n.get(k) || 0) + 1);
  });
  return GROUPS
    .filter((g) => n.get(g.key))
    .map((g) => ({ ...g, n: n.get(g.key) }));
}

/* Which group to open on: the default when it has anything, otherwise
   the first that does, so the page never opens on nothing. */
export function firstGroup(divisions = []) {
  const present = groupsPresent(divisions);
  if (!present.length) return DEFAULT_GROUP;
  return present.some((g) => g.key === DEFAULT_GROUP) ? DEFAULT_GROUP : present[0].key;
}
