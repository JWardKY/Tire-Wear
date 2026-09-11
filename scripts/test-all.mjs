/* Runs every suite and believes the exit code, not the output.

   This exists because of a real mistake: the suites were being checked by
   grepping their output for "!!", and a cleanup failure does not print
   "!!" — it prints "CLEANUP DID NOT FINISH". So a run that left a row in
   the production database was read as clean. The scripts had said so
   plainly and the check could not see it.

   Run:
     set -a && . ./.env.local && set +a && node scripts/test-all.mjs
*/
import { spawnSync } from "node:child_process";

const SUITES = [
  ["test-motive", "Motive sync logic, on fixtures — needs no key"],
  ["test-identity", "who work gets recorded against — needs no key"],
  /* Both of these run without a key, and both exist because of the same
     mistake: the Now board shipped selecting a column that was not
     there. check-columns reads the source; test-nowboard drives the
     built app in a browser. It needs the app served first — see its
     header — and is skipped rather than failed when nothing answers. */
  ["check-columns", "every column the app selects, against the real schema"],
  ["test-payrollformat", "the payroll CSV against Jason's own workbook — needs no key"],
  ["test-dberror", "turning a database error into a sentence — needs no key"],
  ["test-tpms", "the weekly tire-pressure file, on a real week — needs no key"],
  ["test-nowboard", "the Now board in a real browser — needs the app served"],
  ["test-pressureboard", "the tire-pressure screen in a real browser — needs the app served"],
  ["test-tires", "tread, mounting, pulling, wear rates"],
  ["test-shop", "defects and PM"],
  ["test-pins", "PIN plumbing — the security properties"],
  ["test-timecards", "time entries and the hours rollup"],
  ["test-payroll", "the payroll export, the card board and the work log"],
  ["test-parts", "stock, movements, CSV import"],
  ["test-setup", "the roster and the cost-code paste"],
  ["test-now", "the punch clock and the Now board"],
  ["test-purchasing", "vendors, ordering, receiving, requests"],
  ["test-work", "work orders and the history view"],
  ["check-anon-access", "what the anon key can reach"],
];

/* A suite that could not run is not a suite that passed. Exit 0 would
   have counted a skip as a green tick, which is the same mistake as
   grepping the output for "!!" and calling a cleanup failure clean. 
   Exit 3 means "did not run", and it is reported as itself. */
const SKIP = 3;

let failed = [], skipped = [];
for (const [name, what] of SUITES) {
  const r = spawnSync(process.execPath, [`scripts/${name}.mjs`], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const n = (out.match(/ {2}ok {2}/g) || []).length;
  if (r.status === SKIP) {
    console.log(`  SKIP  ${name.padEnd(18)}             ${what}`);
    console.log(out.split("\n").filter((l) => l.trim())
                   .map((l) => "        " + l).join("\n"));
    skipped.push(name);
  } else if (r.status === 0) {
    console.log(`  PASS  ${name.padEnd(18)} ${String(n).padStart(3)} checks   ${what}`);
  } else {
    console.log(`  FAIL  ${name.padEnd(18)} exit ${r.status}   ${what}`);
    console.log(out.split("\n").filter((l) => l.trim()).slice(-12)
                   .map((l) => "        " + l).join("\n"));
    failed.push(name);
  }
}

if (skipped.length) {
  console.log(`\n${skipped.length} suite(s) did not run: ${skipped.join(", ")}`);
}
console.log(failed.length
  ? `\n${failed.length} suite(s) failed: ${failed.join(", ")}`
  : skipped.length
    ? "\nno suite failed, but the ones above did not run"
    : "\nall suites passed");
process.exit(failed.length ? 1 : 0);
