/* ── A truck file, as a document ──────────────────────────────────
   The Truck File screen already had Print and CSV. Asked for a PDF as
   well, the obvious build was a third exporter beside the other two —
   and the CSV showed why that would have been a mistake.

   The CSV ignored the From/To dates. Not entirely: its SUMMARY came
   from the rollup, which is date-aware, so a "last month" file said
   12.5 labour hours at the top and then listed every hour ever booked
   to the truck underneath. The file contradicted itself, and nothing on
   the screen would have told anybody.

   So there is one definition of what the report contains, with the
   date range applied once, and both the CSV and the PDF render from it.
   They cannot disagree with each other, and the rules are the screen's
   own:

     dated   hours, services, parts issued, mileage, the timeline —
             filtered to From/To when either is set
     current tires, defects, work orders — always as of today, because
             "what is on the truck" is not a question about last month

   Nothing here touches the database or knows what a PDF is. */

/* The same comparison the screen makes: the first ten characters of
   whatever is there, against ISO dates. A timestamp and a date compare
   the same way, and an empty bound is no bound. */
export function inRange(v, from, to) {
  const d = String(v ?? "").slice(0, 10);
  if (!d) return !from && !to;
  return (!from || d >= from) && (!to || d <= to);
}

const mmddyy = (v) => {
  const s = String(v ?? "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : "";
};

/* What the range says, in words, for the top of the document. */
export function sayRange(from, to) {
  if (from && to) return `${mmddyy(from)} to ${mmddyy(to)}`;
  if (from) return `from ${mmddyy(from)}`;
  if (to) return `up to ${mmddyy(to)}`;
  return "all records";
}

/* A column: the CSV header (kept exactly as it was, because somebody's
   spreadsheet may be keyed on it), the PDF label, and what kind of value
   it holds so the PDF can format it. The CSV always gets the raw value. */
const col = (csv, label, kind = "text") => ({ csv, label, kind });

/* How a value reads on paper. The CSV is for a spreadsheet and keeps the
   raw value; the PDF is for a person. */
export function cellText(v, kind) {
  if (v == null || v === "") return "";
  if (kind === "date") return mmddyy(v) || String(v);
  if (kind === "hours") {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : String(v);
  }
  if (kind === "money") {
    const n = Number(v);
    return Number.isFinite(n) ? `$${n.toFixed(2)}` : String(v);
  }
  if (kind === "num") {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString("en-US") : String(v);
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v).replace(/\s+/g, " ").trim();
}

/* ── The report ───────────────────────────────────────────────────
   `f` is the truck file as the screen loads it; `roll` is the rollup
   the screen already computes with the same From/To. */
export function reportOf(f = {}, roll = {}, { from = "", to = "" } = {}) {
  const u = f.unit || {};
  const dated = (list, at) => (list || []).filter((r) => inRange(at(r), from, to));
  const ranged = !!(from || to);

  const hours = dated(f.hours, (h) => h.date);
  const services = dated(f.services, (s) => s.date);
  const parts = dated((f.parts || []).filter((p) => p.kind === "issue"), (p) => p.at);
  const odos = dated(f.odos, (o) => o.date);
  const history = dated(f.history, (r) => r.at);

  const sections = [
    {
      id: "summary", title: "Summary", dated: ranged,
      columns: [col("", "", "text"), col("", "", "text")],
      keyValue: true,
      /* Per row, because a summary is a list of different kinds of thing:
         hours, counts and a dollar figure. Without this "Parts cost"
         printed as a bare 42. */
      rowKinds: ["hours", "num", "num", "num", "num", "num", "num", "money",
        "num", "num", "num", "num"],
      rows: [
        ["Labour hours", roll.labourHours], ["Entries", roll.lines],
        ["Mechanics", (roll.mechanics || []).length], ["Services done", roll.servicesDone],
        ["Defects repaired", roll.repairedDefects], ["Jobs completed", roll.doneOrders],
        ["Parts lines", roll.partLines], ["Parts cost", roll.partsCost],
        ["Tires on it", roll.tiresOn], ["Tires pulled", roll.tiresOff],
        ["Open defects", roll.openDefects], ["Open jobs", roll.openOrders],
      ],
    },
    {
      id: "mechanics", title: "Mechanic time", dated: true,
      columns: [col("mechanic", "Mechanic"), col("hours", "Hours", "hours"),
        col("days", "Days", "num"), col("last_on_it", "Last on it", "date")],
      rows: (roll.mechanics || []).map((m) => [m.mechanic, m.hours, m.days, m.last]),
    },
    {
      id: "hours", title: "Hours, every entry", dated: true,
      columns: [col("date", "Date", "date"), col("mechanic", "Mechanic"),
        col("hours", "Hours", "hours"), col("cost_code", "Code"),
        col("cost_code_name", "Charged to"), col("where", "Where"),
        col("job_location", "Job / location"), col("work_order", "Work order"),
        col("what_was_done", "What was done")],
      rows: hours.map((h) => [h.date, h.mechanic, h.hours, h.code, h.codeName,
        h.where, h.jobLocation, h.workOrder, h.performed || h.note]),
    },
    {
      id: "tires", title: "Tires", dated: false,
      columns: [col("position", "Pos"), col("on_now", "On now"), col("brand", "Brand"),
        col("model", "Model"), col("size", "Size"), col("type", "Type"),
        col("mounted", "Mounted", "date"), col("mounted_odo", "At mi", "num"),
        col("new_32nds", "New /32", "num"), col("removed", "Removed", "date"),
        col("removed_odo", "Off mi", "num"), col("miles_run", "Miles run", "num"),
        col("why", "Why off"), col("cost", "Cost", "money")],
      rows: (f.tires || []).map((t) => [t.pos, t.on ? "yes" : "no", t.brand, t.model,
        t.size, t.type, t.onDate, t.onOdo, t.newDepth, t.offDate, t.offOdo, t.miles,
        t.offReason, t.cost]),
    },
    {
      id: "services", title: "Services", dated: true,
      columns: [col("date", "Date", "date"), col("service", "Service"),
        col("category", "Category"), col("odometer", "Odometer", "num"),
        col("engine_hours", "Engine hrs", "num"), col("labour_hours", "Labour", "hours"),
        col("by", "By"), col("note", "Note")],
      rows: services.map((s) => [s.date, s.program, s.category, s.odo,
        s.engineHours, s.hours, s.by, s.note]),
    },
    {
      id: "defects", title: "Defects", dated: false,
      columns: [col("first_reported", "First reported", "date"), col("category", "Category"),
        col("note", "Note"), col("safety", "Safety"), col("state", "State"),
        col("times", "Times", "num"), col("repaired_at", "Repaired", "date"),
        col("repaired_by", "By"), col("repair_note", "Repair"),
        col("repair_hours", "Hrs", "hours"), col("work_order", "WO")],
      rows: (f.defects || []).map((d) => [d.first, d.category, d.note, d.safety, d.state,
        d.count, d.repairedAt, d.repairedBy, d.repairNote, d.repairHours, d.workOrder]),
    },
    {
      id: "orders", title: "Work orders", dated: false,
      columns: [col("order", "Order"), col("title", "Title"), col("detail", "Detail"),
        col("state", "State"), col("priority", "Priority"), col("opened", "Opened", "date"),
        col("completed", "Completed", "date"), col("completed_by", "By"), col("note", "Note")],
      rows: (f.orders || []).map((w) => [w.wo, w.title, w.detail, w.state, w.priority,
        w.at, w.completedAt, w.completedBy, w.note]),
    },
    {
      id: "parts", title: "Parts issued", dated: true,
      columns: [col("at", "Date", "date"), col("part_number", "Part number"),
        col("name", "Part"), col("qty", "Qty", "num"), col("unit_cost", "Unit cost", "money"),
        col("who", "Who"), col("work_order", "Work order")],
      rows: parts.map((p) => [p.at, p.partNumber, p.name, p.qty, p.cost, p.who, p.workOrder]),
    },
    {
      id: "mileage", title: "Mileage", dated: true,
      columns: [col("date", "Date", "date"), col("odometer", "Odometer", "num"),
        col("source", "Source"), col("by", "By")],
      rows: odos.map((o) => [o.date, o.odo, o.source, o.by]),
    },
    {
      id: "history", title: "Everything, newest first", dated: true,
      columns: [col("at", "When", "date"), col("kind", "Kind"), col("what", "What"),
        col("detail", "Detail"), col("who", "Who"), col("hours", "Hours", "hours"),
        col("work_order", "WO")],
      rows: history.map((r) => [r.at, r.kind, r.what, r.summary, r.who, r.hours, r.workOrder]),
    },
  ];

  const make = [u.make, u.model, u.year].filter(Boolean).join(" ");
  return {
    unit: u.num || "",
    title: `Truck file — ${u.num || ""}`,
    subtitle: [make, u.div || "",
      f.meter?.odo != null ? `${Number(f.meter.odo).toLocaleString("en-US")} mi` : "no mileage",
      f.meter?.date ? `as of ${mmddyy(f.meter.date)}` : ""].filter(Boolean).join(" · "),
    range: { from, to, say: sayRange(from, to), ranged },
    /* Said on the document itself, so a printed page found in a drawer
       next year still says which half of it is which. */
    scope: ranged
      ? `Hours, services, parts, mileage and the timeline cover ${sayRange(from, to)}. `
        + "Tires, defects and work orders are as of the day this was made."
      : "Everything on record for this unit.",
    sections,
  };
}

/* ── The CSV ──────────────────────────────────────────────────────
   Same shape the old export had — a title, the make line, then each
   section headed in capitals with its snake_case header row — so
   anything already reading these files keeps working. The difference
   is the rows: they now respect the dates the summary always did. */
export function csvRows(report) {
  const rows = [];
  rows.push([report.title]);
  rows.push([report.subtitle]);
  rows.push([report.range.ranged ? `Range: ${report.range.say}` : "Range: all records"]);
  report.sections.forEach((s) => {
    rows.push([]);
    rows.push([s.title.toUpperCase()]);
    if (s.keyValue) { s.rows.forEach((r) => rows.push(r)); return; }
    rows.push(s.columns.map((c) => c.csv));
    s.rows.forEach((r) => rows.push(r));
  });
  return rows;
}

/* truck-file-DT-866.csv, or truck-file-DT-866_2026-10-01_to_2026-10-31.pdf
   — so two exports of different months do not overwrite each other in
   a Downloads folder. */
export function filenameFor(report, ext) {
  const safe = (s) => String(s || "").replace(/[^A-Za-z0-9-]+/g, "-");
  const { from, to } = report.range;
  const span = from || to ? `_${from || "start"}_to_${to || "today"}` : "";
  return `truck-file-${safe(report.unit)}${span}.${ext}`;
}

/* The rows a PDF table prints for a section, every value formatted for a
   person. Kept here rather than in the PDF module so it can be tested
   without loading a PDF library. */
export function pdfBody(section) {
  if (section.keyValue) {
    return section.rows.map((r, i) => [r[0], cellText(r[1], section.rowKinds?.[i] || "text")]);
  }
  return section.rows.map((r) => r.map((v, i) => cellText(v, section.columns[i]?.kind)));
}
