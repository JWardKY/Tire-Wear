/* Which axle a wheel is on, and which chart counts it.
   ─────────────────────────────────────────────────────────────────
   A pusher lifts. It covers the same miles as the drives on far less
   work, so its miles-per-32nd runs high for reasons that have nothing
   to do with the tire fitted to it. Averaging that into a brand
   comparison flatters whichever brand happens to be sitting there —
   on this fleet the top two bars were pusher-only tires with one
   reading each.

   So the brand chart leaves pushers out and the wheel-position chart
   keeps them, because showing that a pusher wears differently is the
   whole point of that one.

   The rule is here rather than inline in a chart because two charts
   now depend on it meaning the same thing. Two copies of "is this a
   pusher" that could drift apart is exactly the bug that makes one
   chart quietly contradict the other.

   Needs nothing: no database, no browser.
*/
import { roleOf, roleLabel, slotOf, isPusher } from "../src/axleRole.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

/* The real configurations, copied from CONFIGS. */
const dump12 = [{ n: 1, role: "Steer" }, { n: 2, role: "Pusher" },
                { n: 3, role: "Drive" }, { n: 4, role: "Drive" }];
const quad14 = [{ n: 1, role: "Steer" }, { n: 2, role: "Pusher" },
                { n: 3, role: "Pusher" }, { n: 4, role: "Drive" },
                { n: 5, role: "Drive" }];
const tandem10 = [{ n: 1, role: "Steer" }, { n: 2, role: "Drive" },
                  { n: 3, role: "Drive" }];
const trailer8 = [{ n: 1, role: "Trailer" }, { n: 2, role: "Trailer" }];

console.log("the roles on a 12-tire dump:");
ok("1R is a steer", roleOf("1R", dump12) === "Steer");
ok("2L is the pusher", roleOf("2L", dump12) === "Pusher");
ok("3RO is a drive", roleOf("3RO", dump12) === "Drive");
ok("4LI is a drive", roleOf("4LI", dump12) === "Drive");

console.log("\nthe same wheel number on a different truck:");
/* This is why the rule takes the truck's axle list rather than the
   position alone. 2L is the pusher on a dump and a drive on a tractor,
   and a chart that guessed from the number would be wrong on half the
   fleet. */
ok("2L is a pusher on a dump", isPusher("2L", dump12) === true);
ok("…and a drive on a tractor", isPusher("2L", tandem10) === false);
ok("…and the role says so too",
   roleOf("2L", tandem10) === "Drive", roleOf("2L", tandem10));

console.log("\na truck with two pusher axles:");
ok("both are pushers", isPusher("2R", quad14) && isPusher("3L", quad14));
ok("…and axle 4 is not", isPusher("4RO", quad14) === false);
ok("…nor axle 5", isPusher("5LI", quad14) === false);

console.log("\na trailer, which has neither:");
ok("no steer", roleOf("1R", trailer8) === "Trailer");
ok("no pusher anywhere", !isPusher("1R", trailer8) && !isPusher("2LO", trailer8));

console.log("\ninner and outer:");
ok("an outer says so", slotOf("3RO") === " outer");
ok("an inner says so", slotOf("4LI") === " inner");
ok("a single wheel says nothing", slotOf("1R") === "" && slotOf("2L") === "");
ok("the label puts them together", roleLabel("3RO", dump12) === "Drive outer");
ok("…and leaves a single wheel bare", roleLabel("1R", dump12) === "Steer");

console.log("\nwhat it will not guess at:");
/* A tire whose position does not match the truck's configuration is a
   data problem — somebody changed the config after the tires went on.
   Calling it a pusher would drop it from the brand chart on a guess
   and hide the problem instead of showing it. */
ok("an axle the truck does not have has no role", roleOf("9R", dump12) === "");
ok("…and is NOT treated as a pusher", isPusher("9R", dump12) === false);
ok("…it shows as Unknown rather than vanishing",
   roleLabel("9R", dump12) === "Unknown", roleLabel("9R", dump12));
ok("no position at all", roleOf("", dump12) === "" && roleOf(null, dump12) === "");
ok("…and is not a pusher either", isPusher(null, dump12) === false);
ok("no axle list", roleOf("2L", null) === "" && roleOf("2L", undefined) === "");
ok("…and is not a pusher either", isPusher("2L", null) === false);
ok("an axle list that is not a list", roleOf("2L", "dump12") === "");
ok("a position with no number", roleOf("spare", dump12) === "");

console.log("\nthe split the charts make:");
/* The brand chart drops pushers; the wheel chart keeps them. Both ask
   the same question of the same function, which is the point. */
const fleet = [
  { pos: "1R", axles: dump12 }, { pos: "1L", axles: dump12 },
  { pos: "2R", axles: dump12 }, { pos: "2L", axles: dump12 },
  { pos: "3RO", axles: dump12 }, { pos: "4LI", axles: dump12 },
  { pos: "2R", axles: tandem10 },
];
const kept = fleet.filter((t) => !isPusher(t.pos, t.axles));
ok("the two dump pushers come out", kept.length === 5, kept.map((t) => t.pos));
ok("…and the tractor's axle 2 stays, because it is a drive",
   kept.some((t) => t.pos === "2R" && t.axles === tandem10));
ok("the wheel chart still sees all of them",
   fleet.map((t) => roleLabel(t.pos, t.axles)).filter((r) => r === "Pusher").length === 2);

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
