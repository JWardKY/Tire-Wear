/* Where a punch happened — the part that must never stop a punch.
   ─────────────────────────────────────────────────────────────────
   src/geo.js asks the phone for a position at Clock in and Clock out.
   Every rule here is a way that ask could go wrong: the phone says no,
   never answers, has no location at all, or hands back nonsense. In
   every one of them whereAmI has to RESOLVE — a rejection would land in
   the punch's catch and the mechanic would not be on the clock.

   Needs nothing: no database, no browser.
     node scripts/test-geo.mjs
*/
import { whereAmI, fromPosition, punchPlace, placeLabel, geoCols, mapUrl, fmtDist }
  from "../src/geo.js";

let bad = 0;
const ok = (l, v, d) => { if (!v) bad++; console.log(`${v ? " ok " : " !! "} ${l}${!v && d ? ` — ${d}` : ""}`); };
const eq = (l, a, b) => ok(l, JSON.stringify(a) === JSON.stringify(b),
  `got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

const fix = (lat, lng, accuracy) => ({ coords: { latitude: lat, longitude: lng, accuracy } });
const geoThat = (fn) => ({ getCurrentPosition: fn });

/* A fix */
eq("a fix comes back as lat, lng and accuracy in whole metres",
  await whereAmI({ geo: geoThat((y) => y(fix(38.0406123456, -84.5037123456, 14.7))) }),
  { lat: 38.040612, lng: -84.503712, accuracyM: 15 });

/* The ways it does not */
eq("permission refused says denied",
  await whereAmI({ geo: geoThat((_, n) => n({ code: 1 })) }), { note: "denied" });
eq("no fix says unavailable",
  await whereAmI({ geo: geoThat((_, n) => n({ code: 2 })) }), { note: "unavailable" });
eq("too slow says timeout",
  await whereAmI({ geo: geoThat((_, n) => n({ code: 3 })) }), { note: "timeout" });
eq("a browser with no geolocation says unsupported",
  await whereAmI({ geo: {} }), { note: "unsupported" });
eq("a geolocation that throws still resolves",
  await whereAmI({ geo: geoThat(() => { throw new Error("SecurityError"); }) }),
  { note: "unavailable" });

const t0 = Date.now();
eq("a prompt left sitting with no callback at all still resolves",
  await whereAmI({ timeoutMs: 50, geo: geoThat(() => {}) }), { note: "timeout" });
ok("…and does so on its own guard, not forever", Date.now() - t0 < 3000);

eq("a position off the planet is not stored",
  fromPosition(fix(123, 10, 5)), { note: "unavailable" });
eq("a fix with no accuracy keeps the pin",
  fromPosition(fix(38, -84, undefined)), { lat: 38, lng: -84, accuracyM: null });

/* Written and read back */
eq("a fix writes four columns, no note",
  geoCols("in", { lat: 38, lng: -84, accuracyM: 12 }),
  { in_lat: 38, in_lng: -84, in_accuracy_m: 12, in_geo_note: null });
eq("no fix writes only the reason",
  geoCols("out", { note: "denied" }),
  { out_lat: null, out_lng: null, out_accuracy_m: null, out_geo_note: "denied" });

const row = { in_lat: 38, in_lng: -84, in_accuracy_m: 12, in_geo_note: null,
              out_lat: null, out_lng: null, out_accuracy_m: null, out_geo_note: "denied" };
eq("read back: the pin", punchPlace(row, "in"), { lat: 38, lng: -84, accuracyM: 12 });
eq("read back: the reason", punchPlace(row, "out"), { note: "denied" });
eq("a hand-typed punch has nothing to show", placeLabel(punchPlace({}, "in")), "");

eq("label with accuracy, in feet", placeLabel({ lat: 1, lng: 2, accuracyM: 12 }), "Map (±40 ft)");
eq("refused reads as refused", placeLabel({ note: "denied" }), "location refused");
eq("half a mile and up reads in miles", fmtDist(1609), "1.0 mi");
eq("the map link", mapUrl({ lat: 38.04, lng: -84.5 }),
  "https://www.google.com/maps/search/?api=1&query=38.04,-84.5");

console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
