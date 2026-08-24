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
