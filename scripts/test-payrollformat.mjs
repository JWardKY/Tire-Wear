/* The payroll CSV, against the workbook it has to match.
   ─────────────────────────────────────────────────────────────────
   Vista's import maps on the header row, so the column order and the
   spelling are not ours to tidy. And there are two shapes of row —
   equipment work costs through the equipment module, shop work through
   job phases — so filling both halves would double-charge the hour.

   Rather than assert against what I believed the format to be, this
   takes rows straight out of Jason's own detail review (read out of the
   PDF by its column rules, in scripts/fixtures/payroll-workbook.json),
   rebuilds each one through the real export code, and diffs all sixteen
   columns. If Vista changes the report, replace the fixture.

   Needs nothing: no database, no browser.
     node scripts/test-payrollformat.mjs
*/
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

/* Run in the shop's timezone, not the machine's.
   ─────────────────────────────────────────────────────────────────
   This is not tidiness. The date columns are the one place a timezone
   bug hides in plain sight: `new Date("2026-09-01")` is UTC midnight,
   which in Eastern is 8/31 — a Tuesday's hours landing on Monday, and
   on the wrong week when the 1st is a Monday.

   The container this runs in is UTC, where that bug looks correct. It
   was caught only by deliberately reintroducing it and noticing the
   test still passed. So the process re-execs itself under Eastern
   before asserting anything about a date. */
if (!process.env.TZ) {
  const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], {
    stdio: "inherit", env: { ...process.env, TZ: "America/New_York" },
  });
  process.exit(r.status ?? 1);
}

import {
  PAYROLL_COLUMNS, payrollRow, DETAIL_COLUMNS, detailRow,
} from "../src/payrollFormat.js";

const FIX = JSON.parse(readFileSync(
  new URL("./fixtures/payroll-workbook.json", import.meta.url), "utf8"));

let bad = 0;
const ok = (label, v, note) => {
  if (!v) bad++;
  console.log(`  ${v ? "ok" : "!!"}  ${label}${note && !v ? `\n        ${note}` : ""}`);
};

/* ── The header row is the contract ──────────────────────────── */
const WANT = ["Employee", "EMPLOYEE NAME", "GROUP", "Work Date", "Hours",
  "EARN CODE", "Job", "JOB NAME", "Phase", "PHASE NAME", "Equipment",
  "EQ DESCRIPTION", "Cost Code", "EM COST CODE", "Class", "CLASS NAME"];
ok("the header is the workbook's, column for column",
   JSON.stringify(PAYROLL_COLUMNS) === JSON.stringify(WANT),
   `ours: ${PAYROLL_COLUMNS.join(",")}`);

/* ── Each row of the workbook, rebuilt ───────────────────────── */
/* What tw_payroll_lines hands the export, derived from the workbook row
   the same way the view derives it from an hour: the view decides which
   costing path a row is on by whether there is a truck behind it, and
   blanks the other half. */
const asViewRow = (w) => {
  const [m, d, y] = w["Work Date"].split("/");
  const onEquipment = !!w.Equipment;
  return {
    empNo: w.Employee, mechanic: w["EMPLOYEE NAME"], payGroup: w.GROUP,
    date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    hours: Number(w.Hours) || 0,
    jobNumber: w.Job,
    jobName: onEquipment ? "" : w["JOB NAME"],
    phase: onEquipment ? "" : w.Phase,
    phaseName: onEquipment ? "" : w["PHASE NAME"],
    equipment: w.Equipment, eqDescription: w["EQ DESCRIPTION"],
    costCode: onEquipment ? w["Cost Code"] : "",
    costCodeName: onEquipment ? w["EM COST CODE"] : "",
    payClass: w.Class, payClassName: w["CLASS NAME"],
  };
};

console.log("\nrebuilding each workbook row:");
for (const w of FIX.rows) {
  const want = WANT.map((h) =>
    h === "Hours" ? (Number(w.Hours) || 0).toFixed(2)
    : h === "EARN CODE" ? "Regular"
    : (w[h] || ""));
  const mine = payrollRow(asViewRow(w)).map((v) => v == null ? "" : String(v));
  const diff = want
    .map((v, i) => (v === mine[i] ? null : `${WANT[i]}: workbook ${JSON.stringify(v)} · ours ${JSON.stringify(mine[i])}`))
    .filter(Boolean);
  const what = w.Equipment ? `${w["EQ DESCRIPTION"]} · ${w["EM COST CODE"]}`
                           : `${w["PHASE NAME"]} · ${w["JOB NAME"]}`;
  ok(`${w["EMPLOYEE NAME"]} — ${what}`, diff.length === 0, diff.join("\n        "));
}

/* ── The rules behind those rows, stated on their own ────────── */
console.log("\nthe rules, checked directly:");
const row = (over) => {
  const base = {
    empNo: "28896", mechanic: "Alexander T Oswald", payGroup: "PR CFS",
    date: "2026-08-31", hours: 3, jobNumber: "100710.", jobName: "",
    phase: "", phaseName: "", equipment: "", eqDescription: "",
    costCode: "", costCodeName: "", payClass: "710", payClassName: "Greaser",
  };
  const out = {};
  PAYROLL_COLUMNS.forEach((h, i) => { out[h] = payrollRow({ ...base, ...over })[i]; });
  return out;
};

const eq = row({ equipment: "10889", eqDescription: "DT-889",
                 costCode: "873", costCodeName: "Service",
                 jobName: "Clay's Ferry Shop", phase: "700300. .", phaseName: "Shop Work" });
ok("an equipment row leaves JOB NAME empty",
   eq["JOB NAME"] === "", `got ${JSON.stringify(eq["JOB NAME"])}`);
ok("an equipment row leaves Phase and PHASE NAME empty",
   eq.Phase === "" && eq["PHASE NAME"] === "");
ok("an equipment row keeps its cost code and name",
   eq["Cost Code"] === "873" && eq["EM COST CODE"] === "Service");

const shop = row({ jobName: "Clay's Ferry Shop", phase: "700300. .",
                   phaseName: "Shop Work", costCode: "SHOP-CF",
                   costCodeName: "Clays Ferry Shop" });
ok("a shop row keeps its job and phase",
   shop["JOB NAME"] === "Clay's Ferry Shop" && shop.Phase === "700300. ."
   && shop["PHASE NAME"] === "Shop Work");
ok("a shop row leaves both cost-code columns empty — filling them would\n      charge the hour twice, through the job and through the equipment",
   shop["Cost Code"] === "" && shop["EM COST CODE"] === "");
ok("a shop row leaves the equipment columns empty",
   shop.Equipment === "" && shop["EQ DESCRIPTION"] === "");

/* Dates: Vista wants M/D/YYYY, and a date-only string parsed as a Date
   is UTC midnight, which in Eastern is the day before. */
ok(`running in ${process.env.TZ} — the shop's own clock, where a UTC
      date bug actually shows`, process.env.TZ === "America/New_York");
ok("the date is M/D/YYYY with no leading zeros",
   row({ date: "2026-09-05" })["Work Date"] === "9/5/2026",
   `got ${row({ date: "2026-09-05" })["Work Date"]}`);
ok("and the first of the month does not slide back a day",
   row({ date: "2026-09-01" })["Work Date"] === "9/1/2026",
   `got ${row({ date: "2026-09-01" })["Work Date"]}`);

ok("hours always carry two decimals", row({ hours: 3 }).Hours === "3.00");
ok("and a quarter hour survives", row({ hours: 5.25 }).Hours === "5.25");
ok("every line is Regular — holiday and vacation pay are payroll's",
   row({}).EARN_CODE === undefined && row({})["EARN CODE"] === "Regular");

/* A mechanic with no payroll record yet. Blank, never invented: a made
   up employee number pays somebody else. */
const nobody = row({ empNo: "", payClass: "", payClassName: "", jobNumber: "" });
ok("a mechanic with no payroll record exports blanks, not guesses",
   nobody.Employee === "" && nobody.Class === "" && nobody.Job === ""
   && nobody["EMPLOYEE NAME"] === "Alexander T Oswald");

/* ── The detail file ─────────────────────────────────────────── */
console.log("\nthe detail export:");
ok("its header and its row are the same width",
   DETAIL_COLUMNS.length === detailRow({}).length,
   `${DETAIL_COLUMNS.length} headers, ${detailRow({}).length} cells`);
ok("it carries what payroll has no column for",
   ["Work order", "DVIR", "Parts used", "Work performed", "True clocked hours"]
     .every((h) => DETAIL_COLUMNS.includes(h)));

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
