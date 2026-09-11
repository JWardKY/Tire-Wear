/* The weekly TPMS import, against a real week's readings.
   ─────────────────────────────────────────────────────────────────
   The rule this file exists to hold: a pressure is only ever recorded
   against a tire already entered on the site. Get that wrong in either
   direction and it is quiet — too loose and the fleet grows tires
   nobody mounted; too tight and half the readings vanish without
   anyone being told why.

   scripts/fixtures/tpms-export.tsv carries the truck numbers, wheel
   positions, pressures and sensor statuses out of a real ContiConnect
   export — 688 rows across 58 trucks. The columns AROUND those four are
   reconstructed to the right shape and width, including the two decoy
   pressure columns, because the mapping is the part most likely to go
   wrong. Header spellings in an export we do not control are a guess,
   which is exactly why the screen lets a person re-map them; what is
   asserted here is that a wrong guess is left blank rather than filed
   as a reading.

   tpms-mounted.json is what we actually had entered when that file
   arrived: 332 tires on 28 trucks.

   Needs nothing: no database, no browser.
     node scripts/test-tpms.mjs
*/
import { readFileSync } from "node:fs";
import {
  sniffDelimiter, parseDelimited, guessMapping, planPressures, truckKey,
} from "../src/tpmsImport.js";

const here = new URL(".", import.meta.url).pathname;
const FILE = readFileSync(here + "fixtures/tpms-export.tsv", "utf8");
const MOUNTED = JSON.parse(readFileSync(here + "fixtures/tpms-mounted.json", "utf8"));

let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) console.log(`  ok   ${name}`);
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name, got, want) => ok(name, got === want, `got ${got}, wanted ${want}`);

/* ── Reading the file ─────────────────────────────────────────── */
console.log("\nReading the export");

eq("tab-separated is detected", sniffDelimiter(FILE), "\t");
eq("a comma file is still read as commas", sniffDelimiter("a,b,c\n1,2,3"), ",");

const p = parseDelimited(FILE);
eq("every row is read", p.rows.length, 688);
eq("every column is read", p.headers.length, 43);

/* A pasted export repeats header names. They have to stay tellable
   apart or a mapping cannot name one of them. */
const dup = parseDelimited("Status\tStatus\tPsi\nA\tB\t100");
ok("a repeated header is numbered, not collapsed",
  dup.headers.join("|") === "Status|Status (2)|Psi", dup.headers.join("|"));
eq("both repeated columns keep their value", dup.rows[0]["Status (2)"], "B");

/* Vehicle names carry commas. A reader that only knew commas would
   shred the row; one that ignores quotes inside a tab file would too. */
const quoted = parseDelimited('Vehicle\tPos\n"Allen, DT 864"\t1L');
eq("a comma inside a tab field survives", quoted.rows[0].Vehicle, "Allen, DT 864");

/* ── Finding the pressure column ──────────────────────────────── */
console.log("\nMapping the columns");

const m = guessMapping(p.headers);
eq("the truck column is found", m.truck, "Vehicle Name");
eq("the position column is found", m.pos, "Tyre position");
eq("the sensor status column is found", m.status, "Status");

/* The one that matters. Cold inflation pressure is the TARGET and
   compensated pressure is corrected to a reference temperature —
   filing either as a measurement would be wrong on every wheel and
   look perfectly reasonable on screen. */
eq("the non-compensated pressure is the one taken", m.psi, "Pressure (non-compensated)");
ok("the target pressure is not taken", m.psi !== "Cold inflation pressure");
ok("the compensated pressure is not taken", m.psi !== "Compensated Pressure");

/* And when none of them is recognisable, the field is left for a
   person rather than guessed at. */
const vague = guessMapping(["Vehicle", "Position", "Pressure", "PSI reading"]);
ok("an unrecognised pressure column is left unmapped", !vague.psi, vague.psi);
eq("…while the truck column is still guessed", vague.truck, "Vehicle");

/* ── What it would record ─────────────────────────────────────── */
console.log("\nPlanning the import");

const plan = planPressures(p.rows, m, MOUNTED);

eq("pressures to record", plan.record.length, 184);
eq("matched a tire but the sensor reported nothing", plan.noReading.length, 144);
eq("truck is entered, that wheel is not", plan.noTire.length, 12);
eq("trucks skipped for having no tires entered", plan.noTruck.length, 30);
eq("rows that could not be read", plan.bad.length, 0);

eq("every row is accounted for",
  plan.record.length + plan.noReading.length + plan.noTire.length + plan.bad.length +
  plan.noTruck.reduce((a, x) => a + x.wheels, 0),
  688);

/* The instruction in one assertion: nothing is recorded for a truck we
   have not entered tires for. */
const entered = new Set(MOUNTED.map((t) => truckKey(t.veh)));
ok("no reading lands on a truck we have not entered",
  plan.record.every((e) => entered.has(truckKey(e.truck))));

/* Every recorded reading names a tire that exists, at the position we
   have it at — not the position as the export spelled it. */
const byId = new Map(MOUNTED.map((t) => [t.id, t]));
ok("every reading names a tire we have",
  plan.record.every((e) => byId.has(e.tireId)));
ok("the position recorded is ours, not the file's",
  plan.record.every((e) => byId.get(e.tireId).pos === e.pos));
ok("the truck recorded is ours, not the file's",
  plan.record.every((e) => byId.get(e.tireId).veh === e.truck));
ok("our truck numbers never carry the export's spacing",
  plan.record.every((e) => !/\s/.test(e.truck)));

/* Truck numbers arrive three ways in one file. */
const spaced = plan.record.filter((e) => e.truck === "DT-864");
ok("'DT 864' is matched to DT-864", spaced.length > 0, `${spaced.length} rows`);

/* The skipped list is what tells somebody which trucks to enter next,
   so it has to name them and count their wheels. */
const skipped = Object.fromEntries(plan.noTruck.map((x) => [x.truck, x.wheels]));
ok("a skipped truck is named", "HT 1119" in skipped, Object.keys(skipped).slice(0, 4).join(","));
ok("a skipped truck's wheels are counted", skipped["HT 1119"] > 0);
ok("no skipped truck has tires entered",
  plan.noTruck.every((x) => !entered.has(truckKey(x.truck))));

/* ── The awkward rows ─────────────────────────────────────────── */
console.log("\nRows that are not straightforward");

const mini = [
  { V: "DT-881", P: "1L", X: "108", S: "No alerts" },
  { V: "DT-881", P: "1L", X: "97", S: "Low pressure" },   // same wheel twice
  { V: "DT-881", P: "4RO", X: "", S: "Sensor defect" },   // no reading
  { V: "DT-881", P: "9ZZ", X: "100", S: "No alerts" },    // wheel we do not have
  { V: "", P: "1L", X: "100", S: "" },                    // no truck
  { V: "DT-881", P: "", X: "100", S: "" },                // no position
  { V: "DT-881", P: "1R", X: "900", S: "" },              // not a pressure
  { V: "HT 1119", P: "1L", X: "104", S: "No alerts" },    // truck not entered
];
const mm = { truck: "V", pos: "P", psi: "X", status: "S" };
const small = planPressures(mini, mm, MOUNTED);

eq("a wheel listed twice is recorded once", small.record.length, 1);
eq("…and the last reading wins", small.record[0].psi, 97);
eq("…and the screen is told it happened", small.duplicates, 1);
eq("a blank pressure is not recorded as zero", small.noReading.length, 1);
eq("a position we do not have is set aside", small.noTire.length, 1);
eq("a truck with no tires entered is skipped whole", small.noTruck.length, 1);
eq("unreadable rows are reported", small.bad.length, 3);

/* 0 psi is a flat tire, not a missing reading. Dropping it would hide
   the one wheel somebody needs to walk out and look at. */
const flat = planPressures(
  [{ V: "DT-864", P: "4RO", X: "0", S: "Very low pressure" }], mm, MOUNTED);
eq("0 psi is recorded, not swallowed", flat.record.length, 1);
eq("…as zero", flat.record[0].psi, 0);

/* Nothing entered at all: the file is read, and it records nothing. */
const nothing = planPressures(p.rows, m, []);
eq("with no tires entered, nothing is recorded", nothing.record.length, 0);
eq("…and every truck is reported as skipped", nothing.noTruck.length, 58);

console.log(failed ? `\n${failed} failed\n` : "\nAll good\n");
process.exit(failed ? 1 : 0);
