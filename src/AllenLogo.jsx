import React from "react";
import { FD } from "./theme.js";

/* The Allen Company wordmark, redrawn from the sign on the building:
   a full-width rule, THE ALLEN CO. with INC beneath it, then a broken
   rule over SERVING KENTUCKY / SINCE 1939.

   Vector rather than a photograph of the sign, because the sign is black
   on white and the header is neither, and because this has to stay sharp
   from a favicon to a phone. Fills with currentColor, so the caller sets
   the colour.

   Two variants, and the reason matters:

     full     the whole sign. Needs roughly 56px of height or more —
              below that the SERVING KENTUCKY line falls under about
              8px and stops being type at all, it just reads as fuzz.
     compact  the same mark with the fine print dropped. For chrome,
              where there is no room to set the small line honestly.

   Squashing the full lockup into a header is the thing to avoid; pick
   compact instead and it stays crisp.

   INC is centred on the broken rule, matching the sign — the rule
   passes through its middle, not below it, or INC floats up off the
   line. RULE_Y and INC_BASE are kept in step for that reason.

   textLength is set on every word: if Barlow Condensed has not loaded
   yet, the fallback face is pinned to the same width instead of pushing
   the composition out of the viewBox. */

const R = { fill: "currentColor" };

const INC_BASE = 134; // INC sits on this
const RULE_Y = 114; // 7 tall, so centred on INC's midpoint

export default function AllenLogo({
  height = 34,
  variant = "full",
  title = "The Allen Company",
  style,
}) {
  const compact = variant === "compact";

  return (
    <svg
      viewBox={compact ? "0 0 600 144" : "0 0 600 178"}
      height={height}
      role="img"
      aria-label={title}
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      <title>{title}</title>

      {/* Top rule */}
      <rect x="6" y="10" width="588" height="8" {...R} />

      {/* THE — small caps: tall first letter, shorter rest */}
      <text x="8" y="86" fontFamily={FD} fontWeight="700" letterSpacing="1"
        textLength="86" lengthAdjust="spacingAndGlyphs" {...R}>
        <tspan fontSize="42">T</tspan>
        <tspan fontSize="31">HE</tspan>
      </text>

      {/* ALLEN */}
      <text x="300" y="90" fontFamily={FD} fontWeight="700" fontSize="82"
        textAnchor="middle" letterSpacing="2"
        textLength="290" lengthAdjust="spacingAndGlyphs" {...R}>
        ALLEN
      </text>

      {/* CO. */}
      <text x="592" y="86" fontFamily={FD} fontWeight="700" letterSpacing="1"
        textAnchor="end" textLength="82" lengthAdjust="spacingAndGlyphs" {...R}>
        <tspan fontSize="42">C</tspan>
        <tspan fontSize="31">O.</tspan>
      </text>

      {/* INC, nested in the gap in the broken rule */}
      <text x="300" y={INC_BASE} fontFamily={FD} fontWeight="700" fontSize="46"
        textAnchor="middle" letterSpacing="1"
        textLength="104" lengthAdjust="spacingAndGlyphs" {...R}>
        INC
      </text>

      {/* The broken rule, either side of INC */}
      <rect x="6" y={RULE_Y} width="196" height="7" {...R} />
      <rect x="398" y={RULE_Y} width="196" height="7" {...R} />

      {!compact && (
        <>
          {/* SERVING KENTUCKY */}
          <text x="8" y="172" fontFamily={FD} fontWeight="600" letterSpacing="1.5"
            textLength="250" lengthAdjust="spacingAndGlyphs" {...R}>
            <tspan fontSize="32">S</tspan>
            <tspan fontSize="24">ERVING </tspan>
            <tspan fontSize="32">K</tspan>
            <tspan fontSize="24">ENTUCKY</tspan>
          </text>

          {/* SINCE 1939 */}
          <text x="592" y="172" fontFamily={FD} fontWeight="600" letterSpacing="1.5"
            textAnchor="end" textLength="180" lengthAdjust="spacingAndGlyphs" {...R}>
            <tspan fontSize="32">S</tspan>
            <tspan fontSize="24">INCE </tspan>
            <tspan fontSize="32">1939</tspan>
          </text>
        </>
      )}
    </svg>
  );
}
