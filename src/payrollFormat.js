/* ── Turning an hour into a payroll row ───────────────────────────
   Pure formatting, deliberately in its own file with no database
   import: the column order and the two costing paths are the part that
   has to be checked against Jason's workbook, and a test should be able
   to load them without credentials or a browser.
*/

/* ── The payroll export ────────────────────────────────────────────
   Column for column as Vista's Payroll Workbook wants it, taken off
   the detail review Jason sends over. The order and the spelling of
   these headers are not ours to tidy — they are what the import maps
   against.

   Two shapes of row, and which one you get depends on whether the hour
   was against a truck:

     equipment    Job, Equipment, EQ DESCRIPTION, Cost Code, EM COST
                  CODE. JOB NAME, Phase and PHASE NAME stay empty.
     job / shop   Job, JOB NAME, Phase, PHASE NAME. Equipment and the
                  two cost-code columns stay empty.

   That is not a quirk to work around: equipment work is costed through
   the equipment module and shop work through job phases, so filling
   both halves would double-charge the hour. */
export const PAYROLL_COLUMNS = [
  "Employee", "EMPLOYEE NAME", "GROUP", "Work Date", "Hours", "EARN CODE",
  "Job", "JOB NAME", "Phase", "PHASE NAME", "Equipment", "EQ DESCRIPTION",
  "Cost Code", "EM COST CODE", "Class", "CLASS NAME",
];

/* Vista wants M/D/YYYY with no leading zeros, and the dates arrive as
   YYYY-MM-DD. Split rather than new Date(): a date-only string parses
   as UTC midnight, which in Eastern is the day before. */
const payDate = (iso) => {
  const [y, m, d] = String(iso || "").split("-");
  return y ? `${Number(m)}/${Number(d)}/${y}` : "";
};

/* Everything the shop books is worked time. Holiday, vacation and sick
   pay are added in payroll, where they already live — nobody clocks in
   for a holiday, so we would only ever be guessing at one. */
const EARN_CODE = "Regular";

/* Every hour is Regular time against one of two costing paths. */
export const payrollRow = (r) => {
  const onEquipment = !!r.equipment;
  return [
    r.empNo, r.mechanic, r.payGroup, payDate(r.date), r.hours.toFixed(2), EARN_CODE,
    r.jobNumber,
    onEquipment ? "" : r.jobName,
    onEquipment ? "" : r.phase,
    onEquipment ? "" : r.phaseName,
    r.equipment,
    r.eqDescription,
    onEquipment ? r.costCode : "",
    onEquipment ? r.costCodeName : "",
    r.payClass, r.payClassName,
  ];
};

/* ── The detail export ─────────────────────────────────────────────
   What the payroll columns deliberately leave out: the work order, the
   DVIR behind it, the parts off the shelf, what the mechanic wrote, and
   the clock against the booking. None of it belongs in the import, and
   all of it is what somebody reaches for when a line is questioned. */
export const DETAIL_COLUMNS = [
  "Work Date", "Employee", "Mechanic", "Cost Code", "Cost Code Name", "Unit",
  "Equipment", "Shop or service call", "Job/location", "Hours",
  "True clocked hours", "Segments", "Work order", "Type of work", "DVIR", "PM",
  "Parts used", "Work performed",
];

export const detailRow = (r) => [
  r.date, r.empNo, r.mechanic, r.costCode, r.costCodeName, r.unit, r.equipment,
  r.where, r.jobLocation, r.hours, r.trueHours, r.segments, r.workOrder,
  r.workTypes, r.dvir, r.pm, r.parts, r.workPerformed,
];
