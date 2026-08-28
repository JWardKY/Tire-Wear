import React from "react";
import HoursSection from "./HoursSection.jsx";
import SetupSection from "./SetupSection.jsx";

/* ── Supervisor ───────────────────────────────────────────────────
   The office's half of the shop system, behind one gate at the end of
   the bar rather than two scattered through the middle of it.

   It is a router, not a screen. Hours and Setup stay whole components
   with their own sub-tabs; this only decides which of them a sub-tab
   belongs to. Adding a supervisor screen is a row in TABS plus a case
   here — nothing about the gate or the nav has to change.

   Why one section and not two: the tabs a mechanic never opens were
   sitting between the tabs they open all day, so the bar read as one
   undifferentiated row and the two gated ones were a surprise every
   time. Grouping them says what they are before anybody taps. */

const HOURS_TABS = new Set(["rollup", "detail", "cards", "log"]);

export default function SupervisorSection(props) {
  const Screen = HOURS_TABS.has(props.tab) ? HoursSection : SetupSection;
  return <Screen {...props} />;
}
