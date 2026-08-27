import TiresSection from "./TireWear.jsx";

/* The shop system is a list of sections. Adding one is a row here plus a
   component — the shell renders the nav, owns which section is showing,
   and keeps each section's sub-tab separate from the others'.

   Order is the order they appear. `blurb` is the line under the logo, so
   the header says what you are looking at rather than always saying
   tires.

   Sections still to come, per the shop foreman's mockups: Now, Timecard,
   My jobs, Defects, PM, Inventory, Hours, Setup. Tires is the one that
   already exists, and it moves in unchanged. */

export const SECTIONS = [
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
