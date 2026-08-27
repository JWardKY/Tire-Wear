/* Reading a parts export: the CSV itself, working out which column is
   which, and deciding what an import would do — all without touching
   the database. Kept apart from partsData.js so it can be reasoned
   about, and tested, on its own.

   Nothing here writes anything. planImport returns a description of the
   change and partsData.runImport is what carries it out. */

/* Headers vary by whatever exported the file, so match on what the
   column is called rather than demanding an exact template. Anything
   unmatched is shown to the person importing rather than dropped
   quietly. */
const FIELD_HINTS = {
  num: ["part number", "part no", "part #", "partnum", "number", "num", "item", "sku"],
  name: ["description", "name", "part name", "item description"],
  shop: ["shop", "location", "warehouse", "site", "store"],
  category: ["category", "type", "group"],
  uom: ["uom", "unit", "unit of measure", "units"],
  onHand: ["on hand", "onhand", "qty", "quantity", "quantity on hand", "stock", "qty on hand"],
  allocated: ["allocated", "reserved", "committed"],
  onOrder: ["on order", "onorder", "ordered"],
  min: ["min", "minimum", "reorder point", "reorder", "min qty"],
  max: ["max", "maximum", "max qty", "order up to"],
  bin: ["bin", "location in shop", "shelf", "bin location"],
  cost: ["cost", "unit cost", "price", "unit price", "avg cost"],
  tags: ["tags", "tag", "notes", "note"],
};

const norm = (s) => String(s || "").trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");

/* Two passes, and the order matters. Every exact match is taken first,
   across all fields, before any fuzzy one — otherwise a short hint eats
   a column that belongs to another field. "Unit Cost" is the case that
   caught this: uom hints on "unit", and a single greedy pass filed the
   cost column as the unit of measure. */
export function guessMapping(headers) {
  const out = {};
  const used = new Set();

  for (const [field, hints] of Object.entries(FIELD_HINTS)) {
    const hit = headers.find((h) => !used.has(h) && hints.includes(norm(h)));
    if (hit) { out[field] = hit; used.add(hit); }
  }

  for (const [field, hints] of Object.entries(FIELD_HINTS)) {
    if (out[field]) continue;
    /* Longest hint first, so "unit of measure" beats "unit". */
    const ordered = [...hints].sort((a, b) => b.length - a.length);
    const hit = headers.find((h) => !used.has(h) && ordered.some((x) => norm(h).includes(x)));
    if (hit) { out[field] = hit; used.add(hit); }
  }

  return out;
}

/* A small CSV reader: quoted fields, doubled quotes, commas and
   newlines inside quotes. Enough for a spreadsheet export, and it
   avoids a dependency for one screen. */
export function parseCSV(text) {
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
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const cleaned = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!cleaned.length) return { headers: [], rows: [] };
  const headers = cleaned[0].map((h) => String(h).trim());
  return {
    headers,
    rows: cleaned.slice(1).map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))),
  };
}

const num = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/* Turn mapped CSV rows into what the import will do, WITHOUT doing it.
   The screen shows this and the person says yes — a stock import that
   silently rewrites 269 counts is not something to run blind. */
export function planImport(rows, mapping, existing, defaultShop) {
  const byKey = new Map(existing.map((p) => [`${p.num.toLowerCase()}|${p.shop.toLowerCase()}`, p]));
  const plan = { create: [], change: [], same: [], bad: [] };

  rows.forEach((r, i) => {
    const numField = mapping.num ? r[mapping.num] : "";
    const partNumber = String(numField || "").trim();
    const shop = String((mapping.shop ? r[mapping.shop] : "") || defaultShop || "").trim();
    const onHand = num(mapping.onHand ? r[mapping.onHand] : null);

    if (!partNumber) { plan.bad.push({ line: i + 2, why: "no part number" }); return; }
    if (!shop) { plan.bad.push({ line: i + 2, why: "no shop, and no default set" }); return; }
    if (onHand == null) { plan.bad.push({ line: i + 2, why: "no quantity on hand" }); return; }

    const fields = {
      num: partNumber, shop, onHand,
      name: mapping.name ? r[mapping.name] : "",
      category: mapping.category ? r[mapping.category] : "",
      uom: (mapping.uom ? r[mapping.uom] : "") || "each",
      allocated: num(mapping.allocated ? r[mapping.allocated] : null) ?? 0,
      onOrder: num(mapping.onOrder ? r[mapping.onOrder] : null) ?? 0,
      min: num(mapping.min ? r[mapping.min] : null),
      max: num(mapping.max ? r[mapping.max] : null),
      bin: mapping.bin ? r[mapping.bin] : "",
      cost: num(mapping.cost ? r[mapping.cost] : null),
      tags: mapping.tags ? r[mapping.tags] : "",
    };

    const found = byKey.get(`${partNumber.toLowerCase()}|${shop.toLowerCase()}`);
    if (!found) plan.create.push({ fields });
    else if (Number(found.onHand) !== Number(onHand))
      plan.change.push({ fields, part: found, delta: onHand - Number(found.onHand) });
    else plan.same.push({ fields, part: found });
  });

  return plan;
}

