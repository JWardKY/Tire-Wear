/* ── Motive's fleet, turned into units ────────────────────────────
   Motive keeps two lists and the app has one. Vehicles are the things
   with an ELD in the cab — trucks and pickups. Assets are everything
   else it tracks with a gateway: trailers, pavers, brooms, backhoes,
   arrow boards, light plants.

   Three things make this more than a copy.

   The number is buried in the name. A vehicle is called "DT-890", but
   an asset is called "T-674 Asphalt Tanker" or "HT-119 Water Truck" or
   "T-673- Asphalt Tanker". The unit number is the first word, and what
   follows is a description somebody typed.

   The two lists overlap. Nine trucks are in Motive as a vehicle AND as
   an asset — HT-643 is both — because somebody put a gateway on a
   truck that already had an ELD. Importing both would give the shop two
   HT-643s to book hours against, and half the work would land on each.

   And most equipment has no tires this app can follow. A paver runs on
   tracks; an arrow board has two trailer tires nobody gauges; a backhoe
   wears its tires by the hour, not the mile, and the whole wear model
   here is miles per 32nd off an odometer. Those units still need to
   exist — you book hours, defects, PM and parts against them — so they
   come in as "no tires tracked" rather than being given a truck's axle
   layout that would put them on the Tires page reading 0 of 6.

   Nothing here touches the database or Motive. */

/* The prefixes the yard uses, and what each one is. Anything not named
   here lands in OT, which is where a one-off belongs until somebody
   files it properly in Setup. */
const HAUL = { DT: "DT", HT: "HT", LT: "LT" };

/* Equipment: yard and paving plant. Tracked, drummed, or on tires that
   wear by the hour — either way not by the odometer. */
const EQUIPMENT = new Set([
  "AB",   // arrow boards and auto-flaggers
  "AC",   // air compressors
  "CT",   // dozers
  "F",    // pavers
  "LP",   // light plants
  "MM",   // milling machines
  "RB",   // road brooms
  "RL",   // loaders, backhoes, skid steers
  "SB",   // straw blowers
  "TC",   // trench compactors
  "TR",   // trench rollers
  "VE",   // trenchers
  "VR",   // vibratory rollers
]);

/* Trailers and tankers: eight tires on two axles, no steer. */
const TRAILER = new Set(["T"]);

/* The unit number out of whatever Motive calls the thing. The first
   word, because everything after it is a description somebody typed
   into the same box — "T-674 Asphalt Tanker" is unit T-674. Trailing
   punctuation goes too: "T-673-" is the same trailer as "T-673". */
export function unitNumber(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first.toUpperCase().replace(/[^A-Z0-9-]+$/, "").replace(/-+$/, "");
}

export function prefixOf(number) {
  const m = String(number || "").toUpperCase().match(/^([A-Z]+)-/);
  return m ? m[1] : "";
}

export function divisionFor(number) {
  const p = prefixOf(number);
  if (HAUL[p]) return HAUL[p];
  if (EQUIPMENT.has(p) || TRAILER.has(p)) return "EQ";
  return "OT";
}

/* What the unit runs on. A starting point, not a verdict — Setup can
   change any of them, and a loader whose tires somebody does want to
   follow is two taps away. The point is that the first guess is never
   a lie: a paver does not arrive claiming six tires. */
export function configFor(number) {
  const p = prefixOf(number);
  if (p === "DT") return "dump12";
  if (p === "HT") return "single6";
  if (p === "LT") return "light4";
  if (TRAILER.has(p)) return "trailer8";
  if (EQUIPMENT.has(p)) return "notires";
  return "light4";
}

const clean = (s) => {
  const v = String(s == null ? "" : s).trim();
  return v || null;
};

/* Title case for a make somebody typed in caps or none: "CHEVROLET",
   "intl" and "etnyte" all arrive from the same box. Left alone if it
   already has a capital in it, so "LeeBoy" and "McNeilus" survive. */
export function tidyName(s) {
  const v = clean(s);
  if (!v) return null;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) return v;
  return v.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/* What an import would do, said before it does it.

   `have` is the units already in the app, by number. Everything is
   decided against that, and against what has already been taken by an
   earlier row in this same plan, so running it twice adds nothing the
   second time.

   Returns three lists, and every row that is not added says why. A
   silent skip in a fleet import is a truck nobody notices is missing
   until somebody tries to book hours to it. */
export function planImport({ vehicles = [], assets = [], have = [] } = {}) {
  const byNumber = new Map();
  const byMotive = new Map();
  have.forEach((v) => {
    const n = String(v.number || "").toUpperCase();
    if (n) byNumber.set(n, v);
    if (v.motiveVehicleId != null) byMotive.set(Number(v.motiveVehicleId), v);
  });

  const add = [], link = [], skip = [];
  /* What has claimed each number so far, so a clash can say which
     list the winner came from rather than just that there was one. */
  const taken = new Map([...byNumber.keys()].map((n) => [n, "app"]));

  const consider = (row, source) => {
    const number = unitNumber(source === "vehicle" ? row.number : row.name);
    const id = Number(row.id);

    if (!number) { skip.push({ number: "", source, id, why: "no unit number on it" }); return; }
    if (row.status !== "active") {
      skip.push({ number, source, id, why: `not active in Motive (${row.status})` });
      return;
    }

    /* Already carrying this Motive id: nothing to do, whatever it is
       called now. Renaming a truck in Motive is not a new truck. */
    if (source === "vehicle" && byMotive.has(id)) {
      skip.push({ number, source, id, why: "already linked" });
      return;
    }

    const existing = byNumber.get(number);
    if (existing) {
      /* The number is in the app but nothing ties it to Motive — the
         one Jason typed in by hand before the sync existed. Link it
         rather than fail on the unique number, and never touch the
         division or axle layout somebody chose for it. */
      if (source === "vehicle" && existing.motiveVehicleId == null) {
        link.push({ number, motiveVehicleId: id });
        byMotive.set(id, existing);
        return;
      }
      skip.push({
        number, source, id,
        why: source === "asset" && existing
          ? "already in the app as a vehicle"
          : "a different unit already has that number",
      });
      return;
    }

    const heldBy = taken.get(number);
    if (heldBy) {
      skip.push({
        number, source, id,
        /* The overlap case: a truck carrying both an ELD and a gateway
           is in both Motive lists. The vehicle wins — it is the one
           with the odometer feed behind it — and saying so is the
           difference between a reviewer nodding and a reviewer
           wondering which HT-643 got dropped. */
        why: heldBy !== source
          ? `already coming in from Motive's ${heldBy} list`
          : `two Motive ${source} rows claim that number`,
      });
      return;
    }
    taken.set(number, source);

    add.push({
      number,
      division: divisionFor(number),
      config: configFor(number),
      make: tidyName(row.make),
      model: clean(row.model),
      year: clean(row.year),
      motiveVehicleId: source === "vehicle" ? id : null,
      motiveAssetId: source === "asset" ? id : null,
      source,
      /* What Motive called it, when that was more than the number.
         "T-674 Asphalt Tanker" says something the number does not. */
      notes: describe(source === "vehicle" ? row.number : row.name, row),
    });
  };

  /* Vehicles first, deliberately. Where a truck is in both lists the
     vehicle is the one with the odometer feed behind it, and the
     asset is the duplicate to drop. */
  vehicles.forEach((v) => consider(v, "vehicle"));
  assets.forEach((a) => consider(a, "asset"));

  return { add, link, skip };
}

/* The description Motive carries beside the number, if there is one. */
function describe(name, row) {
  const full = String(name || "").trim();
  const num = unitNumber(full);
  const rest = full.slice(num.length).replace(/^[\s-]+/, "").trim();
  const kind = clean(row.custom_type) || (row.type && row.type !== "other" ? row.type : null);
  const bits = [rest, kind && !rest.toLowerCase().includes(String(kind).toLowerCase()) ? kind : null]
    .filter(Boolean);
  return bits.length ? bits.join(" · ") : null;
}
