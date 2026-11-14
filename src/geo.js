/* Where a punch happened.
   ─────────────────────────────────────────────────────────────────
   Asked of the phone or tablet at the moment somebody taps Clock in or
   Clock out, and stored on the shift beside the time.

   The one rule: a location never stands between a mechanic and the
   clock. A phone that says no, has location off, or cannot get a fix
   indoors still punches — the reason goes on the row instead, so a
   supervisor reading "no location" can tell "refused" from "could not".
   A clock that refuses to clock is one people stop using, and then
   there is no time on record at all, which is worse than time with no
   pin on it.

   whereAmI never rejects. It resolves to one of:
     { lat, lng, accuracyM }       a fix
     { note }                      no fix, and why */

const NOTES = { 1: "denied", 2: "unavailable", 3: "timeout" };

/* Eight seconds is long enough for a phone outdoors to get a GPS fix
   and short enough that the button does not feel broken. A fix up to a
   minute old is fine: nobody has walked off the yard in a minute. */
export function whereAmI({ timeoutMs = 8000, geo } = {}) {
  const g = geo ?? (typeof navigator !== "undefined" ? navigator.geolocation : null);
  if (!g?.getCurrentPosition) return Promise.resolve({ note: "unsupported" });

  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    /* Belt and braces: some browsers never call back at all when the
       permission prompt is left sitting, timeout option or not. */
    const guard = setTimeout(() => finish({ note: "timeout" }), timeoutMs + 1500);
    try {
      g.getCurrentPosition(
        (p) => { clearTimeout(guard); finish(fromPosition(p)); },
        (e) => { clearTimeout(guard); finish({ note: NOTES[e?.code] || "unavailable" }); },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
      );
    } catch {
      clearTimeout(guard);
      finish({ note: "unavailable" });
    }
  });
}

export function fromPosition(p) {
  const lat = Number(p?.coords?.latitude);
  const lng = Number(p?.coords?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)
      || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { note: "unavailable" };
  }
  const acc = Number(p.coords.accuracy);
  return {
    lat: round6(lat), lng: round6(lng),
    accuracyM: Number.isFinite(acc) ? Math.max(0, Math.round(acc)) : null,
  };
}

/* Six places is about ten centimetres — more than any phone knows. */
const round6 = (n) => Math.round(n * 1e6) / 1e6;

/* A row's punch, read back off the view, for one end: "in" or "out". */
export function punchPlace(row, end) {
  const lat = row?.[`${end}_lat`], lng = row?.[`${end}_lng`];
  if (lat != null && lng != null) {
    return { lat: Number(lat), lng: Number(lng),
             accuracyM: row[`${end}_accuracy_m`] ?? null };
  }
  return { note: row?.[`${end}_geo_note`] || null };
}

export const mapUrl = ({ lat, lng }) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/* What a person reads where the pin would be. */
export function placeLabel(place) {
  if (!place) return "";
  if (place.lat != null) {
    return place.accuracyM != null ? `Map (±${fmtDist(place.accuracyM)})` : "Map";
  }
  switch (place.note) {
    case "denied": return "location refused";
    case "timeout": return "no location fix";
    case "unavailable": return "location unavailable";
    case "unsupported": return "device has no location";
    default: return "";   // typed in by hand, or before locations were kept
  }
}

/* Feet, because that is what the shop reads; miles past a half. */
export function fmtDist(m) {
  const ft = m * 3.28084;
  if (ft < 2640) return `${Math.round(ft / 10) * 10 || Math.round(ft)} ft`;
  return `${(ft / 5280).toFixed(1)} mi`;
}

/* The columns a punch writes, for one end. */
export function geoCols(end, g) {
  return {
    [`${end}_lat`]: g?.lat ?? null,
    [`${end}_lng`]: g?.lng ?? null,
    [`${end}_accuracy_m`]: g?.accuracyM ?? null,
    [`${end}_geo_note`]: g?.lat != null ? null : (g?.note || null),
  };
}
