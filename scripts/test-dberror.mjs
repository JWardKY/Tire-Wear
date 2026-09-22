/* Saying what the database said, in words.
   ─────────────────────────────────────────────────────────────────
   This exists because the PM screen showed somebody

       That did not save — numeric field overflow

   after they typed an hour meter reading into a box labelled "Hours"
   that sat directly under "Odometer". Both halves were wrong: the label
   invited the mistake, and the error gave them nothing to act on.

   Two rules here. `tooBig` catches it in the form, where the person is
   still looking at the box. `saySo` translates what the database says
   when something gets past that — and deliberately does NOT translate
   what it does not recognise, because a wrong translation sends
   somebody looking in the wrong place, which is worse than a raw one.

   `sayOffline` is the third case and the opposite one: the database
   never said anything, because the request never got there. That is
   the same rule read backwards — the sentence has to be about the
   signal, and only when it really was the signal.

   Needs nothing: no database, no browser.
*/
import { saySo, sayOffline, neverReached, tooBig } from "../src/dbError.js";

let bad = 0;
const ok = (label, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${label}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

const FIELDS = {
  engine_hours: { label: "Engine hours", limit: "the meter tops out at 999,999.9" },
  hours: { label: "Labour hours", limit: "a service cannot take more than 999.99 hours" },
};

console.log("the error somebody actually saw:");
const overflow = { code: "22003", message: 'numeric field overflow: column "hours"' };
const said = saySo(overflow, FIELDS);
ok("it names the field", /Labour hours/.test(said), said);
ok("and says what the limit is", /999\.99/.test(said), said);
ok("and never says 'numeric field overflow'", !/numeric field overflow/i.test(said), said);

console.log("\nwhen the error does not name a column:");
const vague = saySo({ code: "22003", message: "numeric field overflow" }, FIELDS);
ok("it still says what kind of thing went wrong",
   /too big/i.test(vague) && !/undefined|null/.test(vague), vague);

console.log("\nthe others we can actually produce:");
ok("a duplicate", /duplicate/i.test(saySo({ code: "23505", message: "x" })));
ok("a dangling reference", /not there any more/i.test(saySo({ code: "23503", message: "x" })));
ok("a check constraint", /impossible value/i.test(saySo({ code: "23514", message: "x" })));
ok("text too long", /longer than/i.test(saySo({ code: "22001", message: "x" })));
ok("no permission", /permission/i.test(saySo({ code: "42501", message: "x" })));

console.log("\nwhat it refuses to guess at:");
const unknown = { code: "57014", message: "canceling statement due to statement timeout" };
ok("an unrecognised code comes through as it was",
   saySo(unknown) === unknown.message, saySo(unknown));
ok("and a plain Error does too",
   saySo(new Error("network down")) === "network down");
ok("nothing at all is nothing", saySo(null) === "");

console.log("\ncaught in the form, before the database sees it:");
ok("the meter reading in the labour box",
   tooBig("16409", { label: "Labour hours", max: 999.99 })
     === "Labour hours cannot be more than 999.99.",
   tooBig("16409", { label: "Labour hours", max: 999.99 }));
ok("the same reading in the engine-hours box is fine",
   tooBig("16409", { label: "Engine hours", max: 999999.9, decimals: 1 }) === "");
ok("an odometer of 356872 is fine",
   tooBig("356872", { label: "Odometer", max: 9999999, decimals: 0 }) === "");
ok("empty is fine — these fields are optional",
   tooBig("", { label: "Labour hours", max: 999.99 }) === ""
   && tooBig(null, { label: "Labour hours", max: 999.99 }) === "");
ok("exactly the limit is fine",
   tooBig("999.99", { label: "Labour hours", max: 999.99 }) === "");
ok("a hair over is not",
   tooBig("1000", { label: "Labour hours", max: 999.99 }) !== "");
ok("negative is refused",
   /cannot be negative/.test(tooBig("-1", { label: "Labour hours", max: 999.99 })));
ok("something that is not a number is refused",
   /has to be a number/.test(tooBig("abc", { label: "Labour hours", max: 999.99 })));
/* The limit is read by somebody holding a wrench, not a debugger. */
ok("big limits are printed with separators",
   /999,999\.9/.test(tooBig("9999999", { label: "Engine hours", max: 999999.9, decimals: 1 })),
   tooBig("9999999", { label: "Engine hours", max: 999999.9, decimals: 1 }));

/* ── The one that never reached the server ────────────────────────
   Alex got "That did not save — TypeError: Load failed" on DT-874 at
   twenty to one in the morning. The server log for that minute holds
   no request at all: his iPad dropped the connection mid-save. Both
   halves of the banner were wrong, and this is the half of the fix
   that does not need a browser. */

console.log("\nthe error Alex actually saw:");
/* What postgrest-js hands back for a dead fetch: name + ": " + message,
   and no code, because only the server has one of those. */
const alex = { message: "TypeError: Load failed", details: "", hint: "", code: "" };
const said2 = sayOffline(alex);
ok("it says the message never got there", /did not reach the server/i.test(said2), said2);
ok("it says what to do about it", /check your signal/i.test(said2), said2);
ok("it never says 'TypeError'", !/typeerror/i.test(said2), said2);
ok("…nor 'Load failed'", !/load failed/i.test(said2), said2);
ok("…nor 'fetch'", !/fetch/i.test(said2), said2);
/* It cannot promise the row was not written. Usually it was not — Alex's
   never arrived — but a reply can also go missing after the insert, and
   "nothing was recorded" when something was is two tires on one wheel. */
ok("it does not promise nothing was written",
   !/nothing was (recorded|saved)/i.test(said2), said2);
ok("it tells you how to find out", /reload/i.test(said2), said2);

console.log("\nthe same failure in the other browsers:");
ok("Chrome and Edge", /did not reach/i.test(sayOffline({ message: "TypeError: Failed to fetch" })));
ok("Firefox", /did not reach/i.test(sayOffline({
  message: "TypeError: NetworkError when attempting to fetch resource." })));
ok("iOS losing signal", /did not reach/i.test(sayOffline({
  message: "TypeError: The network connection was lost." })));
ok("iOS with no data at all", /did not reach/i.test(sayOffline({
  message: "TypeError: The Internet connection appears to be offline." })));
ok("a tab suspended mid-request", /did not reach/i.test(sayOffline({
  message: "AbortError: The user aborted a request." })));
ok("Node, for the scripts", /did not reach/i.test(sayOffline({ message: "TypeError: fetch failed" })));
/* A thrown error keeps its name and its message apart, and sometimes
   only the name says what happened. */
ok("a raw TypeError, not yet wrapped",
   /did not reach/i.test(sayOffline(new TypeError("Load failed"))));
ok("…and one where only the name says so",
   /did not reach/i.test(sayOffline({ name: "AbortError", message: "The operation was aborted." })),
   sayOffline({ name: "AbortError", message: "The operation was aborted." }));

console.log("\nreading is not saving:");
const load = sayOffline({ message: "TypeError: Load failed" }, "load");
ok("a failed read does not mention saving at all", !/sav(e|ing)/i.test(load), load);
ok("…it says the server could not be reached", /could not reach the server/i.test(load), load);
ok("…and does not tell you to reload, which is what just failed",
   !/reload/i.test(load), load);

console.log("\nwhat it refuses to blame on the network:");
/* The rule that keeps this honest: a SQLSTATE means the server answered,
   whatever the sentence beside it happens to read like. */
ok("a statement timeout is the server, not the signal",
   !neverReached({ code: "57014", message: "canceling statement due to statement timeout" }));
ok("a duplicate key", sayOffline({ code: "23505", message: "duplicate key" }) === "");
ok("a number too big", sayOffline({ code: "22003", message: "numeric field overflow" }) === "");
ok("no permission", sayOffline({ code: "42501", message: "new row violates row-level security policy" }) === "");
ok("a missing column", sayOffline({ code: "42703", message: "column tw_hours.job_location does not exist" }) === "");
/* The nastiest case: the server's own words happening to contain ours. */
ok("a server error that merely reads like one",
   sayOffline({ code: "22001", message: "load failed on value for column x" }) === "");
ok("an ordinary Error keeps its own words",
   sayOffline(new Error("something else went wrong")) === "");
ok("nothing at all is nothing", sayOffline(null) === "" && neverReached(null) === false);
ok("…and undefined too", sayOffline(undefined) === "");

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
