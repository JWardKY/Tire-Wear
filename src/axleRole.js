/* ── Which axle a wheel is on ─────────────────────────────────────
   The position on a tire is "2R" or "4LO" — an axle number and a side.
   What that axle DOES comes from the truck's configuration, and the
   same truck number can be a 12-tire dump or a 14-tire quad, so the
   answer is per truck rather than per position.

   This was worked out inline inside one chart. It is out here because
   a second chart now needs it to mean the same thing: the brand
   comparison leaves the pusher axle out, and the wheel-position chart
   keeps it. Two copies of "is this a pusher" that could disagree is
   exactly the bug that would make one chart quietly contradict the
   other.

   Why the brand chart leaves pushers out: a pusher lifts. It carries
   load only when the truck is loaded, so it covers the same miles on
   far less work and its miles-per-32nd runs high for reasons that have
   nothing to do with the tire on it. Averaging that in flatters
   whichever brand happens to be sitting on pushers. The wheel-position
   chart is the one place it belongs, because there the whole point is
   to show that pushers wear differently.

   Nothing here touches the database. */

/* The role the truck's configuration gives this position: Steer,
   Pusher, Drive, Trailer, Front, Rear — or nothing when the position
   names an axle the configuration does not have, which happens on a
   truck whose config was changed after its tires went on. */
export function roleOf(pos, axles) {
  const n = String(pos || "").match(/^(\d+)/);
  if (!n || !Array.isArray(axles)) return "";
  const axle = axles.find((a) => String(a.n) === n[1]);
  return axle?.role || "";
}

/* Inner or outer, for a dual. A single wheel gets nothing rather than
   a label it would have to explain. */
export const slotOf = (pos) =>
  /O$/.test(String(pos || "")) ? " outer"
  : /I$/.test(String(pos || "")) ? " inner" : "";

/* What the wheel-position chart calls this tire. */
export function roleLabel(pos, axles) {
  return (roleOf(pos, axles) || "Unknown") + slotOf(pos);
}

/* An unknown axle is NOT treated as a pusher. A tire whose position
   does not match the truck's configuration is a data problem, and
   dropping it from the brand comparison on a guess would hide it. */
export const isPusher = (pos, axles) => roleOf(pos, axles) === "Pusher";
