/* ── Moving a tire to another wheel ───────────────────────────────
   A rotation is not a correction. The tire really was on 4RO, the
   readings taken there really were taken there, and now it is going on
   4LO — usually trading places with whatever is already on 4LO, because
   that is what rotating a truck means.

   The edit form could already change a position, but only onto a free
   wheel, and it is there for a position somebody keyed wrong. Using it
   for a rotation would say the tire had always been on the new wheel,
   and it could not do a swap at all: there is no free wheel in the
   middle of one.

   So this is its own act, with its own date. The tire keeps its id, its
   mount figures and every reading — same casing, different wheel — so
   the wear rate carries on from where it was rather than starting again.

   Nothing here touches the database. */

/* Every other wheel on the truck, each with whatever is on it now.
   Occupied wheels are offered as well as empty ones: a swap is the
   common case, not the exception. */
export function destinations(positions, activeTireAt, veh, fromPos) {
  return (positions || [])
    .filter((p) => p.id !== fromPos)
    .map((p) => ({
      id: p.id,
      role: p.role,
      slot: p.slot,
      taken: (activeTireAt || {})[`${veh}|${p.id}`] || null,
    }));
}

/* A steer wheel is judged against a different pull depth from the rest,
   so a tire crossing between them changes status without changing a
   thirty-second. Worth saying before somebody wonders why. */
export const isSteer = (pos) => /^1[LR]$/.test(String(pos || ""));

/* What happens to the tire already on the wheel being moved to.
   REPLACE is the default because it is what the shop actually does:
   a tire is moved onto a wheel whose tire is being scrapped. Swapping
   is the rarer case, and swapping by default would quietly put a
   worn-out tire back on the truck. */
export const REPLACE = "replace";
export const SWAP = "swap";

/* What the screen can refuse before the database does. Returns a
   sentence, or nothing when the move is fine. */
export function checkMove(from, to, { other, mode, offDate } = {}) {
  if (!to) return "Pick the wheel it is going to.";
  if (to === from) return `It is already on ${from}.`;
  /* Without a date the pulled tire keeps removed_date null, stays in
     the one-tire-per-wheel index, and the move behind it collides. */
  if (other && mode === REPLACE && !offDate) {
    return "Say what date the tire coming off came off.";
  }
  return "";
}


/* What is about to happen, in a sentence, before it happens. The two
   treads are in it because that is what somebody is deciding on when
   they rotate: which way round the deep one should go. */
export function sayMove({ from, to, moving, other, stats, mode = REPLACE }) {
  if (!to) return "";
  /* A tread only if there is one: a bare wheel has no tire, and a tire
     nobody has gauged has no depth. `at` is the only place that
     decides, so there is one rule rather than two that can disagree. */
  const at = (t) => {
    const d = stats?.[t?.id]?.depth;
    return d == null ? "" : ` (${d}/32)`;
  };
  if (!other) return `${from}${at(moving)} moves to ${to}, which is empty.`;
  if (mode === SWAP) return `${from}${at(moving)} and ${to}${at(other)} trade places.`;
  /* Said as two sentences on purpose. A tire leaving the truck for
     good is not a detail of somebody else's move. */
  const it = at(other) ? `The${at(other).replace(/^ \(|\)$/g, " ")}on ${to}` : `The tire on ${to}`;
  return `${from}${at(moving)} moves to ${to}. ${it.trim()} comes off the truck.`;
}

/* The note about crossing between a steer wheel and the rest. */
export function sayThreshold(from, to, settings) {
  if (!from || !to || isSteer(from) === isSteer(to)) return "";
  const s = settings?.pullSteer, o = settings?.pullOther;
  if (s == null || o == null || s === o) return "";
  return isSteer(to)
    ? `A steer tire is pulled at ${s}/32 rather than ${o}/32, so its status may change on the move.`
    : `Off the steer axle it is pulled at ${o}/32 rather than ${s}/32, so its status may change on the move.`;
}

/* The line that goes in the work log. Written, not derived: once the
   position column is overwritten nothing else knows where the tire
   used to be.

   The date is in the sentence rather than left to the row's timestamp,
   because that timestamp is when somebody typed it. A rotation done on
   Friday and entered on Monday is a Friday rotation. */
export function sayLog({ veh, from, to, other, when, odo, mode = REPLACE, reason }) {
  const swapped = other && mode === SWAP;
  const where = swapped
    ? `${from} and ${to} traded places`
    : `tire moved ${from} → ${to}`;
  const miles = Number(odo);
  const at = Number.isFinite(miles) && miles > 0
    ? ` at ${miles.toLocaleString()} mi` : "";
  /* The pull itself shows in the history on its own — it is derivable
     from removed_date. It is named here so the line explains why a
     tire left the truck on the same day another one landed on it. */
  const off = other && !swapped
    ? `, and the tire on ${to} came off${reason ? ` (${reason})` : ""}`
    : "";
  return `${veh || "A truck"} — ${where}${on(when)}${at}${off}`;
}

const on = (date) => {
  if (!date) return "";
  const [y, m, d] = String(date).slice(0, 10).split("-");
  return y && m && d ? ` on ${m}/${d}/${String(y).slice(2)}` : "";
};
