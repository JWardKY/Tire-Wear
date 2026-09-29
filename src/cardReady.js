/* ── Why a card will not save ──────────────────────────────────────
   The rule and the sentence that explains the rule, in one place.

   They used to be two lists in the form: one deciding whether Save
   was allowed, another deciding what to say about it. They drifted.
   A card whose hours read as a minus figure failed the first list and
   matched nothing in the second, so Save went grey with nothing said
   at all — and a greyed-out button that will not say what is wrong is
   where a timecard goes to die. The mechanic assumes it saved, walks
   away, and the day is gone.

   So there is one function. `ready` is "whyNotReady said nothing",
   which means a new rule cannot be added without a sentence to go
   with it, and the form can always answer "why not". */

/* A card that says a PM was done on a truck. Shop time is not a PM on
   anything, so the unit is half the test. */
export const needsPm = (c) =>
  !!c.vehId && (c.workTypes || []).includes("PM service");

/* A truck or a shop activity — one of the two, never neither. The
   database says the same thing in tw_time_needs_a_home. */
export const homed = (c) => !!c.vehId || (!!c.shopWork && !!c.shop);

/* The reason this card cannot be saved, phrased to follow the card's
   own name: "DT-898 has no cost code on it." Empty string when the
   card is fine. Order matters — it is the order somebody fills the
   card in, so the sentence names the next thing to do rather than the
   last thing missing. */
export function whyNotReady(c) {
  if (!c) return "";

  if (!c.vehId && !c.shopWork) return "has no unit or shop time on it yet";
  /* Distinct from the above on purpose. "No unit or shop" reads as an
     accusation to somebody who has just picked Other shop time and is
     looking straight at it; what is actually missing is which shop. */
  if (c.shopWork && !c.shop) return `does not say which shop ${c.shopWork} was at`;

  if (!c.costCode) return "has no cost code on it — choose what to charge the time to";

  const h = Number(c.hours);
  if (c.hours === "" || c.hours === null || c.hours === undefined || !Number.isFinite(h) || h === 0)
    return "has no hours on it — the clock fills them in when you stop";
  if (h < 0) return "has a minus figure in its hours";
  if (h > 24) return "has more than twenty-four hours on it";

  if (c.woId && c.jobOutcome !== "done" && c.jobOutcome !== "hold")
    return `does not say where you got to on ${c.workOrder || "the job"} — either answer saves the hours`;

  if (needsPm(c) && !(c.pmPrograms || []).length)
    return "has PM service ticked but no service named";

  return "";
}

export const ready = (c) => !whyNotReady(c);

/* What to call a card in that sentence. The unit number if it has one,
   the shop activity if it is shop time, and its place on the screen if
   it is neither — which is exactly the case where somebody cannot tell
   which card is being complained about. */
export function cardName(c, vehicles = [], index = -1) {
  if (c && c.vehId) {
    const v = vehicles.find((x) => x.id === c.vehId);
    if (v && v.num) return v.num;
  }
  if (c && c.shopWork) return c.shopWork;
  return index >= 0 ? `Card ${index + 1}` : "One card";
}

/* What is standing between the form and a save, or null if nothing is.
   `key` is the card at fault so the form can point at it; a blocker
   that belongs to the form as a whole has no key.

   The last branch is the point of the whole module: if Save is off and
   no known rule explains it, say so rather than say nothing. A vague
   sentence sends somebody looking at their cards. Silence sends them
   home with the day unsaved. */
export function saveBlock({ cards = [], live = [], saving = false, canSave = false,
  vehicles = [] } = {}) {
  if (saving || canSave) return null;

  if (!live.length) return { key: null, text: "Pick a unit or shop time to start." };

  const run = cards.find((c) => c.runningAt);
  if (run) {
    return {
      key: run.key,
      text: `${cardName(run, vehicles, cards.findIndex((x) => x.key === run.key))} still has its clock running — press Stop, then save.`,
    };
  }

  const bad = live.find((c) => !ready(c));
  if (bad) {
    return {
      key: bad.key,
      text: `${cardName(bad, vehicles, cards.findIndex((x) => x.key === bad.key))} ${whyNotReady(bad)}.`,
    };
  }

  return {
    key: null,
    text: "Something on the form is not finished, and the app cannot work out what."
      + " Check each card for a unit, a cost code and its hours.",
  };
}
