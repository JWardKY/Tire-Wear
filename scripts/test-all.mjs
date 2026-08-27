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
  ["test-tires", "tread, mounting, pulling, wear rates"],
  ["test-shop", "defects and PM"],
  ["test-pins", "PIN plumbing — the security properties"],
  ["test-timecards", "time entries and the hours rollup"],
  ["test-parts", "stock, movements, CSV import"],
  ["test-setup", "the roster and the cost-code paste"],
  ["test-now", "the punch clock and the Now board"],
  ["check-anon-access", "what the anon key can reach"],
];

let failed = [];
for (const [name, what] of SUITES) {
  const r = spawnSync(process.execPath, [`scripts/${name}.mjs`], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const n = (out.match(/ {2}ok {2}/g) || []).length;
  if (r.status === 0) {
    console.log(`  PASS  ${name.padEnd(18)} ${String(n).padStart(3)} checks   ${what}`);
  } else {
    console.log(`  FAIL  ${name.padEnd(18)} exit ${r.status}   ${what}`);
    console.log(out.split("\n").filter((l) => l.trim()).slice(-12)
                   .map((l) => "        " + l).join("\n"));
    failed.push(name);
  }
}

console.log(failed.length
  ? `\n${failed.length} suite(s) failed: ${failed.join(", ")}`
  : "\nall suites passed");
process.exit(failed.length ? 1 : 0);
