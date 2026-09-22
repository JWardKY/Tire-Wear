/* ── Saying what the database said, in words ──────────────────────
   Postgres errors are precise and useless to a mechanic. "numeric field
   overflow" is what the PM screen showed somebody who typed an hour
   meter reading into a box that holds how long the job took: accurate,
   and no help at all in deciding what to do about it.

   This turns the handful we can actually produce into a sentence that
   names the field and says what to do. Anything not on the list comes
   through as it was — a wrong translation is worse than a raw one,
   because it sends somebody looking in the wrong place. */

const BY_CODE = {
  /* 22003 — a number too big for its column. Which column is not in the
     error, so the caller says; without that we can only say what kind
     of thing went wrong. */
  22003: (f) => f
    ? `${f.label} is too big — ${f.limit}.`
    : "One of those numbers is too big for the field it went in.",
  /* 23505 unique, 23503 foreign key, 23514 check. */
  23505: () => "That is already recorded — it looks like a duplicate.",
  23503: () => "That points at something which is not there any more. Reload and try again.",
  23514: () => "The database refused that as an impossible value. Check the numbers.",
  /* 22001 — text longer than the column. */
  22001: () => "That text is longer than the box allows.",
  /* 42501 / RLS. */
  42501: () => "You do not have permission to save that.",
};

/* `fields` maps a column name to how to describe it, for the errors
   that do not name one themselves. */
export function saySo(err, fields) {
  if (!err) return "";
  const code = String(err.code || "");
  const named = fields && Object.entries(fields)
    .find(([col]) => String(err.message || "").includes(col));
  const say = BY_CODE[code];
  if (say) return say(named ? named[1] : null);
  return err.message || String(err);
}

/* The check a screen does before it ever reaches the database, so the
   common mistake is caught where the person is still looking at the
   box. Returns a sentence, or nothing when the value is fine. */
export function tooBig(value, { label, max, decimals = 2 }) {
  if (value === "" || value == null) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label} has to be a number.`;
  if (n < 0) return `${label} cannot be negative.`;
  if (n > max) {
    return `${label} cannot be more than ${max.toLocaleString(undefined, {
      maximumFractionDigits: decimals })}.`;
  }
  return "";
}

/* ── When nothing reached the server ──────────────────────────────
   Alex mounted two tires on DT-874 at twenty to one on a Tuesday
   morning, pressed save on the third, and got

       That did not save — TypeError: Load failed

   "Load failed" is Safari's wording for a fetch that never completed;
   Chrome says "Failed to fetch", Firefox says something longer. The
   server log for that minute holds no request at all — the iPad lost
   its signal mid-save. He pressed save again three minutes later and
   it went through.

   So both halves of that banner were wrong. It named a Javascript
   type at a mechanic, and it blamed the save for a message that never
   left the building.

   What it matches is the phrases browsers actually produce, not the
   error being a TypeError — same rule as saySo above: a wrong
   translation sends somebody looking in the wrong place. Anything
   carrying a Postgres code came back from the server by definition,
   so it is never one of these however it reads. */

const NO_ANSWER = [
  "load failed",                            // Safari, WebKit
  "failed to fetch",                        // Chrome, Edge
  "networkerror when attempting",           // Firefox
  "network request failed",
  "fetch failed",                           // Node, undici
  "the network connection was lost",        // iOS
  "the internet connection appears to be offline",
  "the request timed out",
  "aborterror",                             // a tab suspended mid-request
  "fetch is aborted",
  "err_network",
  "err_internet_disconnected",
  "err_connection",
];

/* True when the request got no answer — as opposed to an answer that
   said no, which is every other error in this file. */
export function neverReached(err) {
  if (!err) return false;
  /* A Postgres SQLSTATE is five characters and only the server has
     one. Its presence settles it. */
  if (String(err.code || "").length === 5) return false;
  const said = `${err.name || ""} ${err.message || err}`.toLowerCase();
  return NO_ANSWER.some((p) => said.includes(p));
}

/* The sentence to show instead, or "" when the server did answer and
   the screen should keep its own words:

     setErr(sayOffline(e) || `That did not save — ${e.message || e}`);

   The save wording does not promise the write was lost. Usually it
   was — Alex's never arrived — but a reply can also go missing after
   the row is in, and telling somebody "nothing was recorded" when
   something was is how you get two tires on one wheel. */
export function sayOffline(err, doing = "save") {
  if (!neverReached(err)) return "";
  return doing === "load"
    ? "Could not reach the server — check your signal and try again."
    : "That did not reach the server — check your signal and try again. "
      + "Reload the page first to see whether it went through.";
}
