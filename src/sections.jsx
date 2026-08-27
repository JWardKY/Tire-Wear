import TiresSection from "./TireWear.jsx";
import DefectsSection from "./DefectsSection.jsx";
import PmSection from "./PmSection.jsx";

/* The shop system is a list of sections. Adding one is a row here plus a
   component — the shell renders the nav, owns which section is showing,
   and keeps each section's sub-tab separate from the others'.

   Order is the order they appear, and it is deliberate: what is broken
   comes before what is due, which comes before what is wearing out.
   `blurb` is the line under the logo, so the header says what you are
   looking at rather than always saying tires.

   Still to come, per the shop foreman's mockups: Now, Timecard, My jobs,
   Inventory, Hours, Setup. */

export const SECTIONS = [
  {
    key: "defects",
    label: "Defects",
    blurb: "What is wrong with the fleet, who has it, and what was done",
    subTabs: [
      ["open", "Open"],
      ["repaired", "Repaired"],
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
];

export const findSection = (key) =>
  SECTIONS.find((s) => s.key === key) || SECTIONS[0];
