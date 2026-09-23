/* ── Finding a unit by typing it ──────────────────────────────────
   The equipment box on a timecard was a dropdown of the whole fleet.
   On a phone that is a spinning wheel of 130-odd trucks with no way to
   jump; on a tablet it is a list you scroll past the one you wanted.
   Somebody standing at the truck knows the number on the door — they
   should be able to type it.

   The number matching is findUnits, the same rule the Truck File
   search already uses, rather than a second one written here. Two
   search boxes in one app that disagree about what "881" means is
   worse than either of them.

   What this adds is the rest of the list. The equipment box is not
   only trucks: shop and indirect time live in it too, and those are
   words rather than numbers. So a search has to cover both, and the
   shape of what was typed says which is being looked for.

   Nothing here touches the database. */

import { findUnits, squash } from "./truckRollup.js";

/* The value the old select put in its options, kept exactly: a vehicle
   is its id, shop time is "shop:" and the name. Changing this would
   mean touching every draft already saved. */
export const shopValue = (name) => `shop:${name}`;
export const isShopValue = (v) => String(v || "").startsWith("shop:");
export const shopNameOf = (v) => (isShopValue(v) ? String(v).slice(5) : "");

const hasLetters = (s) => /[A-Z]/.test(squash(s));
const hasDigits = (s) => /[0-9]/.test(squash(s));

/* What to offer for what has been typed.

   Nothing typed is not an empty answer: the shop and indirect choices
   are picked constantly and cannot be typed as a number, so they are
   what the list opens on. Trucks wait to be asked for, because 130 of
   them is not a list, it is a scroll. */
export function searchPicks(typed, { vehicles = [], shopWork = [] } = {}) {
  const q = String(typed || "").trim();
  if (!q) return { units: [], shop: shopWork, empty: true };

  const byNumber = findUnits(vehicles, q);

  /* Make and model, but only when the number found nothing and there
     is a word in there to match. "kenworth" is a reasonable thing to
     type when the door is muddy; running it on every search would bury
     DT-881 under sixty of its cousins.

     One guard, not two. An earlier version also skipped the work when
     the number search had answered, which is what the line below
     already decides — a second test agreeing with the first reads as
     care and is not. */
  const units = byNumber.length || !hasLetters(q) ? byNumber : vehicles
    .filter((v) => `${v.make || ""} ${v.model || ""}`.toUpperCase().includes(q.toUpperCase()))
    .sort((a, b) => String(a.num).length - String(b.num).length
                 || String(a.num).localeCompare(String(b.num)))
    .slice(0, 12);

  /* Shop time is words, so a number is never looking for it. */
  const shop = hasDigits(q) && !hasLetters(q) ? [] : shopWork
    .filter((w) => w.toUpperCase().includes(q.toUpperCase()));

  return { units, shop, empty: false };
}

/* How many things the list is offering, so a screen can say "nothing
   matches" without counting two arrays itself. */
export const pickCount = (r) => (r?.units?.length || 0) + (r?.shop?.length || 0);

/* The one the Enter key takes. Units first: somebody who typed a
   number wants the truck, and somebody who typed a word gets the shop
   entry only when no unit answered to it. */
export function topPick(r) {
  /* Nothing typed offers the shop list to LOOK at, not to land on.
     Enter on an empty box must not book somebody's morning to shop
     cleanup because that happened to be first. */
  if (!r || r.empty) return "";
  if (r?.units?.length) return r.units[0].id;
  if (r?.shop?.length) return shopValue(r.shop[0]);
  return "";
}

/* What the box reads when something is already chosen. */
export function labelFor(value, { vehicles = [] } = {}) {
  if (!value) return "";
  if (isShopValue(value)) return shopNameOf(value);
  const v = vehicles.find((x) => x.id === value);
  if (!v) return "";
  const rest = [v.make, v.model].filter(Boolean).join(" ");
  return rest ? `${v.num} — ${rest}` : String(v.num);
}
