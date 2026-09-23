/* Moving a tire to another wheel.
   ─────────────────────────────────────────────────────────────────
   "I might need to move 4RO to 4LO." Which you could not, because the
   only thing that could change a position was the edit form, and that
   offered free wheels only — and on a truck with twelve tires mounted
   there are none. A rotation is two tires trading places; there is no
   empty wheel in the middle of one.

   It is also not the same act as the edit form performs. Correcting a
   position says the tire had always been on the new wheel, and takes
   its readings with it as though they were taken there. A rotation
   says it was on 4RO until Tuesday and is on 4LO now. Both are
   legitimate and they must not be the same button.

   The swap itself is a database transaction — see tw_move_tire in
   schema.sql for why it cannot be two updates. This file holds the
   part that decides what the screen offers and what it says.

   Needs nothing: no database, no browser.
*/
import {
  destinations, checkMove, sayMove, sayThreshold, sayLog, isSteer,
} from "../src/moveTire.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

/* DT-899's drive axles and steers, twelve wheels, all of them full. */
const POS = [
  { id: "1L", role: "Steer" }, { id: "1R", role: "Steer" },
  { id: "2L", role: "Pusher" }, { id: "2R", role: "Pusher" },
  { id: "3LI", role: "Drive", slot: "I" }, { id: "3LO", role: "Drive", slot: "O" },
  { id: "3RI", role: "Drive", slot: "I" }, { id: "3RO", role: "Drive", slot: "O" },
  { id: "4LI", role: "Drive", slot: "I" }, { id: "4LO", role: "Drive", slot: "O" },
  { id: "4RI", role: "Drive", slot: "I" }, { id: "4RO", role: "Drive", slot: "O" },
];
const VEH = "DT-899";
const at = {};
POS.forEach((p, i) => { at[`${VEH}|${p.id}`] = { id: `t${i}`, pos: p.id, brand: "Maxam" }; });
const stats = {};
POS.forEach((p, i) => { stats[`t${i}`] = { depth: [15, 15, 18, 19, 12, 14, 17, 16, 12, 11, 10, 14][i] }; });

console.log("what a full truck offers:");
const all = destinations(POS, at, VEH, "4RO");
ok("every wheel but its own", all.length === 11 && !all.some((w) => w.id === "4RO"),
   all.map((w) => w.id));
/* The whole point. A truck with twelve tires on it has no free wheel,
   so offering only the free ones offers nothing at all. */
ok("the taken ones are offered too", all.every((w) => w.taken), all.filter((w) => !w.taken));
ok("4LO is among them", !!all.find((w) => w.id === "4LO"));
ok("…and it knows what is on it", all.find((w) => w.id === "4LO").taken.id === "t9");

console.log("\nand a truck with a bare wheel:");
const gappy = { ...at };
delete gappy[`${VEH}|4LO`];
const some = destinations(POS, gappy, VEH, "4RO");
ok("the empty wheel is offered", !!some.find((w) => w.id === "4LO"));
ok("…and says it is empty", some.find((w) => w.id === "4LO").taken === null);
ok("the rest still say what is on them",
   some.filter((w) => w.taken).length === 10, some.filter((w) => w.taken).length);
ok("a truck with nothing mounted still offers its wheels",
   destinations(POS, {}, VEH, "4RO").length === 11);
ok("no positions is no destinations",
   destinations([], at, VEH, "4RO").length === 0
   && destinations(null, at, VEH, "4RO").length === 0);

console.log("\nwhat it refuses:");
ok("no wheel chosen", /Pick the wheel/i.test(checkMove("4RO", "")));
ok("…and nothing chosen at all", /Pick the wheel/i.test(checkMove("4RO", null)));
ok("its own wheel", /already on 4RO/.test(checkMove("4RO", "4RO")), checkMove("4RO", "4RO"));
ok("a real move is not refused", checkMove("4RO", "4LO") === "");

console.log("\nwhat it says before it happens:");
/* The two treads are the whole decision: rotating is choosing which
   way round the deep one goes. */
const swap = sayMove({ from: "4RO", to: "4LO", moving: { id: "t11" },
                       other: at[`${VEH}|4LO`], stats });
ok("a swap names both wheels", /4RO/.test(swap) && /4LO/.test(swap), swap);
ok("…and both treads", /14\/32/.test(swap) && /11\/32/.test(swap), swap);
ok("…and says they trade places", /trade places/.test(swap), swap);
const onto = sayMove({ from: "4RO", to: "4LO", moving: { id: "t11" }, other: null, stats });
ok("a move onto a bare wheel says so", /empty/.test(onto) && !/trade/.test(onto), onto);
ok("…and does not invent a tread for a wheel with no tire",
   !/undefined|null|NaN/.test(onto), onto);
ok("an unmeasured tire is not given a tread",
   !/\/32/.test(sayMove({ from: "4RO", to: "4LO", moving: { id: "zz" },
                          other: null, stats })),
   sayMove({ from: "4RO", to: "4LO", moving: { id: "zz" }, other: null, stats }));
ok("nothing chosen says nothing",
   sayMove({ from: "4RO", to: "", moving: { id: "t11" }, other: null, stats }) === "");

console.log("\ncrossing between a steer wheel and the rest:");
/* A steer tire is judged against a different pull depth, so a tire
   crossing over changes status without changing a thirty-second. */
const S = { pullSteer: 6, pullOther: 4 };
ok("1L is a steer wheel", isSteer("1L") && isSteer("1R"));
ok("…and 2L is not, whatever it is called", !isSteer("2L") && !isSteer("4RO"));
ok("onto the steer axle is flagged", /6\/32 rather than 4\/32/.test(sayThreshold("4RO", "1L", S)),
   sayThreshold("4RO", "1L", S));
ok("off it is flagged the other way round",
   /4\/32 rather than 6\/32/.test(sayThreshold("1L", "4RO", S)), sayThreshold("1L", "4RO", S));
ok("drive to drive is not flagged", sayThreshold("4RO", "4LO", S) === "");
ok("steer to steer is not flagged", sayThreshold("1L", "1R", S) === "");
/* If the shop has set both thresholds the same there is nothing to say. */
ok("nor is it when the two depths are the same",
   sayThreshold("4RO", "1L", { pullSteer: 4, pullOther: 4 }) === "");
ok("nor when the settings are not loaded",
   sayThreshold("4RO", "1L", null) === "" && sayThreshold("4RO", "1L", {}) === "");

console.log("\nthe line in the work log:");
/* Written rather than derived: once position is overwritten nothing
   else knows the tire was ever on 4RO. */
const L = sayLog({ veh: VEH, from: "4RO", to: "4LO", other: { id: "t9" },
                   when: "2026-09-22", odo: 99141 });
ok("it names the truck", /DT-899/.test(L), L);
ok("…both wheels", /4RO/.test(L) && /4LO/.test(L), L);
ok("…that they swapped", /traded places/.test(L), L);
ok("…the date it happened", /09\/22\/26/.test(L), L);
ok("…and the odometer, with a separator", /99,141 mi/.test(L), L);
const L2 = sayLog({ veh: VEH, from: "4RO", to: "3RI", other: null,
                    when: "2026-09-22", odo: null });
ok("a move onto a bare wheel reads as a move, not a swap",
   /4RO → 3RI/.test(L2) && !/traded/.test(L2), L2);
ok("…and says nothing about an odometer nobody gave",
   !/mi/.test(L2) && !/null|undefined|NaN/.test(L2), L2);
/* The date is in the sentence because the row's own timestamp is when
   somebody typed it. A Friday rotation entered on Monday is Friday's. */
ok("a rotation entered later still reads as the day it happened",
   /09\/18\/26/.test(sayLog({ veh: VEH, from: "4RO", to: "4LO", other: { id: "t9" },
                              when: "2026-09-18", odo: 99141 })));
ok("no date at all still reads", !/undefined|null|NaN/.test(
   sayLog({ veh: VEH, from: "4RO", to: "4LO", other: { id: "t9" } })));
ok("no truck still reads",
   /A truck/.test(sayLog({ from: "4RO", to: "4LO", other: null })));
ok("a zero odometer is not printed",
   !/0 mi/.test(sayLog({ veh: VEH, from: "4RO", to: "4LO", other: null, odo: 0 })));

console.log("\nnothing a mechanic would not say:");
for (const [what, text] of [["a swap", swap], ["a move", onto], ["the log line", L],
                            ["the threshold note", sayThreshold("4RO", "1L", S)]]) {
  ok(`${what} carries no jargon`, !/null|undefined|NaN|object|\[/.test(text), text);
}

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
