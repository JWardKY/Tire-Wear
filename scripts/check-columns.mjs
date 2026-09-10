/* Every column the app asks for, against every column the database has.
   ─────────────────────────────────────────────────────────────────
   The Now board shipped selecting tw_hours.job_location, which did not
   exist. Nothing caught it: `npm run build` does not read SQL, and the
   browser test's fake database answered the query regardless. The first
   person to find out was Jason, from an error banner.

   This walks every `.from("t").select("a,b")` and `fetchAll("t", "a,b")`
   in src/ and netlify/ and checks each column against the real schema.
   It is the cheap version of the check — no browser, no fixtures — and
   it covers every screen at once rather than the ones a test happens to
   open.

     node scripts/check-columns.mjs           # against the committed map
     node scripts/check-columns.mjs --write   # refresh the map from the DB
                                              # (needs VITE_SUPABASE_*)
*/
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MAP = new URL("./schema-columns.json", import.meta.url);
const write = process.argv.includes("--write");

/* ── Refresh the map ─────────────────────────────────────────────
   Asks PostgREST for one row of every table it knows, which is the
   only schema read the anon key is allowed. A table the key cannot
   reach at all keeps whatever the map already says. */
if (write) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("--write needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
    process.exit(2);
  }
  const doc = JSON.parse(readFileSync(MAP, "utf8"));
  let changed = 0, unreachable = [];
  for (const t of Object.keys(doc.tables)) {
    const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) { unreachable.push(t); continue; }
    const rows = await r.json();
    /* One row only names the columns it has; a table that is empty, or
       whose row has nulls, tells us nothing new. Keep what we had. */
    if (!rows.length) { unreachable.push(`${t} (empty)`); continue; }
    const cols = Object.keys(rows[0]).sort();
    if (JSON.stringify(cols) !== JSON.stringify(doc.tables[t])) {
      doc.tables[t] = cols; changed++;
    }
  }
  writeFileSync(MAP, JSON.stringify(doc, null, 2) + "\n");
  console.log(`${changed} table(s) updated.`);
  if (unreachable.length) {
    console.log(`Left as they were (no readable row): ${unreachable.join(", ")}`);
  }
}

const SCHEMA = JSON.parse(readFileSync(MAP, "utf8")).tables;

/* ── Walk the source ─────────────────────────────────────────── */
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); }
    else if (/\.(js|jsx|mjs)$/.test(e.name)) files.push(p);
  }
};
walk("src"); walk("netlify");

const bad = [];
const seen = new Set();

const check = (table, cols, file, line) => {
  /* A select with an embedded resource or a star is not this check's
     business — the column names inside one are not plain. */
  if (cols.includes("*") || cols.includes("(")) return;
  if (!SCHEMA[table]) return;                 // unknown table, not judged
  for (const raw of cols.split(",")) {
    const col = raw.trim().split(":").pop().trim();
    if (!col) continue;
    const k = `${table}.${col}`;
    if (SCHEMA[table].includes(col) || seen.has(k)) continue;
    seen.add(k);
    bad.push({ table, col, file, line });
  }
};

for (const f of files) {
  const s = readFileSync(f, "utf8");
  const lineOf = (i) => s.slice(0, i).split("\n").length;

  for (const m of s.matchAll(/\.from\(\s*"([a-z_0-9]+)"\s*\)/g)) {
    const tail = s.slice(m.index + m[0].length, m.index + m[0].length + 400);
    const sm = tail.match(/\.select\(\s*"([^"]*)"/);
    if (sm) check(m[1], sm[1], f, lineOf(m.index));
  }
  for (const m of s.matchAll(/fetchAll\(\s*\n?\s*"([a-z_0-9]+)"\s*,\s*\n?\s*"([^"]*)"/g)) {
    check(m[1], m[2], f, lineOf(m.index));
  }
}

if (!bad.length) {
  console.log(`all ${files.length} source files check out against ${
    Object.keys(SCHEMA).length} tables`);
  process.exit(0);
}
console.log(`${bad.length} column(s) the database does not have:\n`);
for (const b of bad) console.log(`  !!  ${b.table}.${b.col}  —  ${b.file}:${b.line}`);
console.log("\nEither the column name is wrong or the schema change was never applied.");
console.log("If the database has it and this map does not, refresh with --write.");
process.exit(1);
