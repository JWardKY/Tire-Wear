/* ── Who is entering data ─────────────────────────────────────────
   The app asks for a name badge, not a password. There is no email
   round-trip and nothing server-side verifies the address — it is
   here so every reading carries who took it, and so a stray link
   shared outside the company meets a wall rather than the fleet.

   Add a domain to ALLOWED_DOMAINS if the company picks up another. */

export const ALLOWED_DOMAINS = ["theallen.com"];

const KEY = "tirewear:who";

export function domainOk(email) {
  const parts = String(email).trim().toLowerCase().split("@");
  return parts.length === 2 && parts[0].length > 0 && ALLOWED_DOMAINS.includes(parts[1]);
}

export function readWho() {
  try {
    const v = localStorage.getItem(KEY);
    return v && domainOk(v) ? v : null;
  } catch {
    return null; // private window, or the browser blocks site data
  }
}

export function saveWho(email) {
  const v = String(email).trim().toLowerCase();
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* remembering is a nicety, not a requirement */
  }
  return v;
}

export function clearWho() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to undo */
  }
}

/* ── Who is actually standing at the tablet ───────────────────────
   The badge above says which browser this is. It does not say who is
   using it: a shop tablet carries one badge and every mechanic in the
   building unlocks their own timecard on it with a PIN.

   That matters beyond the timecard. A defect claimed or repaired on the
   Defects tab used to be recorded against the badge, so on a shared
   tablet the board said the office had the job and a repair went to
   Motive signed with an email address. Whoever is PIN'd in is the
   answer, and it lives here rather than inside the timecard so every
   screen can ask the same question.

   sessionStorage, not local: a tablet left on a bench re-locks when the
   tab closes. Keyed by the badge, because an unlock belongs to the
   browser it happened in. */

const UNLOCK_KEY = "tirewear:timecard-unlocked";

export function readUnlock(badgeEmail) {
  try {
    const v = JSON.parse(sessionStorage.getItem(UNLOCK_KEY) || "null");
    return v && v.email === badgeEmail ? v : null;
  } catch {
    return null;   // private window, or the browser blocks site data
  }
}

export function writeUnlock(v) {
  try { sessionStorage.setItem(UNLOCK_KEY, JSON.stringify(v)); }
  catch { /* remembering is a nicety, not a requirement */ }
}

export function clearUnlock() {
  try { sessionStorage.removeItem(UNLOCK_KEY); } catch { /* nothing to undo */ }
}

/* The name to put on something somebody just did. The mechanic who is
   PIN'd in, or the badge when nobody is — a name reads properly on a
   board, matches the roster, and is what the Motive write-back sends as
   the mechanic. Read at the moment of the act, never cached: the person
   at the tablet changes between renders. */
export const actorFor = (badgeEmail) => readUnlock(badgeEmail)?.name || badgeEmail;
