# Tire Wear — Handoff

**The Allen Company · Haul Division**
Prepared 08/24/2026 · Owner: Jason Ward, Superintendent, Haul Division

---

## What this is

A tool for tracking tread depth on the DT and HT fleet so we can answer three questions
with numbers instead of opinions:

1. **Which tire brands actually last on our haul cycles?**
2. **Are retreads costing us or saving us?**
3. **Which wheel positions eat tires fastest, and is that a tire problem or an alignment problem?**

All three come from one metric: **miles per 32nd of tread lost.** Every screen and every
report in this app is built on it.

The tool is not a maintenance system, a DVIR system, or a purchasing system. It records
tread depth against mileage. That is the whole job.

---

## Current state

There is a working prototype — `TireWear.jsx` — with the full fleet loaded, the tire
diagram, tread entry, mileage entry, and the wear-rate reports. It runs as a
self-contained React component and stores data in browser-scoped storage.

**It cannot be handed to a second person as-is.** Storage is per-user. If the shop
foreman opens it, he sees an empty fleet, and nothing he enters reaches anyone else.
That is the one blocker between the prototype and a real tool, and it is why this
package exists.

Treat `TireWear.jsx` as a **reference implementation**, not the codebase. The layout,
the wear math, and the interaction model are all worked out and worth keeping. The
storage layer is the part to replace.

---

## Recommended build

Same stack as the tire tracker rebuild and the truck ordering app, so there is nothing
new to learn and nothing new to pay for:

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite | Matches the existing prototype; lift components over nearly as-is |
| Database | Supabase (Postgres) | Shared data, row level security, real backups |
| Auth | Supabase Auth, email magic link | No passwords for shop staff to lose |
| Hosting | Netlify | Already in use; deploy from Git on push |
| Charts | Recharts | Already used in the prototype |

Rough effort for someone comfortable in React: **three to five days.** Most of it is
wiring the prototype's state to Supabase queries. The hard thinking — the position
model, the wear math, the fleet data — is already done and is captured below.

### Steps

1. Create the Supabase project. Run `schema.sql`, then `seed-fleet.sql`.
2. `npm create vite@latest -- --template react`, add `@supabase/supabase-js` and `recharts`.
3. Lift the components out of `TireWear.jsx`. Keep `CONFIGS`, `positionsFor`,
   `TruckDiagram`, and `TireCard` intact — the diagram is the part people will actually
   use and it took the most iteration to get right.
4. Replace the `window.storage` load/save effect with Supabase queries. The
   `active_tires` view returns everything the vehicle detail screen needs in one call.
5. Delete `FLEET_RAW` from the component. Vehicles come from the database now.
6. Turn on Supabase Auth. Stamp `recorded_by` with the signed-in user's email on every
   insert so we know who took a reading.
7. Deploy to Netlify. Environment variables: `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`.

---

## The domain knowledge that must not get lost

This is the part a new developer cannot guess, and the part that makes the tool worth
anything. Read this section even if you skip the rest.

### Wheel positions

Position codes follow the Motive TPMS screen the shop already reads every day. Do not
invent a new scheme — the whole point is that a mechanic looking at Motive and a
mechanic looking at this app see the same labels.

```
        axle 1      axle 2       axle 3        axle 4
        (steer)    (pusher)      (drive)       (drive)

 R side   1R          2R           3RO           4RO      ← outer
                                   3RI           4RI      ← inner
        ══╪══      ══╪══         ══╪══         ══╪══      ← axle
                                   3LI           4LI      ← inner
 L side   1L          2L           3LO           4LO      ← outer

 FRONT ←
```

Read it as `<axle number><side><slot>`. Slot is only present on duals: `O` outer,
`I` inner. Truck is drawn nose-left with the right side up, matching Motive.

Five configurations cover the fleet. `dump12` is the default for every DT.

| Config | Layout | Tires |
|---|---|---|
| `dump12` | steer + pusher + tandem drive | 12 |
| `quad14` | steer + two pushers + tandem drive | 14 |
| `tandem10` | steer + tandem drive | 10 |
| `single6` | steer + single drive axle | 6 |
| `light4` | front + rear, all singles | 4 |

HT configs were assigned by a guess from the model name and **will need correcting
truck by truck** as people work through them. That is expected, not a defect. The
dropdown on the vehicle screen is there for exactly this.

### The wear rate

A tire's history is a series of `(odometer, depth)` points. The mount record supplies
the first one; every walk-around adds another.

```
miles per 32nd  =  (last odometer − first odometer)
                   ─────────────────────────────────
                     (first depth − last depth)

miles per mil   =  miles per 32nd ÷ 31.25      (1/32 inch = 31.25 mils)
```

**Higher is better.** More miles bought for every 32nd given up.

A tire with only its mount record has no rate. That is correct — do not fabricate one
from a single point, and do not show a zero. Show a dash. One walk-around after mounting
produces the first real number.

Projected life to pull:

```
est. miles remaining  =  (current depth − pull depth) × miles per 32nd
```

### Pull thresholds

Federal minimums under 49 CFR 393.75 are **4/32 on steer axles** and **2/32 everywhere
else.** Running to the legal minimum is not the plan. Defaults in `settings` are
**6/32 steer, 4/32 all others**, adjustable in one place.

Steer detection is `position ~ '^1[LR]$'` — axle 1, single. It is deliberately narrow.
If a truck ever runs a config where axle 1 is not the steer, this needs revisiting.

### What "retread" means here

`tire_type` is a property of the tire as mounted, not the casing. A casing that has been
retreaded twice produces three separate `tires` rows over its life. Use `casing_id` to
follow one physical casing across those rows — that is how you answer "how many turns
are we getting out of a casing before it fails."

### Brands

Brand is picked from a dropdown, never typed. This is not a nicety — free text produces
"Bridgestone", "bridgestone", and "Bridgstone" as three separate bars on the comparison
chart, and the whole point of the tool is that comparison.

The list lives in the `tire_brands` table, so adding a vendor is a row insert, not a
deploy:

> Bridgestone · Continental · Firestone · Goodyear · Maxam · Michelin · Other

**Other** opens a free-text box and stores whatever is typed on `tires.brand` as-is. It
is an escape hatch for a one-off, not a place to park a brand we buy regularly — if the
same name shows up in Other more than a couple of times, add it to `tire_brands`.

Retread brand is entered the same way. Note that the retread *process* brand (Bandag,
for instance) and the *casing* brand are different things; today the field records one
of them. If that distinction starts mattering for warranty claims, it needs a second
column.

---

## Data model

See `schema.sql` for the full definition. The shape:

- **`vehicles`** — the fleet. Seeded from Motive, carries `motive_vehicle_id` for
  odometer sync.
- **`tires`** — a tire mounted at a position over a period. `removed_date` null means
  currently mounted. A partial unique index enforces one active tire per position.
- **`tread_readings`** — one depth measurement on one tire at one odometer.
- **`odometer_log`** — mileage entries, whether from a walk-around, a manual entry, or
  a future Motive sync.
- **`settings`** — single row, pull thresholds.

Two views do the arithmetic so it lives in one place and cannot drift between screens:

- **`tire_wear`** — per tire: miles run, 32nds worn, miles per 32nd, miles per mil.
- **`active_tires`** — everything the vehicle screen needs, including projected
  remaining miles and cost per mile.

**Put the math in the views, not in the React.** If someone later builds a Power BI
report off this database, it needs to produce the same numbers as the app.

---

## Fleet roster

`seed-fleet.sql` contains **134 active units — 50 DT and 84 HT** — pulled from Motive on
08/24/2026, with Motive vehicle IDs attached. Deactivated and out-of-service units are
excluded.

The seed is written as an upsert on `number`, so re-running it refreshes make, model,
year, and Motive ID without touching tires or readings.

**To refresh the roster from Motive:** `list_vehicles`, three pages at 100 per page
(pagination caps out — do not expect one call to return everything). Filter to
`status = 'active'` and numbers beginning `DT-` or `HT-`. Note that some HT numbers
appear twice in Motive with one record deactivated; take the active one.

---

## Motive odometer sync — the next real feature

Mileage is entered by hand today. It does not have to be. This is the highest-value
thing left undone and it should be the first item after launch.

Motive exposes engine miles per vehicle through `get_vehicle_utilization` on the fleet
endpoint. `vehicles.motive_vehicle_id` is already populated for all 134 units, so the
join is done.

Suggested shape: a scheduled Supabase Edge Function, nightly, writing one
`odometer_log` row per vehicle with `source = 'motive'`. Then the walk-around screen
pre-fills the odometer and the person with the gauge only types tread depths.

Two cautions from prior work against this API:

- Pagination is quirky. Page through explicitly and verify counts rather than trusting
  a single response.
- Some units have no ELD device attached and will return nothing. Fall back to the last
  manual entry rather than writing a zero.

---

## Decisions left open

Flagging these so whoever picks this up knows they are choices, not oversights.

1. **Rotations.** Moving a casing from one position to another currently means pulling
   it and mounting it again, which splits its history. If position-to-position rotation
   becomes routine, the reports should follow `casing_id` instead of `tires.id`.
2. **Irregular wear.** We record one depth per tire. Real diagnosis needs inside,
   center, and outside shoulder separately — that is how you catch an alignment problem
   before it eats a set of steers. Three columns instead of one, if the shop will
   measure it.
3. **Cost per mile.** The field exists and the view computes it, but nothing feeds tire
   cost in automatically. Either people type it at mount time or it comes from
   purchasing.
4. **Who enters data.** Everything below assumes the shop does the walk-arounds. If it
   ends up on drivers instead, the entry screen needs to be much simpler and probably
   phone-first.

---

## Operating runbook

*For whoever owns the tool day to day, not the developer.*

### Setting up a truck the first time

1. Open the truck. Confirm the axle configuration in the dropdown matches what is
   actually under it — count the tires on the diagram against the truck.
2. Tap each empty position and mount the tire that is on it. Pick the brand from the
   dropdown, mark it virgin or retread, and record the tread depth you measure right
   now plus today's odometer. If the brand is not on the list, choose **Other** and type
   it — then tell whoever owns the tool so it can be added properly.
3. That mount reading is the baseline. It does not have to be a brand new tire — a
   half-worn tire recorded accurately today still produces a valid wear rate going
   forward.

### The monthly walk-around

1. Open the truck, tap **Record tread**.
2. Enter the odometer once, at the top.
3. Walk the truck with the gauge and type each depth into the diagram. The layout
   matches the truck, so go in the order you walk it.
4. Save. Anything you skip is simply not recorded — you do not have to do all twelve.

Monthly is enough. Weekly produces more data than the wear rate needs and burns
goodwill in the shop.

### Reading the numbers

- **Miles per 32nd** is the comparison number. Higher is better.
- A brand comparison built on **fewer than five or six tires per brand** is noise. Give
  it a season before drawing conclusions.
- **Outer versus inner on duals** is where the useful surprises live. A consistent gap
  across many trucks points at alignment, pressure, or loading — not at the tire.
- **Steer positions wear differently from drives.** Never compare them directly.

### Exports

Settings has CSV exports for tires, tread readings, and the mileage log. They open
straight into Excel and are the right input for anything that needs to reach the DOT
Committee or a vendor conversation.

---

## Files in this package

| File | What it is |
|---|---|
| `HANDOFF.md` | This document |
| `schema.sql` | Postgres/Supabase schema, views, RLS policies |
| `seed-fleet.sql` | 134 active DT and HT units with Motive IDs |
| `TireWear.jsx` | Working prototype — reference for layout and behavior |

**Questions on intent, the metric, or what the shop will actually do:** Jason Ward,
Haul Division.
