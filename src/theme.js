/* Allen Company house palette and type stacks. Shared so the sign-in
   screen, the logo and the app itself cannot drift apart.

   Deep green chrome with a yellow accent. The greens are all darker
   than the "in service" green below on purpose — chrome should not be
   mistakable for a status. The three status colours are deliberately
   unchanged from the original build: they are tuned to stay legible
   both as pill text on white and as large numerals on a dark card. */
export const C = {
  green900: "#0C2A1B", // header, tire cards, modal title bars
  green800: "#123A25",
  green700: "#1A4E31", // primary buttons, section labels
  green600: "#256B42", // links, first chart series
  yellow: "#E8C020", // accent rule, eyebrow text, the logo
  yellowHi: "#FFD84D", // markers on dark backgrounds

  paper: "#EDF0F4",
  card: "#FFFFFF",
  line: "#D5DDE6",
  lineSoft: "#E6ECF2",
  ink: "#10202F",
  muted: "#64748B",

  // On the dark green chrome.
  onDark: "#A9C2B2", // body text
  onDarkSoft: "#8AA595", // secondary text
  wellDark: "#071A10", // inset fields on a dark card

  // Status. Do not tune these to the brand — they carry meaning.
  // These are the on-white values: pill text, table figures, badges.
  good: "#2F7D4F",
  watch: "#C98A12",
  pull: "#B4302A",

  /* The same three read against the dark green card on the diagram.
     The on-white green is nearly the card's own hue, so the tread depth
     turned to mud when the chrome went from navy to green — these are
     lifted until the numeral carries at the size it is actually set. */
  goodOnDark: "#5FC183",
  watchOnDark: "#F2B824",
  pullOnDark: "#F2857B",
  noneOnDark: "#8AA595",
};

export const FD = "'Barlow Condensed', 'Oswald', 'Arial Narrow', system-ui, sans-serif";
export const FB = "'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const FM = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
