/* Points at a deployed motive-sync endpoint and reports what it says.
   Dry run by default — it asks the function what it WOULD do and writes
   nothing.

   The interesting part is the field check. Motive gives two odometers and
   the app's wear maths only works if we take the one our existing typed-in
   readings are in. This prints both against what we already hold, so the
   choice is made on evidence.

   Run:
     SYNC_URL=https://allenhaul.netlify.app SYNC_TOKEN=... node scripts/check-motive.mjs
     ... node scripts/check-motive.mjs --write        (actually sync)
     ... node scripts/check-motive.mjs --since 2026-07-28
*/
const base = process.env.SYNC_URL;
const token = process.env.SYNC_TOKEN;
if (!base || !token) {
  console.error("Set SYNC_URL and SYNC_TOKEN.");
  process.exit(2);
}
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };

const url = new URL("/.netlify/functions/motive-sync", base);
if (flag("--write")) url.searchParams.set("write", "1");
if (val("--since")) url.searchParams.set("since", val("--since"));
if (val("--what")) url.searchParams.set("what", val("--what"));
if (val("--field")) url.searchParams.set("field", val("--field"));

console.log((flag("--write") ? "WRITING via " : "Dry run against ") + url.pathname + url.search + "\n");
const res = await fetch(url, { headers: { "X-Sync-Token": token } });
const body = await res.json().catch(() => null);
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

const o = body.odometer, d = body.defects;

if (o) {
  console.log("ODOMETER");
  console.log(`  Motive returned      ${o.motiveReturned} vehicles`);
  console.log(`  we have              ${o.ourVehicles}`);
  console.log(`  would write          ${o.wouldWrite}` + (o.written != null ? `  → wrote ${o.written}` : ""));
  if (o.skippedAsDuplicate) console.log(`  already had          ${o.skippedAsDuplicate}`);
  if (o.noReading) console.log(`  no reading at all    ${o.noReading}`);
  if (o.unmatched?.length) {
    console.log(`  !! in Motive but not in our fleet: ${o.unmatched.length}`);
    for (const u of o.unmatched.slice(0, 10)) console.log(`       ${u.number} (motive id ${u.motiveId})`);
  }
  if (o.backwards?.length) {
    console.log(`  !! REFUSED, reading went backwards: ${o.backwards.length}`);
    for (const b of o.backwards.slice(0, 10))
      console.log(`       ${b.unit}: we have ${b.weHave}, Motive says ${b.motiveSays}`);
  }
  if (o.fieldCheck?.length) {
    console.log(`\n  Which Motive field matches the readings people typed in?`);
    console.log(`  ${"unit".padEnd(10)}${"ours".padStart(10)}${"odometer".padStart(12)}` +
                `${"off by".padStart(10)}${"true_odo".padStart(12)}${"off by".padStart(11)}`);
    for (const r of o.fieldCheck)
      console.log("  " + String(r.unit).padEnd(10) + String(r.weHave).padStart(10) +
        String(r.odometer ?? "-").padStart(12) + String(r.offBy ?? "-").padStart(10) +
        String(r.trueOdometer ?? "-").padStart(12) + String(r.trueOffBy ?? "-").padStart(11));
    const near = (xs) => xs.filter((n) => n != null && Math.abs(n) < 5000).length;
    const a = near(o.fieldCheck.map((r) => r.offBy));
    const b = near(o.fieldCheck.map((r) => r.trueOffBy));
    console.log(`\n  within 5,000 miles of ours:  odometer ${a}   true_odometer ${b}`);
    console.log(`  → ${a >= b ? "odometer" : "true_odometer"} is the one to use` +
                (a === b ? " (tied — look at the numbers yourself)" : ""));
  }
  console.log("");
}

if (d) {
  console.log("DEFECTS");
  console.log(`  since                ${d.since}`);
  console.log(`  Motive returned      ${d.motiveReturned}`);
  console.log(`  would create         ${d.wouldCreate}` + (d.created != null ? `  → created ${d.created}` : ""));
  console.log(`  would bump a repeat  ${d.wouldBump}` + (d.bumped != null ? `  → bumped ${d.bumped}` : ""));
  console.log(`  already had          ${d.alreadyHave}`);
  for (const s of d.sample || [])
    console.log(`       ${s.unit}  ${s.category || "(no category)"}  ${s.safety}  ${s.on}`);
}
