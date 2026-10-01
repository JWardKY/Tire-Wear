/* ── The tire catalog ─────────────────────────────────────────────
   Brand, model, size and type were free text on every mount, and 640
   tires later the fleet holds "HDC3", "HDC 3", "hdc3", "Hdc3" and
   "Conti HDC 3" for one tire, nine spellings of 425/65R22.5, and
   CR976A entered as a brand on some rows and a model on others. Each
   spelling is its own line on the Analysis page, so the tire somebody
   is trying to compare is split five ways and none of the five has
   enough behind it to mean anything.

   The other half of the same problem: how deep a new one is and what
   it costs were typed from memory at the wheel, or left out. 625 of
   640 tires carry no cost at all, which is why cost per mile has never
   said anything.

   So a tire somebody can buy is a row, with its new depth and its
   price on it, and mounting one copies those down. Two rules make it
   hold:

   The key is the squashed text, not the text. "HDC 3" and "hdc3" are
   one tire and cannot both be added. The database has the same rule as
   a unique index, so the two cannot drift.

   And a row with no depth on it is not finished. A made-up depth would
   set mount readings wrong across the fleet, and this app has already
   paid for that twice — DT-899's impossible readings and DT-890's
   zero-mile casings both started as a number somebody assumed.

   Nothing here touches the database. */

export const TYPES = ["virgin", "retread"];

const squash = (s) => String(s == null ? "" : s).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

/* A tire size is numbers. The R is a radial marker that is there or
   not depending on who typed it — this fleet holds "425/65R22.5",
   "425/65 R22.5", "425/65/22.5" and "425/6522.5" for one tire — and no
   two sizes here differ by anything but their digits: 11R22.5 against
   11R24.5, 295/75 against 295/80. Brand and model keep their letters,
   where the letters are the whole name. */
const digits = (s) => String(s == null ? "" : s).replace(/[^0-9]/g, "");

/* The same key the unique index uses, character for character. If
   these two ever disagree the app offers to add a row the database
   then refuses, which reads as the app being broken. */
export function modelKey(m = {}) {
  return [squash(m.brand), squash(m.model), digits(m.size),
          String(m.type || m.tire_type || "").toLowerCase()].join("|");
}

export const sameModel = (a, b) => modelKey(a) === modelKey(b);

const clean = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ");

/* What the catalog calls a tire, in one line. Type is spelled out
   because "Continental HDC3 11R24.5" is two different tires and the
   difference is the whole of what the Analysis page compares. */
export function labelOf(m = {}) {
  const bits = [clean(m.brand), clean(m.model)].filter(Boolean).join(" ");
  const size = clean(m.size);
  const type = String(m.type || m.tire_type || "").toLowerCase() === "retread"
    ? "Retread" : "Virgin";
  return [bits || "Unbranded", size, type].filter(Boolean).join(" · ");
}

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const depthOf = (m) => num(m?.newDepth ?? m?.new_depth_32nds);
export const costOf = (m) => num(m?.cost);

/* What is still missing before a row can fill a mount form in. Said as
   a list rather than a flag, because "needs a depth" and "needs a
   price" are different jobs and the person doing them is holding a
   different piece of paper for each. */
export function missing(m = {}) {
  const out = [];
  if (depthOf(m) == null) out.push("depth");
  if (costOf(m) == null) out.push("price");
  return out;
}

export const isReady = (m) => missing(m).length === 0;

export function sayMissing(m = {}) {
  const gaps = missing(m);
  if (!gaps.length) return "";
  return `No ${gaps.join(" or ")} on it yet`;
}

/* Why a row cannot be saved, or "". The depth ceiling is deliberately
   generous — a new off-road drive tire can run past 30/32 — but a
   figure above it is a typo rather than a tire. */
export function checkModel(m = {}, others = []) {
  if (!clean(m.brand)) return "Give it a brand.";
  const t = String(m.type || m.tire_type || "").toLowerCase();
  if (!TYPES.includes(t)) return "Say whether it is virgin or a retread.";

  const d = depthOf(m);
  if (d != null && (d <= 0 || d > 40))
    return "A new tire's depth is between 1 and 40 thirty-seconds.";
  const c = costOf(m);
  if (c != null && c < 0) return "A price cannot be a minus figure.";

  /* The same tire spelled differently is the thing this table exists
     to stop, so the clash is named rather than left to the database to
     refuse with a constraint error nobody can read. */
  const clash = others.find((o) => o.id !== m.id && sameModel(o, m));
  if (clash) return `${labelOf(clash)} is already in the catalog.`;
  return "";
}

/* Finding one by typing. Matches across brand, model and size at once,
   because somebody looking for a tire types "hdc3" or "425" and should
   not have to say which box that was. Every word has to land, so
   "conti 425" narrows rather than widening. */
export function findModels(models = [], q = "", type = "") {
  const want = String(q || "").trim().toLowerCase();
  const words = want.split(/\s+/).filter(Boolean);
  return models
    .filter((m) => m.active !== false)
    .filter((m) => !type || String(m.type || m.tire_type).toLowerCase() === type)
    .filter((m) => {
      if (!words.length) return true;
      const hay = `${m.brand || ""} ${m.model || ""} ${m.size || ""}`.toLowerCase();
      const flat = squash(`${m.brand || ""}${m.model || ""}${m.size || ""}`).toLowerCase();
      return words.every((w) => hay.includes(w) || flat.includes(squash(w).toLowerCase()));
    })
    /* Ready rows first — a row somebody still has to fill in is a
       worse answer than one that will fill the form in itself. */
    .sort((a, b) => (isReady(b) - isReady(a))
      || labelOf(a).localeCompare(labelOf(b)));
}

/* What mounting this tire fills in. Only the facts that belong to the
   tire itself: where it goes and how deep it actually measured are per
   wheel and always typed.

   Cost is copied rather than linked on purpose. A price list that
   changes in March must not rewrite what a tire cost in January — the
   catalog holds what one costs today, the tire holds what it cost. */
export function specFrom(m = {}) {
  return {
    modelId: m.id || null,
    brand: clean(m.brand),
    model: clean(m.model),
    size: clean(m.size),
    type: String(m.type || m.tire_type || "virgin").toLowerCase(),
    newDepth: depthOf(m),
    cost: costOf(m),
  };
}

/* ── What to call a tire on a chart ───────────────────────────────
   A bar chart has about sixteen characters of axis. "Continental
   HDC3 · 11R24.5 · Virgin" is forty-two, and chopping it leaves
   "Continental HD…" against "Continental HD…".

   So the name is brand and model, with two things added only where
   they are doing work:

   A retread is marked, because a cap and a virgin casing of the same
   pattern are different money and would otherwise be two bars with
   one name.

   And the size is added ONLY when two tires on the same chart would
   otherwise read alike — Continental HAC3 comes in 425/65R22.5 and
   11R24.5 at different prices, and two bars both reading "Continental
   HAC3" is a chart that looks broken. Adding the size to every line
   instead would cost the room the names need, every time, to solve a
   collision that happens twice on this fleet. */
export function shortLabels(list = []) {
  const base = (m) => {
    const name = [clean(m.brand), clean(m.model)].filter(Boolean).join(" ") || "Unbranded";
    return String(m.type || m.tire_type || "").toLowerCase() === "retread"
      ? `${name} cap` : name;
  };
  const seen = new Map();   // base name -> how many distinct tires use it
  const keys = new Map();   // modelKey -> the tire it came from
  list.forEach((m) => { if (!keys.has(modelKey(m))) keys.set(modelKey(m), m); });
  keys.forEach((m) => {
    const b = base(m);
    seen.set(b, (seen.get(b) || 0) + 1);
  });
  const out = new Map();
  keys.forEach((m, k) => {
    const b = base(m);
    const size = clean(m.size);
    out.set(k, seen.get(b) > 1 && size ? `${b} ${size}` : b);
  });
  return out;
}
