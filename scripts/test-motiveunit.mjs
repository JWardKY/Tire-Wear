/* Motive's fleet, turned into units.
   ─────────────────────────────────────────────────────────────────
   Motive keeps two lists and the app has one. Vehicles are the things
   with an ELD in the cab; assets are everything else it watches with a
   gateway. The app had only ever taken the first, which left 76
   pickups and every piece of yard and paving plant out of a system the
   shop books hours, defects, PM and parts against.

   Three things make the import more than a copy, and all three are
   here because the real data does them:

   The number is buried in the name. A vehicle is "DT-890"; an asset is
   "T-674 Asphalt Tanker", "HT-119 Water Truck", or "T-673- Asphalt
   Tanker" with a stray dash.

   The two lists overlap. Nine trucks are in Motive as a vehicle AND as
   an asset — somebody put a gateway on a truck that already had an ELD.
   Import both and the shop gets two HT-643s, with half the hours on
   each.

   And a paver has no tires this app can follow. Every unit must declare
   an axle layout, and the shortest was four tires, so an arrow board
   would arrive claiming four wheels and sit on the Tires page reading
   0 of 4 forever.

   Needs nothing: no database, no Motive.
*/
import {
  unitNumber, prefixOf, divisionFor, configFor, tidyName, planImport,
} from "../src/motiveUnit.js";

let bad = 0;
const ok = (l, v, got) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${l}${!v && got !== undefined ? `\n        got: ${JSON.stringify(got)}` : ""}`);
};

console.log("the number out of whatever Motive calls it:");
/* Every one of these is a real name off the asset list. */
for (const [name, want] of [
  ["DT-890", "DT-890"],
  ["T-674 Asphalt Tanker", "T-674"],
  ["HT-119 Water Truck ", "HT-119"],
  ["AB-11 Arrow board ", "AB-11"],
  ["TC-473 Trench Compacter ", "TC-473"],
  ["LP-1086 Light Plant ", "LP-1086"],
  ["HT-321 (BBQ Grease Truck Pickup)", "HT-321"],
]) ok(`${JSON.stringify(name)} → ${want}`, unitNumber(name) === want, unitNumber(name));
/* The one with a dash where a space should be. Left alone it would be
   a second trailer called "T-673-" beside the real T-673. */
ok('"T-673- Asphalt Tanker" loses the stray dash', unitNumber("T-673- Asphalt Tanker") === "T-673");
ok("a lowercase number is still the same unit", unitNumber("ht-1234") === "HT-1234");
ok("nothing in, nothing out", unitNumber("") === "" && unitNumber(null) === "");

console.log("\nwhich fleet it belongs to:");
for (const [num, div] of [
  ["DT-890", "DT"], ["HT-643", "HT"], ["LT-1487", "LT"],
  ["T-674", "EQ"], ["AB-11", "EQ"], ["F-1249", "EQ"], ["MM-999", "EQ"],
  ["RL-1048", "EQ"], ["RB-777", "EQ"], ["LP-646", "EQ"], ["CT-1520", "EQ"],
  ["A-82", "OT"], ["ZZ-1", "OT"], ["", "OT"],
]) ok(`${num || "(blank)"} → ${div}`, divisionFor(num) === div, divisionFor(num));

console.log("\nand what it runs on:");
ok("a dump truck", configFor("DT-890") === "dump12");
ok("a haul truck", configFor("HT-643") === "single6");
ok("a pickup", configFor("LT-1487") === "light4");
ok("a tanker — eight tires, no steer", configFor("T-674") === "trailer8");
/* The whole reason this exists. A paver on tracks cannot be given a
   truck's axle layout just because the column demands one. */
ok("a paver is not given wheels", configFor("F-1249") === "notires");
ok("nor is an arrow board", configFor("AB-11") === "notires");
ok("nor a milling machine", configFor("MM-999") === "notires");
ok("nor a backhoe — its tires wear by the hour, not the mile",
  configFor("RL-1048") === "notires");
ok("something unheard of gets the smallest honest guess",
  configFor("ZZ-9") === "light4");
ok("prefix of a bare number is nothing", prefixOf("1234") === "");

console.log("\nmakes typed in a hurry:");
/* All four are real: Motive's make box takes whatever is typed. */
ok("shouting is calmed down", tidyName("CHEVROLET") === "Chevrolet");
ok("mumbling is picked up", tidyName("intl") === "Intl");
ok("a name already cased is left alone", tidyName("LeeBoy") === "LeeBoy");
ok("…including two words", tidyName("Magnum Pro") === "Magnum Pro");
ok("blank stays blank", tidyName("  ") === null && tidyName(null) === null);
/* A misspelling is somebody's data, not ours to correct. */
ok("a typo is left as typed", tidyName("Etnyte") === "Etnyte");

/* ── the plan ─────────────────────────────────────────────────── */
const veh = (id, number, over = {}) =>
  ({ id, number, status: "active", make: "Kenworth", model: "T880", year: "2020", ...over });
const ass = (id, name, over = {}) =>
  ({ id, name, status: "active", type: "other", make: "Cat", model: "X", year: "2020", ...over });

console.log("\na plain import:");
let p = planImport({
  vehicles: [veh(1, "LT-1487"), veh(2, "DT-890")],
  assets: [ass(9, "AB-11 Arrow board ")],
  have: [{ number: "DT-890", motiveVehicleId: 2 }],
});
ok("the new pickup is added", p.add.some((a) => a.number === "LT-1487"));
ok("the arrow board is added", p.add.some((a) => a.number === "AB-11"));
ok("the truck already linked is left alone",
  p.skip.some((s) => s.number === "DT-890" && s.why === "already linked"));
ok("nothing else was touched", p.add.length === 2 && p.link.length === 0, p);
ok("a pickup carries its Motive vehicle id",
  p.add.find((a) => a.number === "LT-1487").motiveVehicleId === 1);
ok("…and no asset id", p.add.find((a) => a.number === "LT-1487").motiveAssetId === null);
ok("equipment carries its asset id instead",
  p.add.find((a) => a.number === "AB-11").motiveAssetId === 9
  && p.add.find((a) => a.number === "AB-11").motiveVehicleId === null);

console.log("\nthe overlap — nine trucks are in both Motive lists:");
/* HT-643 really is both. The vehicle has the odometer feed behind it,
   so the vehicle wins and the asset is dropped by name. */
p = planImport({
  vehicles: [veh(10, "HT-643")],
  assets: [ass(11, "HT-643", { type: "dump_tipper" })],
  have: [],
});
ok("one unit, not two", p.add.length === 1, p.add.map((a) => a.number));
ok("…and it is the vehicle that survives", p.add[0].motiveVehicleId === 10);
ok("…with the asset said out loud, not dropped in silence",
  p.skip.some((s) => s.number === "HT-643" && /vehicle list/.test(s.why)),
  p.skip);

console.log("\n…and the same truck already in the app:");
p = planImport({
  vehicles: [veh(10, "HT-643")],
  assets: [ass(11, "HT-643")],
  have: [{ number: "HT-643", motiveVehicleId: 10 }],
});
ok("nothing is added twice", p.add.length === 0, p.add);

console.log("\nthe unit somebody typed in before the sync existed:");
/* A-82 is in the app with no Motive id. Linking beats failing on the
   unique number, and its division and layout are left as chosen. */
p = planImport({
  vehicles: [veh(20, "A-82", { make: "RAM", model: "1500" })],
  assets: [],
  have: [{ number: "A-82", motiveVehicleId: null }],
});
ok("it is linked, not added", p.link.length === 1 && p.add.length === 0, p);
ok("…to the right Motive id", p.link[0].motiveVehicleId === 20);
ok("…and not linked twice on a second run",
  planImport({ vehicles: [veh(20, "A-82")], assets: [],
               have: [{ number: "A-82", motiveVehicleId: 20 }] }).link.length === 0);

console.log("\nwhat never comes in:");
p = planImport({
  vehicles: [veh(30, "DT-805", { status: "deactivated" })],
  assets: [ass(31, "T-920", { status: "deactivated" }), ass(32, "   ")],
  have: [],
});
ok("a truck Motive has retired", p.add.length === 0, p.add);
ok("…and it says why",
  p.skip.filter((s) => /not active/.test(s.why)).length === 2, p.skip);
ok("a row with no number at all is refused, not guessed at",
  p.skip.some((s) => s.why === "no unit number on it"), p.skip);

console.log("\ntwo Motive rows claiming one number:");
/* LT-1394 and LT-1395 are each a vehicle and an asset. Whichever came
   first wins and the second is named. */
p = planImport({ vehicles: [], assets: [ass(40, "LT-1395"), ass(41, "LT-1395 spare")], have: [] });
ok("only one is added", p.add.length === 1, p.add.map((a) => a.number));
ok("…and the other is reported",
  p.skip.some((s) => /two Motive asset rows/.test(s.why)), p.skip);

console.log("\nrunning it twice adds nothing the second time:");
const vehicles = [veh(50, "LT-1"), veh(51, "DT-2")];
const assets = [ass(52, "AB-9 Arrow board")];
const first = planImport({ vehicles, assets, have: [] });
const after = first.add.map((a) => ({ number: a.number, motiveVehicleId: a.motiveVehicleId }));
const second = planImport({ vehicles, assets, have: after });
ok("first run adds three", first.add.length === 3, first.add.length);
ok("second run adds none", second.add.length === 0, second.add);
ok("…and links none", second.link.length === 0, second.link);

console.log("\nthe description Motive carries beside the number:");
p = planImport({ vehicles: [], assets: [
  ass(60, "T-674 Asphalt Tanker", { type: "tanker" }),
  ass(61, "LP-646", { custom_type: "Light plant " }),
  ass(62, "RB-777", { type: "construction" }),
], have: [] });
const note = (n) => p.add.find((a) => a.number === n).notes;
ok("kept when it says something", note("T-674") === "Asphalt Tanker", note("T-674"));
ok("…taken from the type when the name is bare", note("LP-646") === "Light plant", note("LP-646"));
ok("…and not repeated when the two agree", note("RB-777") === "construction", note("RB-777"));

console.log("\nevery row is accounted for:");
const all = planImport({
  vehicles: [veh(70, "DT-1"), veh(71, "DT-2", { status: "deactivated" })],
  assets: [ass(72, "AB-1"), ass(73, "DT-1")],
  have: [],
});
ok("added + linked + skipped is every row in",
  all.add.length + all.link.length + all.skip.length === 4,
  { add: all.add.length, link: all.link.length, skip: all.skip.length });
ok("and no skip is silent", all.skip.every((s) => s.why && s.why.length > 0), all.skip);

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
