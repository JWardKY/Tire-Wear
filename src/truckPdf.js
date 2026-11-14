/* ── The truck file as a PDF ──────────────────────────────────────
   Real text, not a picture of the screen. A screenshot-style PDF is
   blurry on a printer, can't be searched, and on an iPad takes long
   enough that somebody presses the button twice. This lays the report
   out as tables directly.

   Imported only when somebody presses PDF, so the two libraries it
   needs are not part of every page load in the shop. Everything about
   WHAT goes in the document is in truckReport.js; this only decides how
   it looks on paper. */
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { pdfBody, filenameFor } from "./truckReport.js";

/* The app's own greens, so the document is recognisably ours. */
const GREEN = [14, 44, 30];
const GREEN_MID = [29, 92, 62];
const MUTED = [100, 110, 120];
const LINE = [214, 220, 226];
const ZEBRA = [246, 248, 247];

export function buildPdf(report, { printedOn = new Date() } = {}) {
  /* Landscape: the hours and tire tables are nine and fourteen columns
     wide, and portrait squeezes them into a column of single words. */
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const M = 36;

  /* ── Masthead ── */
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 58, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(report.title, M, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(report.subtitle || "", M, 43);
  doc.text(`THE ALLEN COMPANY · HAUL DIVISION`, W - M, 26, { align: "right" });
  doc.text(`Made ${printedOn.toLocaleDateString("en-US")}`, W - M, 43, { align: "right" });

  doc.setTextColor(...MUTED);
  doc.setFontSize(9.5);
  doc.text(report.scope, M, 76, { maxWidth: W - 2 * M });

  let y = 92;
  report.sections.forEach((s) => {
    /* Keep a heading with at least the start of its table. */
    if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 40; }

    doc.setTextColor(...GREEN_MID);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(s.title.toUpperCase(), M, y);
    /* The range goes at the right-hand end of the heading line. It was
       placed just after the heading, offset by the heading's width — but
       measured after switching to the smaller font, so it came out short
       and printed on top of the title ("MECHANIC TIME0/01/26"). Right-
       aligned, nothing has to be measured and nothing can collide. */
    if (s.dated && report.range.ranged) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(report.range.say, W - M, y, { align: "right" });
    }
    y += 6;

    if (!s.rows.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(s.dated && report.range.ranged ? "None in this range." : "None on record.",
        M, y + 12);
      y += 30;
      return;
    }

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: s.keyValue ? undefined : [s.columns.map((c) => c.label)],
      body: pdfBody(s),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: LINE,
        lineWidth: 0.4, textColor: [20, 28, 36], overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: GREEN_MID, textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: ZEBRA },
      /* Numbers right-aligned so a column of hours can be added by eye. */
      columnStyles: Object.fromEntries(s.columns.map((c, i) => [i,
        ["hours", "num", "money"].includes(c.kind) ? { halign: "right" }
          : s.keyValue && i === 0 ? { fontStyle: "bold", cellWidth: 140 } : {}])),
      /* A long "what was done" wraps rather than running off the page. */
      tableWidth: s.keyValue ? 320 : "auto",
    });
    y = doc.lastAutoTable.finalY + 22;
  });

  /* ── Page footers, once the page count is known ── */
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${report.unit} · ${report.range.say}`, M, H - 18);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 18, { align: "right" });
  }
  return doc;
}

export function savePdf(report, opts) {
  const doc = buildPdf(report, opts);
  doc.save(filenameFor(report, "pdf"));
  return doc;
}
