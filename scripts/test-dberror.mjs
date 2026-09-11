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

   Needs nothing: no database, no browser.
*/
import { saySo, tooBig } from "../src/dbError.js";

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

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
