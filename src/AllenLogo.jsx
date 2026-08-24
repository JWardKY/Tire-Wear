import React from "react";
import { FD } from "./theme.js";

/* The Allen Company wordmark, redrawn from the sign on the building:
   a full-width rule, THE ALLEN CO. with INC beneath it, then a broken
   rule over SERVING KENTUCKY / SINCE 1939.

   Vector rather than a photograph of the sign, because the sign is black
   on white and the header is neither, and because this has to stay sharp
   from a favicon to a phone header. Fills with currentColor, so the
   caller sets the colour.

   textLength is set on every word: if Barlow Condensed has not loaded
   yet, the fallback face is pinned to the same width instead of pushing
   the composition out of the viewBox. */

const R = { fill: "currentColor" };

export default function AllenLogo({ height = 34, title = "The Allen Company", style }) {
  return (
    <svg
      viewBox="0 0 600 172"
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

      {/* INC, sitting in the gap in the lower rule */}
      <text x="300" y="128" fontFamily={FD} fontWeight="700" fontSize="46"
        textAnchor="middle" letterSpacing="1"
        textLength="104" lengthAdjust="spacingAndGlyphs" {...R}>
        INC
      </text>

      {/* Lower rule, broken either side of INC */}
      <rect x="6" y="112" width="196" height="7" {...R} />
      <rect x="398" y="112" width="196" height="7" {...R} />

      {/* SERVING KENTUCKY */}
      <text x="8" y="166" fontFamily={FD} fontWeight="600" letterSpacing="1.5"
        textLength="250" lengthAdjust="spacingAndGlyphs" {...R}>
        <tspan fontSize="32">S</tspan>
        <tspan fontSize="24">ERVING </tspan>
        <tspan fontSize="32">K</tspan>
        <tspan fontSize="24">ENTUCKY</tspan>
      </text>

      {/* SINCE 1939 */}
      <text x="592" y="166" fontFamily={FD} fontWeight="600" letterSpacing="1.5"
        textAnchor="end" textLength="180" lengthAdjust="spacingAndGlyphs" {...R}>
        <tspan fontSize="32">S</tspan>
        <tspan fontSize="24">INCE </tspan>
        <tspan fontSize="32">1939</tspan>
      </text>
    </svg>
  );
}
