# Tire Wear — Handoff

**The Allen Company · Haul Division**
Prepared 08/24/2026 · Owner: Jason Ward, Superintendent, Haul Division
Built and deployed 08/24/2026 · Live at https://allenhaul.netlify.app

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

**Built and running.** The app is live at `allenhaul.netlify.app`, backed by Supabase.
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
- **Defects** — log a fault, claim it, mark it repaired, with the out-of-service
  ones sorted to the top.
- **PM** — twelve service programs, a due board by miles and by months, and a
  history per truck.
- **Timecard and Hours** — mechanics book time against a truck and a cost code,
  and the hours roll up by mechanic and by unit.
- **Inventory** — parts stock, a reorder list, and a CSV import from whatever the
  shop exports today. This app is the system of record for stock now.
- **Motive sync** — a nightly Netlify Function pulls every truck's odometer and
  any new DVIR defects. Mileage is no longer typed in.

What is not:

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

What it does **not** cost: row level security is per table, so the QC tests, the bid
history and purchasing that share this Supabase project still refuse anonymous access.
`scripts/check-anon-access.mjs` asserts that. Run it after any policy change **and after
adding a table**:

```
set -a && . ./.env.local && set +a && node scripts/check-anon-access.mjs
```

Everything at once, which is the way to run them:

```
set -a && . ./.env.local && set +a && node scripts/test-all.mjs
```

**Read the exit code, not the output.** A suite that fails to clean up prints
`CLEANUP DID NOT FINISH`, which contains no `!!` — grepping for failure markers once
reported a clean run that had left a row in the production database. `test-all.mjs`
exists so that cannot happen again.

The PIN suites have to create a mechanic, and the app deliberately cannot delete one.
They clean up through `tw_purge_test_mechanic`, which refuses any address not ending in
`@invalid` — a reserved TLD that can never be a real person. Real mechanics stay
undeletable, which is the property the suite is testing in the first place.

It names every table and view in the `public` schema, on purpose. A relation nobody
remembered to add to the list is the one that leaks, so the script fails on a name it
has never heard of rather than skipping past it. It also fails if a listed name has
been dropped or renamed, because an empty answer and a missing table look identical
from the outside and a typo would otherwise pass forever.

Two things it will not tell you:

- **It only checks reads.** Postgres answers a blocked `DELETE` by matching no rows
  instead of erroring, so the only probe that gives a straight answer on writes is an
  `INSERT` — and one that RLS turns out to allow would leave a junk row in a
  production database. Not a thing to do from a script that runs unattended.
- **Six tables outside Tire Wear are open to anon**, and it reports them every run
  rather than filing them away. `hct_jobs` and `hct_dispatch` are the Haul Cycle
  Tracker, which has no login either. `bid_geo_pods`, `bid_geo_prices` and the views
  `v_pod_membership` and `v_pod_prices` were opened deliberately by the bid app
  (migrations `bid_geo_prices_for_cascade_backtest` and `v_pod_prices_readonly`).
  None of them are Tire Wear's doing and closing one would break the app that opened
  it — raise it with that app's owner instead.

One column is held back from the browser rather than the whole table:
`tw_mechanics.pin_hash` is not granted to `anon`, so a `select *` on that table is
refused outright. The app asks for named columns. The check does too, and separately
asserts that `pin_hash` itself stays refused.

If this ever needs to be a real lock, in rough order of effort:

1. **Netlify password protection** on the project — one shared password, no email
   round-trip, nothing to build. Closest thing to free.
2. **Supabase Auth** — the magic-link screen this replaced is in the git history at
   `src/SignIn.jsx` (commit `b5f7d6d`). Restoring it means putting the redirect URL in
   the Supabase dashboard and dropping the `tw_*_anon_all` policies.

### Work orders, and the history

A work order is keyed on `(kind, source_key)` and opened **idempotently**. That is the
property that matters: the board asks for a number for every open defect on every
load, so asking twice has to hand back the same number. A truck with four numbers for
one fault is paperwork that has stopped meaning anything.

`tw_sync_defect_work_orders` gives every unrepaired defect a number and writes it back
onto the defect, so the two screens agree. Priority follows the defect — unsafe is
`now`, major is `today`.

Closing a work order does **not** mark the defect repaired. Those are different acts by
different people: the work order is the shop's paperwork, the repair is the mechanic's
statement that the truck is fixed.

**Work history is a view, not an audit table.** It unions the real rows from defects,
hours, parts, services, tread readings and orders. An audit log that has to be written
to by hand drifts the first time a code path forgets it, and then it is worse than
nothing, because people trust it. This one cannot drift: it *is* the rows.

### Purchasing

Vendors, ordering, receiving, requests and what went out. Two rules from the stock
work carry straight over, and both live in the database rather than in the browser,
because a rule enforced in the app is a rule until somebody opens the console.

**`on_hand` is still never written directly.** Receiving against an order writes a
`tw_part_txns` row and the trigger moves the number, so the count and the log still
cannot disagree — the movement log explains stock that arrived on a PO exactly the way
it explains stock somebody counted.

**`on_order` moves only inside the same statement as the line or receipt that
justifies it**, in `tw_commit_order` and `tw_receive_po_line`. An order that half
commits — lines written but `on_order` not moved, or the reverse — has the shop
ordering a second time for parts already on their way.

**Orders route by category.** The inventory export has no vendor column, so a part
follows whoever covers its category unless it names a vendor of its own. That is the
foreman's design and it matches how the shop already talks about suppliers.
`tw_part_vendor` resolves the override.

**A draft splits into one order per vendor**, because that is how it is sent: one email
each, not one listing four suppliers' parts. PO numbers are `HD-YYYY-NNNN`, taken
inside the insert so two people ordering at once cannot both take 0007.

**Long orders are not emailed.** Outlook truncates a `mailto` well before the 2048 the
spec allows and says nothing about it. Past 1,800 characters the screen refuses the
mail link and offers the text to copy instead — a silently cut-off purchase order is
worse than no purchase order.

### Jason's spec says no parts inventory, and we built one

**This is an open disagreement, not a settled decision.** It needs to go back to
Jason before anybody acts on it either way.

`HANDOFF-SHOP.md` rule 10 is explicit: parts are free text, a mechanic types a part
number or a plain description plus a quantity, and *"do not reintroduce a stock
system, a reorder board, or vendor purchasing unless Jason asks — that was a
considered decision, not an omission."* His new dashboard drops the Inventory tab
that his old one had, which is the same call made twice.

We have all of it: an Inventory section with stock, vendors, ordering, receiving,
requests and a CSV import, and a catalog search on the equipment card. Jacob asked
for it and, asked directly, chose to keep it as built for now and raise it with
Jason rather than have it removed on a document's say-so.

So: **do not remove Inventory, and do not "fix" the equipment card to free text,
without Jacob and Jason agreeing.** Either way it is a small change — the card
would take a typed string instead of a catalog id, and the section would come off
the nav. The database would keep the tables regardless; nothing needs dropping.

The middle option, if it helps: let the card accept a typed part that is not in the
catalog, so a mechanic never hits a wall, while a match still draws stock down.
That is what was recommended and not taken.

### The mechanic's own side of it

Three things a mechanic needs that the office views do not give them.

**The shift card** is more than a punch. Both times are editable and there is a lunch
deduction, because the mockup says "the clock fills these in, type over them if you
forgot to punch" — and a clock nobody can correct is one they stop using the first
morning they forget it. A stop earlier than the start means the shift ran past
midnight, so the stop moves to the next day rather than going negative.

Under it, **time accounted for** reconciles the two numbers that matter: hours on the
clock against hours booked to a truck and a code. The gap is the whole point — it
catches somebody who clocked nine and booked six, on their own screen, while they can
still remember why. Over-booking is flagged just as loudly as under-booking.

**Equipment worked** is the shape the shop asked for, and it is where most of a
mechanic's day now gets entered. One block per unit: pick the truck, run a clock on
it, say whether it was in the shop or an outside service call, what kind of work it
was, what you found, and what parts came off the shelf for it. `+ Add another unit`
adds a second, and Save writes them all at once.

Two things in it are not decoration.

The **sub-clock is per unit and it keeps its stints**. A mechanic starts on a truck,
gets pulled to a road call, comes back. One elapsed number would lie about that, so
`tw_time_entries.stints` holds `[{start, stop}]` and `unit_seconds` the total. The
hours field is what payroll charges; the clock fills it in, rounded to the quarter
hour, and a mechanic can type over it — same rule as the shift card, for the same
reason. Once they type, the clock stops overwriting it. Saving is refused while a
clock is still running, and closing the tab with one running asks first.

The **parts pulled here are issued against the time entry**, not just the truck:
`tw_part_txns.time_entry_id` points back at the hours that pulled them. That is what
makes "what did this job cost" answerable — the labour and the parts share an id. If
a part issue fails the hours still stand, and the message says which parts did not go
through rather than silently dropping either half.

Shop time, cleanup, a parts run, a safety meeting — anything not against a unit — goes
in through **Add hours** instead. The card requires a unit on purpose.

One trap worth knowing: `updateEntry` only writes the equipment-card fields when they
are passed. The Add hours dialog does not know about stints or type-of-work, and an
edit from it must not wipe them off an entry made on the card.

**My jobs** lives under Timecard, behind the PIN, because it is one person's own
work and should not be readable by whoever happens to be standing at the tablet. It is
the same data as Defects and PM, scoped to them. A mechanic
standing at a truck wants their own three jobs, not the shop's sixty; the Defects tab
is the right view for a foreman and the wrong one for whoever is holding the wrench.

**My history** is the shop-wide history narrowed to one name, plus their closed
shifts.

One thing worth remembering about the PIN pad. Its submit effect must not depend on
the state it sets. It did once — setting `working` re-ran the effect, whose cleanup
marked the running attempt stale, so the code clearing it never ran and the pad stayed
disabled after four digits. Nobody could sign in, and no unit test could see it. The
guard is a ref now. The line about permanence is the mockup's and it stays: entries are added,
never edited or removed. A record you can quietly rewrite is not a record.

### Signing in on the shop floor

A mechanic taps their name on the roster and types four digits on a **number pad**,
with pips rather than a text field. That is the mockup's design and it is the right
one: this runs on a shared tablet, often with gloves on, and a phone keyboard sliding
up over a password box is the wrong control. The pips show progress without ever
showing the PIN, and four digits submits itself rather than making somebody hunt for a
button.

**Email is optional and most of the shop has none.** The roster arrived with one person
listed as "D. Bradley" — there is no email to be had there, and inventing one would
mean a person who cannot sign in. So the PIN hangs off the row id, not the address.
The email-keyed functions still exist untouched, because the office uses them and
Jason Ward already had a PIN against his.

Roles are recorded — `mechanic`, `dashboard`, `admin` — and **gate nothing yet**. That
was the call: everyone sees everything for now, and the roles are there so the list is
not lost and so gating later is a UI change rather than another migration.

Five wrong tries locks an account for fifteen minutes. Long enough to stop somebody
thumbing 0000 to 9999 on a tablet, short enough that a fat-fingered mechanic is not
stuck for the shift. A reset under Setup clears it.

### The clock is not the timecard

**The shop's day is an Eastern day, and `todayISO()` in `src/day.js` is the only
place that decides it.** It was `new Date().toISOString().slice(0, 10)` — the UTC
date — while `tw_shift_days` stamps `work_date` in `America/New_York`. So between
8pm Eastern and midnight the two disagreed: a mechanic on an evening shift punched
in, the timecard defaulted to tomorrow, the shift card looked for their shift under
the wrong day, and it read back "Not clocked in" while their clock was running.
Jason Ward's first punch-in landed at 8:44pm Eastern, squarely in that window. It has
its own module rather than living in `ui.jsx` so the test scripts, which Node runs
without a JSX loader, can hold the app to the same day.

`tw_shifts` says a mechanic is in the shop. `tw_time_entries` says what the work was
and what it charges to. They are deliberately separate: the Now board has to show
somebody from the moment they punch in, not once they have filled a form in, and the
two answer genuinely different questions.

One open shift per mechanic, enforced by a partial unique index rather than by the
app, because pressing the button twice is exactly what happens when a shop tablet is
slow. The second press comes back as "Already on the clock" instead of a database
error on a wall-mounted screen.

A shift still open from a previous day is flagged **stale** and can be closed from the
board. A nineteen hour timer is a missed punch-out, not a long day, and showing it as
though it were real would make the whole board untrustworthy. Closing one books no
hours — those are entered on the timecard, by the mechanic, behind their PIN.

Elapsed time is recomputed from the start timestamp on every tick rather than counted
up in the browser, so a screen left on overnight shows the truth.

### The payroll export

Seventeen columns, and the column list is Jason's, not ours:

`Date · Employee # · Mechanic · Cost code · Cost code name · Unit · Shop or service
call · Job/location · Hours · True clocked hours · Segments · Work order · Type of
work · DVIR · PM · Parts used · Work performed`

It reads `tw_payroll_lines` rather than rebuilding the rows out of whatever is on
the Hours screen, and it always exports the whole range: **the search box narrows
the tables and must never narrow the export**, because a filtered payroll run is a
wrong one.

Every join in that view is a LEFT JOIN and that is deliberate. An hour missing a
cost code is exactly the row payroll needs to chase, so nothing in the view may
quietly drop it. As it happens our schema is stricter than Jason's here — his
`cost_code` is nullable and the app blocks the save, ours is NOT NULL, so rule 6 is
enforced by the database and no screen can get round it. The LEFT JOIN stays anyway;
it costs nothing and the constraint could be relaxed by somebody who has not read
this.

`trim_scale` on the parts quantity is load-bearing in a small way: `qty_delta` is
numeric, so without it two of something reads "2.00x" instead of "2x".

### The work log, and why it has no delete

`tw_work_log` is the one append-only table. There is **no update policy and no
delete policy, for anybody**, and the grants say the same thing so flipping a policy
alone cannot undo it. `scripts/test-payroll.mjs` asserts both — if somebody grants
those by accident, that suite goes red.

Deleting a timecard writes a `timecard_deleted` row holding the whole card and a
required reason, and the log write happens **before** the rows are removed. If the
log will not take it, the delete does not happen. That ordering is the entire point:
an auditor needs to see what was removed and why, not find a gap where a day was.

Two consequences worth knowing:

- `log()` swallows its errors and `logStrict()` throws. Recording work must never
  take down the work — a mechanic should not lose a saved card because a log insert
  failed. Deletion is the exception and uses `logStrict`.
- `mechanic_id` is `ON DELETE SET NULL` and `actor_name` is text, so a log row
  outlives the mechanic it names. That means purging a test mechanic **orphans**
  their log rows rather than removing them, which is why the tests purge the log
  first and why `tw_purge_test_work_log_by_actor` exists. Both purge functions
  refuse anything that is not plainly a test row.

### Who can see what

**The site is open.** No password in front of it. The shop floor has to be able to
punch in and book hours without one, and a wall between a mechanic and their own
timecard is a wall between the shop and using this at all.

**Hours and Setup ask for a supervisor.** Tap your name, enter your PIN, and you are
let through only if your role is `dashboard` or `admin`. It reuses the roster and the
PINs that already exist rather than adding a second shared secret: nothing new to
remember, nothing to circulate when somebody leaves, and it records *who* looked rather
than only that somebody did. It times out after twelve hours, because a supervisor
screen left open on a shared tablet is the thing this is for.

Everything else — Now, Defects, PM, Timecard, Inventory, Tires, Work orders — is open
to anyone in the shop.

**Be honest about what this is.** The Supabase key is in the page, and it can read
hours, parts and purchase orders. Somebody who opens the browser console can read that
data whatever the screen shows them. This keeps people out of screens they have no
business wandering into; it is a door with a lock, not a vault. If hours or pay ever
need to be genuinely private, that is real per-person auth — Supabase Auth and RLS by
role — and it is a real piece of work, not a setting.

There *was* a site-wide password gate (`netlify/edge-functions/gate.js`, removed in the
commit that added this section). It worked, and it is in the git history if the posture
ever changes: it ran at the edge and withheld the bundle itself, which is the only way
a password in front of a static site means anything. It was the wrong shape here
because it locked out the people who most need to get in.

### This is a shop system now, and tires are one section of it

The Haul Division shop foreman asked for the site to carry the rest of the
shop's paperwork, not just tires. So the app is a **shell with sections**, and
Tire Wear is the first of them — unchanged, just no longer the whole site.

**Everything in the foreman's mockup is built.** Now, Defects, PM, Timecard, Hours,
Inventory (with the whole purchasing side), Tires, Work orders and Setup.

**To add a section:** write a component, add a row to `SECTIONS` in
`src/sections.jsx`. The shell picks up the nav, the header blurb, and the
sub-tabs from that row. Nothing else needs touching.

```js
{ key: "hours", label: "Hours",
  blurb: "Labour hours by mechanic and by truck",
  subTabs: [["week", "This week"], ["month", "This month"]],
  Component: HoursSection }
```

A section component is handed `{ who, tab, onBusy }` and renders its own body.
`tab` is whichever sub-tab is showing; call `onBusy(true|false)` while writing
so the Saving… chip in the header knows.

The section row hides itself while there is only one section — a lone tab that
does nothing reads as a bug. It appears as soon as a second one is registered,
and the sub-tabs step down to an underline so the two rows are not peers.

**The one rule that matters:** there is exactly one copy of the tire logic, and
it is `src/TireWear.jsx`. The foreman's mockups each carried their own copy,
already drifted — one wrote `type:"New"` where the database only accepts
`virgin` or `retread`, and opened tires with `brand:"Unknown"`, which quietly
poisons the brand comparison the tool exists to produce. If a mechanic screen
needs to record tread, it calls this section's code, not a copy of it.

### Layout of the code

| File | What it is |
|---|---|
| `src/AppShell.jsx` | The frame: logo, who you are, section nav, sub-tabs |
| `src/sections.jsx` | The section registry — add a section here |
| `src/ui.jsx` | Buttons, fields, modal, card, table styles. Shared by every section |
| `src/TireWear.jsx` | The Tires section — fleet list, diagram, dialogs, analysis, settings |
| `src/DefectsSection.jsx` | The Defects section |
| `src/PmSection.jsx` | The PM section |
| `src/TimecardSection.jsx` | The Timecard section — the PIN gate lives here |
| `src/HoursSection.jsx` | The Hours rollups. Read only |
| `src/InventorySection.jsx` | The Inventory section, including the CSV import |
| `src/data.js` | Tire reads and writes. The only tire file that knows SQL exists |
| `src/shopData.js` | Defect and PM reads and writes |
| `src/timeData.js` | Mechanics, PINs, cost codes and timecards |
| `src/partsData.js` | Parts reads and writes |
| `src/csvImport.js` | Reading a parts export and planning an import. Pure, no database |
| `src/App.jsx` | Chooses between the name-badge prompt and the shell |
| `src/Identify.jsx` | The "who is entering data" screen |
| `src/identity.js` | Allowed email domains, and remembering you on this device |
| `src/theme.js` | Palette and type stacks — the only place colours are written down |
| `src/AllenLogo.jsx` | The company wordmark, drawn as SVG |
| `src/index.css` | The handful of layout utilities the components use |
| `scripts/check-anon-access.mjs` | Every relation in `public`: what anon may reach, what must stay shut, and `pin_hash` |
| `scripts/test-all.mjs` | Runs every suite and believes the exit code |
| `scripts/test-setup.mjs` | The roster admin and the cost-code paste reader |
| `scripts/test-now.mjs` | The punch clock and the board numbers |
| `scripts/test-purchasing.mjs` | Vendors, ordering, receiving, requests |
| `scripts/test-work.mjs` | Work orders and the history view |
| `src/WorkSection.jsx` | Work orders and work history |
| `src/PurchasingScreens.jsx` | Order, Vendors, Requests, Issued |
| `src/purchasingData.js` | Vendors, orders and requests I/O |
| `src/NowSection.jsx` | Who is on the clock, and the shop at a glance |
| `src/MyJobsSection.jsx` | One mechanic's worklist: assigned, defects, PM due |
| `src/nowData.js` | Shifts and the board numbers |
| `netlify/edge-functions/gate.js` | The site password, checked before anything is served |
| `src/SetupSection.jsx` | The roster and the cost codes |
| `src/setupData.js` | Roster and cost-code I/O |
| `src/codePaste.js` | Reads a pasted cost-code list. Pure |
| `scripts/test-motive.mjs` | The Motive sync logic, on fixtures. No key needed |
| `scripts/check-motive.mjs` | Asks a deployed sync endpoint what it would do |
| `netlify/functions/lib/motive.mjs` | Talks to Motive and decides what should change |
| `netlify/functions/lib/sync.mjs` | Reads our side, runs the plan, writes it |
| `netlify/functions/motive-sync.mjs` | On demand over HTTP, dry run by default |
| `netlify/functions/motive-nightly.mjs` | The same on a schedule, 05:00 UTC |
| `scripts/_testkit.mjs` | Safety rig for the write tests — read this before touching them |
| `scripts/test-tires.mjs` | Exercises the tire data layer against the real database |
| `scripts/test-shop.mjs` | Exercises defects and PM against the real database |
| `scripts/test-pins.mjs` | The PIN security properties — run this after any auth change |
| `scripts/test-timecards.mjs` | Exercises the timecard data layer |
| `scripts/test-parts.mjs` | The CSV reader, the import planner, and stock movements |

To allow another email domain, add it to `ALLOWED_DOMAINS` at the top of
`src/identity.js`. That is the only place it is written down.

### Testing against the database people are using

There is no staging copy. `scripts/test-tires.mjs` and `scripts/test-shop.mjs`
write to the same database the shop has open, so they are built to survive
that. The rules are in `scripts/_testkit.mjs` and are worth reading before
changing either script:

- Every row a test creates carries a marker, and cleanup deletes by that
  marker and nothing else.
- Cleanup runs in a `finally`, and the script cannot exit before it. Fail by
  throwing; never `process.exit()` mid-test.
- Anything a test *changes* rather than creates is read first and put back to
  what it was — never to what the test assumed it was.
- Tests ask for an idle truck (no tires, no mileage) rather than naming a
  favourite, and skip the write path entirely rather than write to one the
  shop is using.
- If cleanup fails it says so loudly, with the SQL to run by hand.

All five exist because the first version broke them. It exited early on a
failed assertion and left an out-of-service defect at the top of the shop's
board, and it restored an axle config to a hardcoded `dump12` — which would
have quietly corrupted any truck someone had corrected.

Run them:

```
set -a && . ./.env.local && set +a && node scripts/test-tires.mjs
set -a && . ./.env.local && set +a && node scripts/test-shop.mjs
```

**When this stops being good enough:** the moment a test needs to write
something a person would act on — hours against a real mechanic's name, for
instance. At that point spin up a Supabase branch per run (about $0.013 an
hour, so pennies) and point the scripts at its URL and key instead. Nothing in
them assumes production; only `.env.local` does.

### Look and feel

Deep green chrome with a yellow accent. Every colour lives in `src/theme.js` — change
it there and the whole app follows, including the logo and the charts.

The logo is **drawn as SVG in `AllenLogo.jsx`, not a photograph of the sign.** The sign
is black on a white wall, which cannot sit on a dark header, and a vector stays sharp
from the favicon to a phone. It fills with `currentColor`, so the caller picks the
colour. Every word carries a `textLength`, which pins the composition to the same width
if Barlow Condensed has not loaded yet — without it a fallback face pushes the wordmark
out of its own box.

Two things worth knowing before touching the palette:

- **The brand greens are all darker than the "in service" green** on purpose. Chrome
  should not be mistakable for a status.
- **The three status colours exist twice**: `good` / `watch` / `pull` are the on-white
  values used by pills and tables, and `goodOnDark` / `watchOnDark` / `pullOnDark` are
  lifted for the tread numeral on the dark green tire card. When the chrome went from
  navy to green the on-white green landed almost on the card's own hue and the depth
  turned to mud. If you restyle, keep both sets.

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

### Defects, and the state Motive owns

Jason's rule 1: **nothing in this system closes a DVIR.** A mechanic marking a
defect repaired takes it off their queue and does not close the record — only
Motive does that, and nothing here writes back to Motive. The Defects tab says
so on the screen, and the repaired list is sorted oldest-wait-first with the
count and the longest wait stated plainly, because left alone these sit forever.

**Not yet implemented, and it is a real gap.** His schema has three states —
`open`, `repaired`, `closed` — where `closed` is set only when a Motive sync
stops reporting the defect. Ours has `open`, `claimed`, `repaired` and no
`closed`, and `planDefects` only ever creates and bumps: it never reconciles a
disappearance. So a repaired defect stays on the waiting list forever, and a
defect that vanished from Motive stays open forever.

Closing that gap means the sync marking a defect `closed` when Motive stops
reporting it, and it carries the one requirement Jason flags hardest: **a sync
must not resurrect a repaired defect onto a mechanic's list, and must preserve
`repaired_by` and `repair_note` when it closes one.** Getting it wrong corrupts a
DOT record, which is why it was left alone rather than done quickly.

### Defects

A defect is something wrong with a truck. Today they are typed in; once the
Motive sync exists they will mostly arrive on their own, because **a defect is a
mirror of an open DVIR item plus the shop's workflow on top**.

That split is the thing to hold onto. The Motive columns — category, note,
driver, how many times it has been reported — are refreshed on every sync.
The workflow columns — claimed, repaired, hours, work order — belong to the shop
and survive a refresh. `defect_key` is how a Motive item is recognised across
syncs, and **gone from Motive means fixed, so it closes.** A defect the shop
finds itself is `source = 'manual'` with a key no sync will ever produce, so
reconciling against Motive can never close it by accident.

The Open list sorts out of service first, then major, then oldest. A truck that
cannot legally roll outranks a truck with a broken mirror, however long the
mirror has been broken.

Reopening a repaired defect clears the repair details. A `repaired_by` sitting
on a defect that is not repaired is a lie in the record, and the database
refuses the half-written version of it too.

### Preventive maintenance

A **program** is a service and how often it comes due: by miles, by months, or
both. **Whichever trigger fires first wins.** `lead_miles` and `lead_days` are
how early the warning starts — an oil change with a 1,500 mile lead goes amber
at 13,500 miles into a 15,000 mile interval.

A **completion** is a service actually performed. The newest one for a truck and
program is the baseline the next due date counts from; the older ones are the
history, and they stay.

**A program with no completion recorded against a truck has no baseline, and
reports `nobaseline` — not overdue.** This is the same rule as a tire with only
its mount reading, and for the same reason: you cannot know a truck is late for
an oil change if nobody ever wrote down the last one. 134 trucks against 12
programs is 1,608 pairs, all of them starting with no baseline, so the board
says so plainly rather than drowning the shop in false overdues. Recording the
last service anyone remembers starts the clock.

Due dates are worked out against `tw_vehicle_meter`, which is the latest row in
the same `tw_odometer_log` the tire screens use. One answer to "how far has this
truck run", so PM and tires can never disagree about it.

### Parts, and why on_hand is never written directly

**This app is the system of record for stock.** The shop exports from
whatever it used before, imports the CSV here, and everything lives here
afterwards.

The rule the whole section is built on: **`on_hand` is never written
directly.** Issuing, receiving, counting the shelf and importing all go in
as rows in `tw_part_txns`, and a database trigger moves the number. The count
and the log therefore cannot disagree, and "why is there one left" always has
an answer. Do not add a screen that updates `on_hand` — add a transaction.

That includes the import. Bringing a CSV in writes an `import` transaction for
the *difference*, so re-importing a corrected export reads as a correction
rather than silently rewriting the count. New parts get their opening balance
the same way, so there is one code path and the log reads the same either way.

**The importer reads column names rather than dictating a template**, because
the export format is whatever the old system produces. `src/csvImport.js` holds
that logic and touches nothing — `parseCSV`, `guessMapping` and `planImport`
are pure, so they can be reasoned about and tested on their own. Matching is
two passes, every exact match before any fuzzy one: a single greedy pass filed
"Unit Cost" as the unit of measure, because `uom` hints on "unit".

Nothing is written until somebody has seen the plan: how many parts are new,
which quantities change and by how much, and which rows were skipped and why.
A stock import that silently rewrites hundreds of counts is not something to
run blind.

Issuing more than is available warns but goes through. The shelf is the truth
and the count should follow it.

### Timecards, and what the PIN is really worth

Every hour on a timecard carries a **cost code** — that is the whole reason
the timecard exists. Payroll cannot charge hours out without one, so the app
refuses to save a line without it. Every hour also needs a home: a truck, or
a label saying what it was instead (plant work, a parts run, a safety
meeting). The database enforces both.

The fourteen cost codes are Allen's own, grouped Vehicle / Plant / Other.

**There is no roster yet, so the roster builds itself.** The first time
somebody opens their timecard they enter their name and choose a four digit
PIN, which creates their `tw_mechanics` row. When the real list arrives it
can be reconciled against what is there. Once it does, self-registration is
the thing to turn off.

**What the PIN is:** it stops a colleague opening your timecard on a shared
shop tablet. That is the thing that actually happens in a shop, and it is
handled properly — bcrypt, and the browser is never allowed to read the hash.
`tw_mechanics` is read-only to the app: the grants withhold `pin_hash`, every
write goes through a `security definer` function, and five wrong guesses locks
the account for fifteen minutes. `scripts/test-pins.mjs` asserts all of that
and should be run after any change near it.

**What the PIN is not:** protection against somebody who lifts the anon key
out of the page and posts to the database directly. Nothing client-side can
be. Hours are protected exactly as much as everything else here — the site
password keeps strangers out, the PIN keeps colleagues honest. If hours ever
need to be *provable* rather than merely attributed, that is real auth, and it
is a bigger change than a PIN.

The PIN unlocks for one browser tab, in `sessionStorage`. A tablet left on a
bench re-locks when the tab closes.

**Hours is read only.** It adds up what mechanics entered and never edits it.
It shows everybody's hours to anybody who is in the site, which is the
consequence of there being no roles yet; roles arrive with the roster.

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
- **`tw_defects`** — one row per fault. Motive-sourced columns plus the shop's
  workflow; see Defects above.
- **`tw_pm_programs`** — the services and their intervals.
- **`tw_pm_completions`** — one row per service performed. Newest is the baseline.
- **`tw_mechanics`** — who enters hours. Read-only to the app; `pin_hash` is
  withheld by column grant and only the PIN functions touch it.
- **`tw_cost_codes`** — Allen's chart, grouped Vehicle / Plant / Other.
- **`tw_time_entries`** — one row per chunk of work. A cost code is required,
  and so is either a truck or a label. The equipment card adds `work_types`
  (text[]), `unit_seconds`, `stints` (jsonb, `[{start, stop}]`),
  `work_performed`, `job_location` and `pm_program_id`.
- **`tw_parts`** — a part at a shop. The same number at two shops is two lines,
  because a bearing at Clays Ferry is no use to somebody at Nicholasville.
- **`tw_part_txns`** — every movement. A trigger applies each one to
  `tw_parts.on_hand`; nothing else may touch that column. `time_entry_id`
  points at the hours that pulled a part, so a job's labour and its parts
  can be costed together. Note the trigger is INSERT-only: deleting a
  movement does not put the stock back.

Two more views:

- **`tw_vehicle_meter`** — the latest odometer per truck, in one place.
- **`tw_pm_due`** — every active truck against every active program, with
  whichever trigger fires first and a `level` of over / soon / ok / nobaseline.
- **`tw_work_log`** — append only. See the section above before touching it.
- **`tw_payroll_lines`** — the seventeen-column payroll export.
- **`tw_timecard_days`** — one row per mechanic per day, clocked against booked.
  Its day keys come from a UNION of both sides on purpose: a mechanic who
  clocked in and booked nothing is the most important row on the board, and
  joining one side first drops the name off exactly those rows.
- **`tw_hours`** — time entries joined to the mechanic, unit and cost code.
  It LEFT JOINs the cost code: it used to be an inner join, which would have
  hidden any entry whose code was later retired. Changing its column order
  needs `DROP VIEW` then `CREATE VIEW` — `CREATE OR REPLACE` refuses to
  rename or reorder a view's columns. Recreate it with `security_invoker`.
- **`tw_parts_reorder`** — parts with a `stock_state` of out / low / ok /
  no reorder point / untracked, and a suggested order quantity.

And three functions, which are the only path to a PIN:
`tw_mechanic_register`, `tw_mechanic_verify_pin`, `tw_mechanic_change_pin`.

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

## The Motive sync

Two Netlify Functions, both in `netlify/functions/`:

| File | What it is |
|---|---|
| `lib/motive.mjs` | Talks to Motive, and decides what should change. No database. |
| `lib/sync.mjs` | Reads our side, runs the plan, writes it. |
| `motive-sync.mjs` | On demand over HTTP. Dry run unless told otherwise. |
| `motive-nightly.mjs` | The same thing on a schedule, 05:00 UTC. |

Shared code lives in `lib/` deliberately. Netlify turns **every top-level file** in the
functions directory into a deployed, publicly reachable function — so helpers named
`_motive.mjs` and `_sync.mjs` sitting next to the real ones became two extra endpoints
that answered `502 Runtime.HandlerNotFound` and printed an internal stack trace. A
subdirectory is not auto-discovered, so `lib/` is the fix. Anything shared goes there.

Two environment variables, set in the Netlify UI, **not** prefixed `VITE_` because
they must never reach the browser:

- `MOTIVE_API_KEY` — the organisation key from the Motive dashboard.
- `SYNC_TOKEN` — any long random string, gating the on-demand endpoint.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` — the same values as the `VITE_` pair, under
  names without the prefix.

That last one is not duplication for its own sake. A `VITE_` variable is compiled into
the browser bundle, so those two are scoped to **Builds** only, and a function reading
them at runtime sees nothing at all. The unprefixed pair is scoped to **Functions**.

Two things about Netlify environment variables that cost an afternoon:

- They are baked into a function **at deploy time**. Saving a variable does nothing to
  a function that is already deployed — it needs a new deploy before it can see it.
- A variable has a **scope**. One scoped to Builds is invisible to Functions even
  though both belong to the same site.

### Which odometer

Motive returns two numbers per truck. `odometer` is the engine's own, the one on the
dash. `true_odometer` is Motive's calibrated distance, and Motive's docs recommend it
for service scheduling.

**We take `odometer`.** Not because it is better in the abstract, but because every
reading already in this app was typed in by somebody reading a dash, and tire wear
here is the difference between the odometer when a tire was mounted and the odometer
now. Mixing the two would not look wrong — it would quietly produce wear rates that
are wrong, on the one screen the whole tool exists to make trustworthy.

That is checkable rather than assumed. A dry run prints both fields against the
readings we already hold and says which one lines up:

```
SYNC_URL=https://allenhaul.netlify.app SYNC_TOKEN=... node scripts/check-motive.mjs
```

Pass `--field true_odometer` to see the plan the other way round.

### Nothing is ever written backwards

An odometer only goes up. If Motive reports fewer miles than we already hold for a
truck — from the log or from what a tire was mounted at — the reading is **refused and
reported**, never written. A backwards reading in the middle of a wear calculation
produces negative miles run, and the number that comes out of that looks plausible.

### A DVIR is mostly not defects

Motive returns **every line of the checklist**, not just the faults. An entry with
`type: "none"` means the driver looked at it and it was fine. Thirty days of those came
to **2,967 rows, of which a couple of dozen were real defects.** Only `minor` and
`major` are imported; the rest are counted and dropped, and the dry run reports the
count so that if it ever falls to zero somebody notices the filter has broken before
the board fills with "Air Lines — fine".

Every field in an inspection report sits one level lower than Motive documents it:
`defects[].defect.{...}`, the report is keyed `log_id` rather than `id`, and there is no
nested vehicle object at all — only `vehicle_number`, so defects match on the unit
number rather than the Motive id. Same story on the odometer, which lives in
`current_location`, not on the vehicle. **Check a real response before trusting the
documentation on this API.**

`picture_url` is deliberately not stored: it is a signed S3 link that expires in fifteen
minutes, so keeping it would save a dead link.

### Repeat defects

Motive issues a fresh defect id on every inspection, so the same cracked mirror written
up on Monday and again on Tuesday arrives as two unrelated defects. A defect matching
one already **open** on the same unit, category *and note* bumps `report_count` and
`last_reported` instead of opening a second row.

The note is part of that key on purpose. Motive's commonest category is literally
`Other`, where the note is the only thing saying which fault it is — so merging on
category alone would quietly fold two unrelated faults into one. Splitting when we
should have merged leaves a visible duplicate somebody closes in a second; merging when
we should have split loses a fault nobody ever sees. A **repaired** one is never matched
against: if it was fixed and is written up again, it genuinely broke again, and that is
a new job.

An unsafe write-up upgrades a fault we had logged as minor. It never downgrades — once
a truck is called unsafe, a later quieter report is not permission to put it back on
the road.

### Running it by hand

```
export SYNC_URL=https://allenhaul.netlify.app SYNC_TOKEN=...
node scripts/check-motive.mjs                    # dry run, changes nothing
node scripts/check-motive.mjs --write            # actually sync
node scripts/check-motive.mjs --since 2026-07-28 # reach further back for defects
```

Everything is idempotent — odometer rows collide on
`(vehicle_id, reading_date, odometer)` and defects on `defect_key` — so running twice
is the same as running once, and a run that dies halfway can just be run again.

### Two things the first live run turned up

**Running it twice in a day adds rows rather than replacing them.** The unique key is
`(vehicle_id, reading_date, odometer)`, so a truck that has moved since the last run
reports a different number and that is a new reading, not a duplicate. Correct — the log
is a history and the wear maths uses first and last — but it means the nightly is the
normal path and hammering the on-demand endpoint inflates the log.

**Three units report a device odometer rather than a dash odometer.** HT-468 (a 2013
Hino) came back with **1 mile**, HT-1299 (2006) with 132, HT-239 (2008) with 267. Those
are what the ELD has counted since it was fitted, not what the truck has done. None of
the three has ever had a tire recorded against it, and there are no negative wear rows
anywhere, so nothing is corrupted — and the guard self-corrects, since a real dash
reading typed in later is higher and therefore accepted, after which Motive's next tiny
number is refused for going backwards.

The proper fix is in Motive, by setting the odometer offset on those three devices.
Until then their mileage on the truck screen is wrong in an obvious way rather than a
subtle one, which is the failure worth having.

### What this does not fix

**PM still needs a first completion recorded by a human.** The due board works off the
gap between the last time a service was done and where the truck is now. The sync
supplies the second half. Until somebody records "we did this service, on this date, at
this mileage", every program reports `nobaseline` rather than guessing — which is the
right answer, but it means the PM board does not light up on its own.

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
