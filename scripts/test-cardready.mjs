/* Why Save timecard is grey.
   ─────────────────────────────────────────────────────────────────
   Donald Bradley worked ten hours on Monday 28 September and none of
   it saved. The clock was fine — punched in 7:05, out 5:07, and both
   punches reached the server, so the tablet had a working connection
   the whole time. What he had was a Save button that would not go and
   would not say why.

   Two faults behind that, and this file is about both.

   The first: the rule deciding whether Save was allowed and the
   sentence explaining the refusal were two separate lists. A card
   carrying a minus figure in its hours failed the first list and
   matched nothing in the second, so the button went grey in silence.
   They are one function now, and `ready` is defined as "whyNotReady
   said nothing" — a rule cannot be added without a sentence.

   The second is not in this file because it is markup: the message
   sat inside the button row behind a margin-auto, which on a zoomed
   tablet put it off the left edge of the screen. It is a full-width
   strip above the button now.

   Every branch below is a way a real card goes wrong. The last test
   is the important one: whatever a card holds, if Save is off there
   is something to read.

   Needs nothing: no database, no browser.
*/
import {
  homed, needsPm, ready, whyNotReady, cardName, saveBlock,
} from "../src/cardReady.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

/* A card with nothing wrong with it, to spoil one field at a time. */
const good = (over = {}) => ({
  key: "k1", vehId: "veh-1", shopWork: "", shop: "", costCode: "880",
  hours: "2.5", woId: "", jobOutcome: "", workOrder: "", workTypes: [],
  pmPrograms: [], runningAt: null, ...over,
});
const VEHS = [{ id: "veh-1", num: "DT-898" }];

console.log("a card that is fine:");
ok("saves", ready(good()));
ok("and has nothing to say about itself", whyNotReady(good()) === "", whyNotReady(good()));

console.log("\nthe fault that lost Monday — a minus figure in the hours:");
ok("refused", !ready(good({ hours: "-3" })));
ok("and says so", /minus/.test(whyNotReady(good({ hours: "-3" }))), whyNotReady(good({ hours: "-3" })));

console.log("\nevery other way a card is not finished says something:");
for (const [what, over] of [
  ["nothing picked at all", { vehId: "" }],
  ["shop time with no shop", { vehId: "", shopWork: "Other shop time", shop: "" }],
  ["no cost code", { costCode: "" }],
  ["hours left blank", { hours: "" }],
  ["hours typed as words", { hours: "abc" }],
  ["hours of zero", { hours: "0" }],
  ["more than a day", { hours: "25" }],
  ["a job with no outcome", { woId: "wo-1", workOrder: "WO-26-0051" }],
  ["PM ticked, none named", { workTypes: ["PM service"], pmPrograms: [] }],
]) {
  const c = good(over);
  const why = whyNotReady(c);
  ok(`${what} — refused and explained`, !ready(c) && why.length > 0, why);
}

console.log("\nthe two 'no unit' cases are told apart:");
/* Telling somebody who has just picked Other shop time that the card
   "has no unit or shop on it" reads as the app not seeing what they
   are looking straight at. What is missing is which shop. */
ok("nothing picked names both options",
  /unit or shop time/.test(whyNotReady(good({ vehId: "" }))));
ok("shop time with no shop asks only for the shop",
  /which shop/.test(whyNotReady(good({ vehId: "", shopWork: "Other shop time" }))),
  whyNotReady(good({ vehId: "", shopWork: "Other shop time" })));

console.log("\nzero hours is not the same as no hours, and both are refused:");
ok("blank", !ready(good({ hours: "" })));
ok("zero", !ready(good({ hours: "0" })));
/* Number(null) is 0 and Number("") is 0. Neither is a reading. */
ok("null", !ready(good({ hours: null })));

console.log("\nan hour under a quarter is still an hour:");
/* The form's step is 0.25 but the rule is "more than nothing". A
   refusal here would be the app arguing with a figure somebody means. */
ok("0.1 saves", ready(good({ hours: "0.1" })));
ok("24 exactly saves", ready(good({ hours: "24" })));
ok("24.01 does not", !ready(good({ hours: "24.01" })));

console.log("\na job's outcome:");
ok("finished saves", ready(good({ woId: "wo-1", jobOutcome: "done" })));
ok("not finished also saves", ready(good({ woId: "wo-1", jobOutcome: "hold" })));
/* Both answers let them go home. A system that only accepts
   "finished" teaches people to lie or to leave the hours off. */
ok("no answer does not", !ready(good({ woId: "wo-1", jobOutcome: "" })));
ok("a typed WO number is not a job to answer for",
  ready(good({ workOrder: "12345", woId: "" })));

console.log("\nPM service:");
ok("a truck with PM ticked and a service named saves",
  ready(good({ workTypes: ["PM service"], pmPrograms: ["p1"] })));
ok("shop time cannot need a PM",
  !needsPm({ vehId: "", shopWork: "Other shop time", workTypes: ["PM service"] }));

console.log("\nhomed matches what the database will accept:");
ok("a unit is a home", homed(good()));
ok("a shop activity with its shop is a home",
  homed({ vehId: "", shopWork: "Other shop time", shop: "Clays Ferry Shop" }));
ok("a shop activity without its shop is not", !homed({ vehId: "", shopWork: "Other shop time", shop: "" }));
ok("neither is not", !homed({ vehId: "", shopWork: "", shop: "" }));

console.log("\nthe message names the card, so eight cards is not a guessing game:");
const twoCards = [good({ key: "a" }), good({ key: "b", costCode: "" })];
const b = saveBlock({ cards: twoCards, live: twoCards, vehicles: VEHS });
ok("by unit number when it has one", b && b.text.startsWith("DT-898"), b);
ok("and points at the card itself", b && b.key === "b", b);

const shopCards = [good({ key: "c", vehId: "", shopWork: "Shop cleanup / housekeeping",
  shop: "Clays Ferry Shop", costCode: "" })];
ok("by the shop activity when it is shop time",
  saveBlock({ cards: shopCards, live: shopCards }).text.startsWith("Shop cleanup"),
  saveBlock({ cards: shopCards, live: shopCards }).text);

const bare = [good({ key: "d", vehId: "", costCode: "x", hours: "1" })];
ok("by its place on the screen when it is neither",
  saveBlock({ cards: bare, live: bare }).text.startsWith("Card 1"),
  saveBlock({ cards: bare, live: bare }).text);
ok("counted as the mechanic sees it, from one",
  cardName({}, [], 2) === "Card 3", cardName({}, [], 2));

console.log("\nthe form's own blockers:");
ok("an empty form says where to start",
  /Pick a unit/.test(saveBlock({ cards: [good()], live: [] }).text));
const runningCards = [good({ key: "r", runningAt: "2026-09-28T12:00:00Z" })];
const rb = saveBlock({ cards: runningCards, live: runningCards, vehicles: VEHS });
ok("a running clock is named, not just announced",
  rb.text.startsWith("DT-898") && /Stop/.test(rb.text), rb);
ok("and it is the running card that gets pointed at", rb.key === "r");
ok("nothing to say once it can save", saveBlock({ cards: [good()], live: [good()], canSave: true }) === null);
ok("nothing to say mid-save", saveBlock({ cards: [good()], live: [], saving: true }) === null);

console.log("\nthe whole point — a grey button is never silent:");
/* The guard against this bug coming back in a shape nobody predicted.
   Whatever the card holds, if Save is off there is a sentence. */
const oddities = [
  { hours: "-0.25" }, { hours: "1e9" }, { hours: "  " }, { hours: "NaN" },
  { hours: Infinity }, { hours: "2.5", costCode: "" }, { vehId: "", shopWork: "" },
  { hours: "-0" }, { hours: "0.0" },
];
let silent = 0;
for (const over of oddities) {
  const c = good(over);
  if (ready(c)) continue;                       // fine, it saves
  const block = saveBlock({ cards: [c], live: [c], vehicles: VEHS });
  if (!block || !block.text) { silent++; console.log(`        silent on ${JSON.stringify(over)}`); }
}
ok("no card refuses without a reason", silent === 0, silent);

/* And the catch-all itself, reached by a card that passes every rule
   the sentence knows about while the form still says no. This is the
   branch that would have saved Monday. */
const impossible = saveBlock({ cards: [good()], live: [good()], canSave: false });
ok("a refusal nobody predicted still says something",
  impossible && impossible.text.length > 0, impossible);

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
