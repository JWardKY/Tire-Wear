/* Reading a Continental ContiConnect tyre-pressure export: the file
   itself, working out which column is which, and deciding what an
   import would record — all without touching the database.

   Nothing here writes anything. planPressures returns a description of
   the change and data.savePressures is what carries it out. Same shape
   as csvImport.js, for the same reason: a weekly file that silently
   rewrites the fleet is not something to run blind.

   The rule that drives the whole thing: a pressure is only recorded
   against a tire we already have entered. A truck whose tires have not
   been entered yet is counted and shown, never guessed at. */

/* ContiConnect exports roughly forty columns and three of them are a
   pressure. Getting that wrong is not a cosmetic mistake — cold
   inflation pressure is the target, compensated pressure is the reading
   corrected to a reference temperature, and only the non-compensated
   one is what the gauge would read at the wheel right now.

   So the pressure column is matched strictly. If none of these hit, the
   field is left unmapped and the screen asks for it, rather than
   quietly filing the target pressure as a measurement. */
const PSI_HINTS = [
  "pressure (non-compensated)",
  "pressure non-compensated",
  "non-compensated pressure",
  "non compensated pressure",
  "actual pressure",
  "measured pressure",
];

const FIELD_HINTS = {
  truck: ["vehicle name", "vehicle", "asset name", "asset", "unit", "unit number",
    "truck", "vehicle number", "name"],
  pos: ["tyre position", "tire position", "position", "wheel position", "wheel"],
  status: ["status", "tyre status", "tire status", "alert", "alert status", "pressure status"],
};

const norm = (s) => String(s || "").trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");

/* Truck numbers are written three ways in one file — "DT 864",
   "DT-1807", "DT1800" — and one way on our side. Strip everything that
   is not a letter or a digit and they all land on the same key. */
export const truckKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const posKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* The export comes out of the browser as a tab-separated paste and out
   of Excel as a comma-separated file. Sniff the header line rather than
   demanding one or the other — whichever delimiter appears more often
   outside quotes is the one in use. */
export function sniffDelimiter(text) {
  const head = String(text).replace(/\r\n?/g, "\n").split("\n")[0] || "";
  let tabs = 0, commas = 0, quoted = false;
  for (const ch of head) {
    if (ch === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (ch === "\t") tabs++;
    else if (ch === ",") commas++;
  }
  return tabs > commas ? "\t" : ",";
}

/* Quoted fields, doubled quotes, and the delimiter inside quotes. Same
   reader as csvImport.parseCSV, taught the delimiter — the tyre export
   has commas inside vehicle names and tabs between columns, and a
   reader that only knew commas would shred it. */
export function parseDelimited(text, delim) {
  const d = delim || sniffDelimiter(text);
  const rows = [];
  let row = [], cell = "", quoted = false;
  const s = String(text).replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === d) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }

  const cleaned = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!cleaned.length) return { headers: [], rows: [], delim: d };

  /* ContiConnect repeats a header name across columns ("Status" shows up
     for the sensor and again for the vehicle). Number the repeats so a
     mapping can name exactly one of them. */
  const seen = new Map();
  const headers = cleaned[0].map((h) => {
    const base = String(h).trim() || "(unnamed)";
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });

  return {
    headers,
    delim: d,
    rows: cleaned.slice(1).map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))),
  };
}

/* Exact matches first across every field, then fuzzy — the same two-pass
   rule csvImport learned the hard way, so a short hint like "wheel"
   cannot eat a column that belongs to another field. */
export function guessMapping(headers) {
  const out = {};
  const used = new Set();

  const take = (field, test) => {
    if (out[field]) return;
    const hit = headers.find((h) => !used.has(h) && test(norm(h)));
    if (hit) { out[field] = hit; used.add(hit); }
  };

  /* Pressure is matched on its own, strictly, and before anything else
     can claim the column. */
  take("psi", (h) => PSI_HINTS.includes(h));
  take("psi", (h) => h.includes("non compensated") || h.includes("noncompensated"));

  for (const [field, hints] of Object.entries(FIELD_HINTS))
    take(field, (h) => hints.includes(h));

  for (const [field, hints] of Object.entries(FIELD_HINTS)) {
    const ordered = [...hints].sort((a, b) => b.length - a.length);
    take(field, (h) => ordered.some((x) => h.includes(x)));
  }

  return out;
}

const psiOf = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/* Work out what the file would record, WITHOUT recording it.

   `mounted` is every tire currently on a truck: { id, veh, pos }. A row
   is only ever matched to one of those. Everything else is sorted into
   a reason so the screen can say why a wheel was left alone, which is
   the whole point of importing a file you did not write. */
export function planPressures(rows, mapping, mounted) {
  const byKey = new Map();
  const trucksWithTires = new Set();
  for (const t of mounted) {
    byKey.set(`${truckKey(t.veh)}|${posKey(t.pos)}`, t);
    trucksWithTires.add(truckKey(t.veh));
  }

  const plan = {
    record: [],      // matched a mounted tire and carries a pressure
    noReading: [],   // matched a tire, but the sensor reported nothing
    noTire: [],      // truck is entered, that wheel is not
    noTruck: [],     // truck has no tires entered at all — skipped whole
    bad: [],         // unreadable row
  };
  const skippedTrucks = new Map();

  rows.forEach((r, i) => {
    const line = i + 2;
    const truck = String((mapping.truck ? r[mapping.truck] : "") || "").trim();
    const pos = String((mapping.pos ? r[mapping.pos] : "") || "").trim();
    const status = String((mapping.status ? r[mapping.status] : "") || "").trim();
    const psi = psiOf(mapping.psi ? r[mapping.psi] : null);

    if (!truck) { plan.bad.push({ line, why: "no truck number" }); return; }
    if (!pos) { plan.bad.push({ line, why: `no wheel position (${truck})` }); return; }
    if (psi != null && (psi < 0 || psi > 250)) {
      plan.bad.push({ line, why: `${truck} ${pos} — ${psi} psi is not a reading` });
      return;
    }

    const tk = truckKey(truck);
    if (!trucksWithTires.has(tk)) {
      skippedTrucks.set(truck, (skippedTrucks.get(truck) || 0) + 1);
      return;
    }

    const tire = byKey.get(`${tk}|${posKey(pos)}`);
    if (!tire) { plan.noTire.push({ truck, pos, psi, status }); return; }
    if (psi == null) { plan.noReading.push({ truck, pos, status, tireId: tire.id }); return; }

    plan.record.push({ tireId: tire.id, truck: tire.veh, pos: tire.pos, psi, status });
  });

  plan.noTruck = [...skippedTrucks.entries()]
    .map(([truck, wheels]) => ({ truck, wheels }))
    .sort((a, b) => (a.truck < b.truck ? -1 : 1));

  /* The same tire twice in one file would fail the unique index on the
     way in. Last row wins, and the screen is told it happened. */
  const once = new Map();
  for (const e of plan.record) once.set(e.tireId, e);
  plan.duplicates = plan.record.length - once.size;
  plan.record = [...once.values()];

  return plan;
}
