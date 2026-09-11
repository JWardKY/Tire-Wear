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
