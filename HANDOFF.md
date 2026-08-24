# Tire Wear — Handoff

**The Allen Company · Haul Division**
Prepared 08/24/2026 · Owner: Jason Ward, Superintendent, Haul Division
Built and deployed 08/24/2026 · Live at https://tirewear.netlify.app

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

**Built and running.** The app is live at `tirewear.netlify.app`, backed by Supabase.
Open it, type your Allen email, and you are in — no password and nothing to wait for.
Everything entered is shared: what the shop records, the office sees.

The prototype's layout, wear math, and interaction model were kept as-is. What changed
is underneath — browser-scoped storage became a real database, and the fleet roster
became rows instead of a hard-coded array.

What is done:

- All 134 units (50 DT, 84 HT) seeded from Motive with their Motive vehicle IDs.
- Tread entry, mileage entry, mounting, pulling, the diagram, and the reports.
- Wear rates computed in a database view, not in the React — see below.
- Every reading is stamped with the email of whoever took it.
- CSV exports for tires, tread readings, and the mileage log.

What is not:

- **Motive odometer sync.** Mileage is still typed in. This is the next real feature
  and it is described near the bottom of this document.
- **HT axle configurations.** Assigned by a guess from the model name and still need
  correcting truck by truck. The dropdown on the vehicle screen is there for that.

---

## How it is built

Same stack as the tire tracker rebuild and the truck ordering app, so there is nothing
new to learn and nothing new to pay for:

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Database | Supabase (Postgres), project `allen-qc` |
| Access | None. The app asks for an Allen email and takes your word for it — see below |
| Hosting | Netlify, deploys from `main` on push |
| Charts | Recharts |

### Where the data lives

The tables are in the **existing `allen-qc` Supabase project**, not a new one, and are
namespaced `tw_` — the same pattern the other apps in that database already use
(`hct_` for the Haul Cycle Tracker, `bid_` for bid history, `po_` for purchasing). One
database to back up, one set of logins, and a project that is actively used and so is
never going to go idle and pause.

If tire wear ever needs to stand on its own, moving it out is a schema dump of the
`tw_` tables into a fresh project and a change of two environment variables.

### Running it locally

```
npm install
cp .env.example .env.local     # then fill in the anon key
npm run dev
```

### Deploying

Netlify builds `npm run build` and publishes `dist/`. Two environment variables have to
be set in the Netlify UI, and they are the only configuration there is:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Who can get in — read this before assuming it is locked

**There is no login.** The app asks for an email, checks it ends in `@theallen.com`,
and lets you through. That check runs in the browser, so it is a name badge, not a
lock: anyone with the URL can read and change tire data. This was a deliberate call —
waiting on a sign-in email every time was not worth it for a monthly walk-around, and
the Haul Cycle Tracker already runs the same way.

What that costs, stated plainly:

- Anyone who has the link can read every tread reading and edit or delete any of it.
- The email on a reading says who *claimed* to take it. It is not proof.

What it does **not** cost — the hole is exactly the `tw_` tables and nothing more.
Row level security is per table, so the QC tests, the bid history and purchasing that
share this Supabase project all still refuse anonymous access. `scripts/check-anon-access.mjs`
asserts that; run it after any policy change:

```
set -a && . ./.env.local && set +a && node scripts/check-anon-access.mjs
```

If this ever needs to be a real lock, in rough order of effort:

1. **Netlify password protection** on the project — one shared password, no email
   round-trip, nothing to build. Closest thing to free.
2. **Supabase Auth** — the magic-link screen this replaced is in the git history at
   `src/SignIn.jsx` (commit `b5f7d6d`). Restoring it means putting the redirect URL in
   the Supabase dashboard and dropping the `tw_*_anon_all` policies.

### Layout of the code

| File | What it is |
|---|---|
| `src/TireWear.jsx` | The whole UI — fleet list, diagram, dialogs, analysis, settings |
| `src/data.js` | Every database read and write. The only file that knows SQL exists |
| `src/App.jsx` | Chooses between the name-badge prompt and the app |
| `src/Identify.jsx` | The "who is entering data" screen |
| `src/identity.js` | Allowed email domains, and remembering you on this device |
| `src/theme.js` | Palette and type stacks |
| `src/index.css` | The handful of layout utilities the components use |
| `scripts/check-anon-access.mjs` | Asserts anon reaches the `tw_` tables and nothing else |

To allow another email domain, add it to `ALLOWED_DOMAINS` at the top of
`src/identity.js`. That is the only place it is written down.

`CONFIGS`, `positionsFor`, `TruckDiagram`, and `TireCard` are unchanged from the
prototype. The diagram is the part people actually use and it took the most iteration
to get right — leave it alone unless the truck changes.

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

### Notes on a wheel

`tw_tires.notes` is free text about the tire as mounted — "sidewall plug from a road
hazard, watch it." It is typed at mount time or edited from the tire dialog, shows
under the brand on the wheel positions table, and puts a gold dot on that tire in the
diagram so nobody has to go looking for it. It rides along in the tires CSV export.

**It is overwritten, not appended to, and carries no history.** That is the deliberate
limit: it answers "what should I know about this wheel right now," not "when did this
start." A dated observation — "chunking on the outside shoulder, 07/15" — wants a note
on the *reading* instead, which would be a `notes` column on `tw_tread_readings` and a
second box on the walk-around screen. That was considered and left out to keep one box
in front of a mechanic holding a gauge. Add it if the shop asks for dated notes.

Neither is a substitute for measuring irregular wear properly — see the open decision
on inside/center/outside depths below.

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

- **`tw_vehicles`** — the fleet. Seeded from Motive, carries `motive_vehicle_id` for
  odometer sync.
- **`tw_tires`** — a tire mounted at a position over a period. `removed_date` null means
  currently mounted. A partial unique index enforces one active tire per position.
  `notes` is free text on that wheel — see below.
- **`tw_tread_readings`** — one depth measurement on one tire at one odometer.
- **`tw_odometer_log`** — mileage entries, whether from a walk-around, a manual entry, or
  a future Motive sync.
- **`tw_settings`** — single row, pull thresholds.
- **`tw_tire_brands`** — the brand dropdown. Adding a vendor is a row insert.

Two views do the arithmetic so it lives in one place and cannot drift between screens:

- **`tw_tire_wear`** — per tire: miles run, 32nds worn, miles per 32nd, miles per mil.
- **`tw_active_tires`** — everything the vehicle screen needs, including projected
  remaining miles and cost per mile.

**The math is in the views, not in the React.** The app reads `tw_tire_wear` for every
rate it shows and only applies the pull threshold itself. If someone later builds a
Power BI report off this database, it produces the same numbers as the app because it
is the same arithmetic.

A tire with only its mount record has no rate, and the view returns null rather than
zero for it. The app shows a dash. Do not change either half of that.

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
endpoint. `tw_vehicles.motive_vehicle_id` is already populated for all 134 units, so the
join is done.

Suggested shape: a scheduled Supabase Edge Function, nightly, writing one
`tw_odometer_log` row per vehicle with `source = 'motive'`. The `source` column already
accepts `'motive'` and the app already shows it. Then the walk-around screen
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

Entering a depth at an odometer you already recorded corrects that reading rather than
adding a second one, so a typo caught later in the day is just re-entered.

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
| `schema.sql` | Postgres/Supabase schema, views, RLS policies. Already applied |
| `seed-fleet.sql` | 134 active DT and HT units with Motive IDs. Already run |
| `src/` | The app — see the layout table above |
| `netlify.toml` | Build command, publish directory, SPA redirect |

**Questions on intent, the metric, or what the shop will actually do:** Jason Ward,
Haul Division.
