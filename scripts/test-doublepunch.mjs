/* Two punches for one shift.
   ─────────────────────────────────────────────────────────────────
   Joshua's 10/05 is the case this is built from, and the numbers in
   here are his. He clocked 06:12:42–16:45:14. Forty-three seconds
   after that punch closed, a second one appeared for 06:12–16:46,
   typed rather than clocked, and his card read 20.11 on the clock
   against 10.04 booked.

   What happened next is the point. The card looked entered twice, so
   all seven of his lines were removed one at a time, reason "booked
   twice" — HT-239, DT-1806, HT-1259, HT-713, DT-865, DT-867, DT-871,
   seven different jobs adding to exactly 10.04. A day's work deleted
   to fix a fault that was never in it.

   So the two properties that matter here are not "can it spot a
   double". They are:

     1. A mechanic who legitimately clocks out and back in — a shop
        morning and an evening road call — must NEVER be called a
        double. Calling that one would teach everybody to ignore the
        banner, and the next real one goes through.
     2. When the app cannot tell which of the two is the double, it
        must say so rather than pick. Guessing takes an hour off
        somebody's pay on a coin toss.

   Needs nothing: no database, no browser.
*/
import { wasTyped, TYPED_AFTER, overlapSeconds, spanSeconds, overlapFraction,
  overlapFraction as frac, isDouble, DOUBLE_AT, doublesIn, whichToDrop,
  sayShift, sayDouble, clockAfterDropping } from "../src/doublePunch.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`${v ? "  ok  " : "  !!  "}${l}${!v && got !== undefined
    ? ` — got ${JSON.stringify(got)}` : ""}`);
};

/* Joshua's real punch: the row was written the second he clocked in. */
const CLOCKED = {
  id: "real", date: "2026-10-05",
  startedAt: "2026-10-05T10:12:42.523Z", endedAt: "2026-10-05T20:45:14.351Z",
  createdAt: "2026-10-05T10:12:42.523Z", lunch: 30, clockHours: 10.04,
};
/* The double: typed at 16:45:57, claiming to have started at 06:12. */
const TYPED = {
  id: "typed", date: "2026-10-05",
  startedAt: "2026-10-05T10:12:00.000Z", endedAt: "2026-10-05T20:46:02.078Z",
  createdAt: "2026-10-05T20:45:57.557Z", lunch: 30, clockHours: 10.07,
};

console.log("── clocked or typed ──");
ok("a punch written as it happened was clocked", !wasTyped(CLOCKED));
ok("…and one written ten hours after it claims to start was typed", wasTyped(TYPED));
/* A slow phone writes the row a moment late. That is still a punch
   somebody stood there and made. */
ok("a second of lag is still a clocked punch",
  !wasTyped({ startedAt: "2026-10-05T10:12:42.000Z", createdAt: "2026-10-05T10:12:43.000Z" }));
ok(`${TYPED_AFTER / 1000}s is the line`,
  !wasTyped({ startedAt: "2026-10-05T10:00:00Z",
              createdAt: new Date(Date.parse("2026-10-05T10:00:00Z") + TYPED_AFTER).toISOString() })
  && wasTyped({ startedAt: "2026-10-05T10:00:00Z",
              createdAt: new Date(Date.parse("2026-10-05T10:00:00Z") + TYPED_AFTER + 1).toISOString() }));
/* Rows from before the view carried created_at, and anything else
   missing a side of the comparison, must not be guessed at. */
ok("nothing to compare is not 'typed'",
  !wasTyped({ startedAt: "2026-10-05T10:00:00Z" }) && !wasTyped({}) && !wasTyped());

console.log("\n── how much two punches share ──");
ok("Joshua's two overlap almost exactly", overlapFraction(CLOCKED, TYPED) > 0.99,
  overlapFraction(CLOCKED, TYPED));
ok("…which is a double", isDouble(CLOCKED, TYPED));
ok("the overlap is the same read either way round",
  overlapSeconds(CLOCKED, TYPED) === overlapSeconds(TYPED, CLOCKED));

/* THE case that must not fire. A shop morning and an evening road
   call: two punches, one day, no overlap at all. */
const MORNING = { id: "am", startedAt: "2026-10-05T11:00:00Z",
  endedAt: "2026-10-05T16:00:00Z", createdAt: "2026-10-05T11:00:00Z", clockHours: 5 };
const EVENING = { id: "pm", startedAt: "2026-10-05T21:00:00Z",
  endedAt: "2026-10-06T01:00:00Z", createdAt: "2026-10-05T21:00:00Z", clockHours: 4 };
ok("two real shifts in one day are not a double", !isDouble(MORNING, EVENING),
  overlapFraction(MORNING, EVENING));
ok("…and nothing is flagged on that day", doublesIn([MORNING, EVENING]).length === 0);
/* Clocking back in a few minutes before the first punch registered
   is a few minutes of overlap on a five-hour shift, not a double. */
const EARLY = { id: "pm2", startedAt: "2026-10-05T15:55:00Z",
  endedAt: "2026-10-05T20:00:00Z", createdAt: "2026-10-05T15:55:00Z", clockHours: 4 };
ok("a few minutes of overlap is not a double", !isDouble(MORNING, EARLY),
  overlapFraction(MORNING, EARLY));

/* A short punch sitting wholly inside a long one IS wholly doubled.
   Measured against the longer shift it would read as a third and go
   through, which is why the fraction is of the shorter one. */
const SHORT = { id: "short", startedAt: "2026-10-05T12:00:00Z",
  endedAt: "2026-10-05T15:00:00Z", createdAt: "2026-10-05T20:00:00Z", clockHours: 3 };
const LONG = { id: "long", startedAt: "2026-10-05T10:00:00Z",
  endedAt: "2026-10-05T20:00:00Z", createdAt: "2026-10-05T10:00:00Z", clockHours: 9.5 };
ok("a short punch inside a long one is wholly doubled",
  overlapFraction(SHORT, LONG) === 1 && isDouble(SHORT, LONG),
  overlapFraction(SHORT, LONG));

ok(`${DOUBLE_AT} is the threshold`, DOUBLE_AT > 0.5 && DOUBLE_AT < 1, DOUBLE_AT);

console.log("\n── a punch still running ──");
/* Clocking in twice in the morning is this fault live, before any
   damage is done. An open punch has no end, and measuring it to
   nothing would read as no overlap and say nothing at all. */
const NOW = Date.parse("2026-10-05T14:00:00Z");
const OPEN_A = { id: "a", startedAt: "2026-10-05T10:00:00Z", endedAt: null,
  createdAt: "2026-10-05T10:00:00Z", clockHours: 0 };
const OPEN_B = { id: "b", startedAt: "2026-10-05T10:02:00Z", endedAt: null,
  createdAt: "2026-10-05T10:02:00Z", clockHours: 0 };
ok("two running punches are caught before the day is over",
  isDouble(OPEN_A, OPEN_B, NOW), overlapFraction(OPEN_A, OPEN_B, NOW));
ok("…and an open punch has a span", spanSeconds(OPEN_A, NOW) === 4 * 3600,
  spanSeconds(OPEN_A, NOW));

console.log("\n── which one comes off ──");
const pair = { a: CLOCKED, b: TYPED };
ok("the typed one is the double", whichToDrop(pair)?.id === "typed",
  whichToDrop(pair)?.id);
ok("…whichever way round the pair is given",
  whichToDrop({ a: TYPED, b: CLOCKED })?.id === "typed");
/* The refusal is the point. Two punches somebody actually clocked
   are two real punches as far as the data knows; picking one would
   be a coin toss with an hour of pay on it. */
ok("two clocked punches: the app does not pick",
  whichToDrop({ a: CLOCKED, b: { ...CLOCKED, id: "other" } }) === null);
ok("…and two typed ones: likewise",
  whichToDrop({ a: TYPED, b: { ...TYPED, id: "other" } }) === null);
ok("half a pair is no pair", whichToDrop({ a: CLOCKED }) === null && whichToDrop() === null);

console.log("\n── every pair on the day ──");
ok("Joshua's day has one", doublesIn([CLOCKED, TYPED]).length === 1);
/* Three punches for one shift is one mistake made twice. Showing one
   pair and hiding the rest sends somebody back here a second time. */
const THIRD = { ...TYPED, id: "typed2", createdAt: "2026-10-05T20:50:00Z" };
ok("three punches for one shift are all accounted for",
  doublesIn([CLOCKED, TYPED, THIRD]).length === 3,
  doublesIn([CLOCKED, TYPED, THIRD]).length);
/* A wholly-contained short punch (1.00) ranks above a merely heavy
   overlap, and the heavy one still makes the list. */
const HEAVY = { id: "heavy", startedAt: "2026-10-05T10:14:00Z",
  endedAt: "2026-10-05T19:30:00Z", createdAt: "2026-10-05T10:14:00Z", clockHours: 8.8 };
const ranked = doublesIn([HEAVY, CLOCKED, SHORT, LONG]);
ok("the worst overlap comes first", ranked[0]?.fraction === 1, ranked[0]?.fraction);
ok("…and a heavy-but-partial overlap is still listed",
  ranked.some((p) => p.a.id === "heavy" || p.b.id === "heavy"),
  ranked.map((p) => `${p.a.id}+${p.b.id} ${p.fraction.toFixed(2)}`));
ok("one punch cannot double itself", doublesIn([CLOCKED]).length === 0);
ok("no punches at all is not an error", doublesIn([]).length === 0 && doublesIn().length === 0);

console.log("\n── what it says ──");
const said = sayDouble(pair);
/* The same format the work log writes for a punch, because a banner
   that said it differently from the log entry about the same punch is
   two answers to one question. */
ok("it names both punches", /\d\d:12–\d\d:45/.test(said) && /\d\d:12–\d\d:46/.test(said), said);
ok("…says which was typed", /typed in rather than clocked/.test(said), said);
/* The sentence that was missing. A day's work was deleted because
   nothing on the screen said the hours were fine. */
ok("…and says the booked hours are not the problem",
  /leaves the hours below alone/.test(said), said);
const both = sayDouble({ a: CLOCKED, b: { ...CLOCKED, id: "other" } });
ok("when it cannot tell, it says so", /will not pick for you/.test(both), both);
ok("…and still says the hours are safe", /not affected/.test(both), both);
ok("a still-running punch reads as such",
  /still on/.test(sayShift(OPEN_A)), sayShift(OPEN_A));

console.log("\n── the clock afterwards ──");
/* Shown before anybody commits, because 20.11 going to 10.04 is the
   whole point and somebody should see it land. */
ok("dropping the double leaves one shift",
  clockAfterDropping([CLOCKED, TYPED], "typed") === 10.04,
  clockAfterDropping([CLOCKED, TYPED], "typed"));
ok("…and dropping the real one would leave the other",
  clockAfterDropping([CLOCKED, TYPED], "real") === 10.07);
ok("dropping nothing changes nothing",
  clockAfterDropping([CLOCKED, TYPED], null) === 20.11,
  clockAfterDropping([CLOCKED, TYPED], null));
/* Joshua's card, as the board actually read it. */
ok("…which is the 20.11 that started all this",
  clockAfterDropping([CLOCKED, TYPED]) === 20.11);

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
