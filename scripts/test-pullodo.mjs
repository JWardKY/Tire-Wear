/* The odometer a tire comes off at.
   ─────────────────────────────────────────────────────────────────
   A tire's life is two numbers: the reading it went on at and the
   reading it came off at. Everything the Analysis page decides —
   miles per 32nd, cost per mile, whether a brand is worth buying
   again — is the distance between them.

   The pull form filled the second one in from the tire's last known
   point, and tireStats puts the mount in as the first point. So a
   tire nobody had gauged since it went on was offered the reading it
   went on at, and pulling it there booked the casing zero miles.

   Zero is worse than wrong. A casing that ran no miles has no wear
   rate, so it does not appear in the brand comparison at all — it
   leaves quietly, off the page the tire buying is decided from.
   Eight went in that way on DT-890 on 30 September, and were only
   caught because the whole entry turned out to be on the wrong truck.

   The suggestion now comes from the truck. A figure below the mount
   is refused. Everything else is said, not blocked — a tire mounted
   wrong and taken straight off really does run no miles, and Motive
   syncs overnight so its reading is routinely a day behind a tire
   pulled this afternoon.

   Needs nothing: no database, no browser.
*/
import { suggestOffOdo, checkOffOdo, milesOff } from "../src/pullOdo.js";
import { checkMove, REPLACE, SWAP } from "../src/moveTire.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

/* DT-890's real figures on the day it happened. */
const MOUNT = 150621, TRUCK = 151859;

console.log("the bug, in the shape it actually took:");
/* Eight Continentals, mounted 10 September at 150,621, never gauged
   since. The form offered 150,621 because the mount is the only point
   the tire has. */
ok("an ungauged tire is not offered the reading it went on at",
  suggestOffOdo({ truckOdo: TRUCK, lastReadOdo: null, mountOdo: MOUNT }) !== String(MOUNT),
  suggestOffOdo({ truckOdo: TRUCK, lastReadOdo: null, mountOdo: MOUNT }));
ok("…it is offered the truck's reading",
  suggestOffOdo({ truckOdo: TRUCK, lastReadOdo: null, mountOdo: MOUNT }) === "151859");

console.log("\nwhere the suggestion comes from, in order:");
ok("the truck first — it is what knows how far it has been driven",
  suggestOffOdo({ truckOdo: 200000, lastReadOdo: 180000, mountOdo: 100000 }) === "200000");
ok("a real tread reading when the truck has no figure",
  suggestOffOdo({ truckOdo: null, lastReadOdo: 180000, mountOdo: 100000 }) === "180000");
ok("blank when neither is any use — better than a wrong number",
  suggestOffOdo({ truckOdo: null, lastReadOdo: null, mountOdo: 100000 }) === "");
/* A truck reading older than the mount is a truck whose odometer was
   corrected, or a tire keyed with the wrong one. Either way it is not
   a figure to hand somebody. */
ok("a truck reading below the mount is not offered",
  suggestOffOdo({ truckOdo: 90000, lastReadOdo: null, mountOdo: 100000 }) === "",
  suggestOffOdo({ truckOdo: 90000, lastReadOdo: null, mountOdo: 100000 }));
ok("…and it falls through to the reading if that one works",
  suggestOffOdo({ truckOdo: 90000, lastReadOdo: 110000, mountOdo: 100000 }) === "110000");
/* Number(null) is 0 and Number("") is 0. Mile zero is a real odometer
   reading on a new truck, so the guard has to be explicit. */
ok("a missing mount does not become mile zero",
  suggestOffOdo({ truckOdo: 5000, lastReadOdo: null, mountOdo: null }) === "5000");

console.log("\nthe one thing that cannot be true:");
const back = checkOffOdo("150000", { mountOdo: MOUNT });
ok("coming off at fewer miles than it went on at is refused", back.stop);
ok("…and says what it went on at", /150,621/.test(back.say), back.say);
ok("a minus figure is refused", checkOffOdo("-5", { mountOdo: MOUNT }).stop);
ok("a blank box is refused", checkOffOdo("", { mountOdo: MOUNT }).stop);
ok("words are refused", checkOffOdo("abc", { mountOdo: MOUNT }).stop);
ok("null is refused, not read as zero", checkOffOdo(null, { mountOdo: MOUNT }).stop);

console.log("\nwhat is said but not blocked:");
/* A tire mounted wrong and taken straight back off really did run no
   miles. Refusing it would make somebody type a lie instead. */
const same = checkOffOdo(String(MOUNT), { mountOdo: MOUNT, truckOdo: TRUCK });
ok("the mount reading exactly is allowed", !same.stop);
ok("…but it says the casing will show no miles", /no miles/.test(same.say), same.say);
/* Motive syncs overnight. A tire pulled this afternoon is legitimately
   ahead of the truck's last sync. */
const ahead = checkOffOdo(String(TRUCK + 400), { mountOdo: MOUNT, truckOdo: TRUCK });
ok("a day's driving past the truck's sync is allowed quietly",
  !ahead.stop && ahead.say === "", ahead);
const fat = checkOffOdo("1518590", { mountOdo: MOUNT, truckOdo: TRUCK });
ok("a fat-fingered extra digit is allowed but questioned",
  !fat.stop && /check the digits/.test(fat.say), fat);

console.log("\na figure that is simply right says nothing at all:");
const fine = checkOffOdo(String(TRUCK), { mountOdo: MOUNT, truckOdo: TRUCK });
ok("no stop", !fine.stop);
ok("no sentence", fine.say === "", fine);

console.log("\nthe miles it books, shown while it is typed:");
ok("the distance between the two readings", milesOff(String(TRUCK), MOUNT) === 1238);
ok("zero when they are the same", milesOff(String(MOUNT), MOUNT) === 0);
ok("nothing when it would be negative", milesOff("150000", MOUNT) === null);
ok("nothing without a mount figure", milesOff("150000", null) === null);
ok("nothing without a figure", milesOff("", MOUNT) === null);

console.log("\nthe same column, written the other way — a move that displaces a tire:");
/* The displaced tire comes off at the move's odometer, so the figure
   that cannot be right on a pull cannot be right here either. */
const other = { onOdo: 100000, brand: "Continental" };
ok("a move is fine when the odometer is past the displaced tire's mount",
  checkMove("4RO", "4LO", { other, mode: REPLACE, offDate: "2026-09-30", offOdo: "110000" }) === "");
ok("…and refused when it is before it",
  checkMove("4RO", "4LO", { other, mode: REPLACE, offDate: "2026-09-30", offOdo: "90000" }) !== "",
  checkMove("4RO", "4LO", { other, mode: REPLACE, offDate: "2026-09-30", offOdo: "90000" }));
ok("…naming the wheel, since two tires are in play",
  /4LO/.test(checkMove("4RO", "4LO", { other, mode: REPLACE, offDate: "2026-09-30", offOdo: "90000" })));
/* A move with no odometer books no miles. That is what it did before
   and it is a different question from a figure that contradicts
   itself — worth not breaking a working flow over. */
ok("a blank odometer is still allowed, as it was",
  checkMove("4RO", "4LO", { other, mode: REPLACE, offDate: "2026-09-30", offOdo: "" }) === "");
ok("a swap is not judged — nothing comes off",
  checkMove("4RO", "4LO", { other, mode: SWAP, offDate: "2026-09-30", offOdo: "90000" }) === "");
ok("an empty wheel is not judged either",
  checkMove("4RO", "4LO", { other: null, mode: REPLACE, offDate: "2026-09-30", offOdo: "90000" }) === "");
console.log("\n…and the checks that were there before still are:");
ok("no destination", checkMove("4RO", "", {}) !== "");
ok("the same wheel", checkMove("4RO", "4RO", {}) !== "");
ok("no date on the tire coming off",
  checkMove("4RO", "4LO", { other, mode: REPLACE, offDate: "" }) !== "");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
