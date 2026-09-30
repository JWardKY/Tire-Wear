/* ── The odometer a tire comes off at ─────────────────────────────
   A tire's whole life is two numbers: the reading it went on at and
   the reading it came off at. Everything else — miles per 32nd, cost
   per mile, whether a brand is worth buying again — is the distance
   between them.

   The pull form used to fill that second number in from the tire's
   last known point. But the mount is itself the first point, so a tire
   nobody had gauged since it went on was offered the reading it went
   on at. Press Pull and the casing records zero miles.

   That is not a small wrong number. A tire that ran no miles cannot
   have a wear rate, so it drops out of the brand comparison entirely —
   silently, on the page the tire buying is decided from. Eight of them
   went in that way on DT-890 on 30 September before anybody noticed,
   and only because the whole entry turned out to be on the wrong truck.

   So the suggestion comes from the truck, which is what actually knows
   how far it has been driven, and a figure below the one it went on at
   is refused outright. The rest is said rather than blocked: a tire
   mounted and taken straight back off really does run no miles, and
   Motive's overnight reading really can be a day behind the tire that
   came off this afternoon.

   Nothing here touches the database. */

const commas = (n) => Number(n).toLocaleString("en-US");

/* A number or null. Number(null) is 0 and Number("") is 0, and a
   missing odometer is not mile zero. */
function num(x) {
  if (x == null || x === "" || typeof x === "boolean") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/* What to put in the box before anybody types. The truck's own current
   reading first: it is the only one of the three that knows how far the
   truck has been driven since. A tread reading is second because at
   least somebody stood at the wheel to take it. The mount is not a
   candidate at all — that is the bug.

   Returns a string, because it goes straight into an input. Empty means
   "no idea, ask them", which is a better answer than a wrong one. */
export function suggestOffOdo({ truckOdo, lastReadOdo, mountOdo } = {}) {
  const mount = num(mountOdo);
  const ok = (v) => {
    const n = num(v);
    return n != null && (mount == null || n >= mount) ? n : null;
  };
  const pick = ok(truckOdo) ?? ok(lastReadOdo);
  return pick == null ? "" : String(pick);
}

/* Whether the figure in the box can be right. `stop` refuses the pull;
   `say` is shown either way, so a number that is merely surprising
   gets a sentence rather than a blocked button. */
export function checkOffOdo(typed, { mountOdo, truckOdo } = {}) {
  const n = num(typed);
  const mount = num(mountOdo);
  const truck = num(truckOdo);

  if (n == null) return { stop: true, say: "Put the odometer reading on it." };
  if (n < 0) return { stop: true, say: "An odometer cannot be a minus figure." };

  /* The one thing that cannot be true. A tire coming off at fewer miles
     than it went on at would give the casing a negative life. */
  if (mount != null && n < mount) {
    return {
      stop: true,
      say: `It went on at ${commas(mount)} — a tire cannot come off having run backwards.`,
    };
  }

  /* True often enough to allow: a tire mounted wrong and taken straight
     back off ran no miles. Worth saying, because it is also exactly what
     a mis-keyed figure looks like. */
  if (mount != null && n === mount) {
    return {
      stop: false,
      say: "That is the reading it went on at, so this casing will show no miles run.",
    };
  }

  /* Motive syncs overnight, so the truck's reading is routinely behind a
     tire pulled the same afternoon. Only worth a word when the gap is
     bigger than a truck could have driven in the meantime. */
  if (truck != null && n > truck + 2000) {
    return {
      stop: false,
      say: `That is well past the truck's last reading of ${commas(truck)} — check the digits.`,
    };
  }

  return { stop: false, say: "" };
}

/* The miles that figure books to the casing, for showing beside the box
   so the number's consequence is visible while it is being typed. */
export function milesOff(typed, mountOdo) {
  const n = num(typed), mount = num(mountOdo);
  if (n == null || mount == null || n < mount) return null;
  return n - mount;
}
