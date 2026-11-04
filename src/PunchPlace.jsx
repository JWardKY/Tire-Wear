import React from "react";
import { C } from "./theme.js";
import { mapUrl, placeLabel } from "./geo.js";

/* Where a punch happened, as one short line: a map link with the
   device's own accuracy, or why there is no pin. Renders nothing for a
   punch typed in by hand, which never had a place to begin with.

   The link stops the click: on the Now board it sits inside a card that
   opens the person, and following a map link should not do both. */
export default function PunchPlace({ label, place, style }) {
  const text = placeLabel(place);
  if (!text) return null;
  const pin = place.lat != null;
  return (
    <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", ...style }}>
      {label && <>{label} </>}
      {pin ? (
        <a href={mapUrl(place)} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          title={`${place.lat}, ${place.lng}`}
          style={{ color: C.green700, fontWeight: 600 }}>
          📍 {text}
        </a>
      ) : (
        <span style={{ color: C.watch }}>{text}</span>
      )}
    </span>
  );
}
