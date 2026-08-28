import NowSection from "./NowSection.jsx";
import TiresSection from "./TireWear.jsx";
import DefectsSection from "./DefectsSection.jsx";
import PmSection from "./PmSection.jsx";
import TimecardSection from "./TimecardSection.jsx";
import InventorySection from "./InventorySection.jsx";
import WorkSection from "./WorkSection.jsx";
import SupervisorSection from "./SupervisorSection.jsx";

/* The shop system is a list of sections. Adding one is a row here plus a
   component — the shell renders the nav, owns which section is showing,
   and keeps each section's sub-tab separate from the others'.

   Order is the order they appear, and it is deliberate. It reads as a
   shift: the board at a glance, then your own day, then the three
   queues of what needs doing, then the two things the shop owns and
   tracks, then the office.

   The office is last and it is one tab. Hours and Setup used to sit in
   the middle of the row, so the two tabs a mechanic never opens were
   between the ones they open all day; the bar read as one flat list and
   hitting a PIN prompt was a surprise. Everything gated now lives under
   Supervisor, at the end, where it announces itself.

   `blurb` is the line under the logo, so the header says what you are
   looking at rather than always saying tires. It may be a function of
   the sub-tab where one line cannot cover the section honestly. */

export const SECTIONS = [
  {
    key: "now",
    label: "Now",
    blurb: "Who is on the clock, and the shop at a glance",
    Component: NowSection,
  },
  {
    key: "timecard",
    label: "Timecard",
    blurb: "Your own hours for the day — behind a PIN, because these are pay records",
    subTabs: [
      ["today", "Today"],
      ["myjobs", "My jobs"],
      ["history", "My history"],
      ["pin", "My PIN"],
    ],
    Component: TimecardSection,
  },
  {
    key: "defects",
    label: "Defects",
    blurb: "What is wrong with the fleet, who has it, and what was done",
    subTabs: [
      ["open", "Open"],
      ["repaired", "Waiting on Motive"],
      ["closed", "Closed"],
    ],
    Component: DefectsSection,
  },
  {
    key: "pm",
    label: "PM",
    blurb: "Preventive maintenance due by miles and by months",
    subTabs: [
      ["due", "Due"],
      ["programs", "Programs"],
    ],
    Component: PmSection,
  },
  {
    key: "work",
    label: "Work orders",
    blurb: "Numbered jobs, who is on them, and everything that has happened",
    subTabs: [["orders", "Work orders"], ["history", "Work history"]],
    Component: WorkSection,
  },
  {
    key: "tires",
    label: "Tires",
    blurb: "Tread depth, miles run, and cost-per-mile by brand and position",
    subTabs: [
      ["fleet", "Fleet"],
      ["analysis", "Analysis"],
      ["settings", "Settings"],
    ],
    Component: TiresSection,
  },
  {
    key: "inventory",
    label: "Inventory",
    blurb: "Parts on the shelf, what needs ordering, and where it all went",
    subTabs: [
      ["reorder", "Reorder"],
      ["order", "Order parts"],
      ["stock", "All parts"],
      ["requests", "Requests"],
      ["issued", "Issued"],
      ["vendors", "Vendors"],
      ["import", "Import"],
    ],
    Component: InventorySection,
  },
  {
    key: "supervisor",
    supervisor: true,
    label: "Supervisor",
    blurb: (tab) =>
      tab === "roster" ? "The roster, the PINs, and who can open this tab"
      : tab === "codes" ? "The cost codes everything else books against"
      : tab === "cards" ? "Every card, clocked hours against booked hours"
      : tab === "log" ? "The audit trail — append only, and nothing here can edit it"
      : "Where the shop's hours went, by mechanic, by unit and by cost code",
    subTabs: [
      ["rollup", "Totals"],
      ["detail", "Every entry"],
      ["cards", "Timecards"],
      ["log", "Work log"],
      ["roster", "Mechanics"],
      ["codes", "Cost codes"],
    ],
    Component: SupervisorSection,
  },
];

export const findSection = (key) =>
  SECTIONS.find((s) => s.key === key) || SECTIONS[0];
