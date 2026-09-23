-- ============================================================
-- Allen Company · Haul Division — Tire Wear
-- Postgres / Supabase schema
-- Run order: this file, then schema-shop.sql, then seed-fleet.sql
-- and seed-shop.sql. This one has to go first — schema-shop.sql
-- references tw_vehicles.
--
-- Applied to the shared Allen project (allen-qc). Tables are
-- namespaced tw_ so they sit alongside the other apps already in
-- that database, which follow the same convention: hct_ for the
-- Haul Cycle Tracker, bid_ for the bid history, po_ for purchasing.
-- ============================================================

create extension if not exists "pgcrypto";

-- ── Reference values ────────────────────────────────────────
-- axle_config drives which wheel positions exist on a truck.
-- Position codes follow the Motive TPMS convention already in
-- use in the yard: <axle><side>[<slot>]
--   1R  1L        single axle, right / left
--   3RO 3RI       dual axle, right outer / right inner
--   3LI 3LO       dual axle, left inner  / left outer
--
--   dump12     axle1 single (steer), axle2 single (pusher),
--              axles 3-4 dual (drive)            = 12 tires
--   dualpush14 the same truck with a DUAL pusher on
--              axle 2 — 2RO/2RI/2LI/2LO          = 14 tires
--   quad14     steer + 2 pushers + tandem drive  = 14 tires
--   tandem10   steer + tandem drive              = 10 tires
--   single6    steer + single drive axle         =  6 tires
--   light4     front + rear, all singles         =  4 tires
--   trailer8   two axles, duals on both, no steer =  8 tires
--
-- Adding one here means adding it to CONFIGS in src/TireWear.jsx as
-- well; the diagram, the dropdown and the reports all read that.
-- OT is equipment entered by hand rather than synced from Motive — a
-- rental, a customer's truck in for a service. Added after the first
-- deploy, so it alters the live table as well as the create above.
alter table tw_vehicles drop constraint if exists tw_vehicles_division_check;
alter table tw_vehicles add constraint tw_vehicles_division_check
  check (division in ('DT','HT','OT'));

alter table tw_vehicles drop constraint if exists tw_vehicles_axle_config_check;
alter table tw_vehicles add constraint tw_vehicles_axle_config_check
  check (axle_config in ('dump12','dualpush14','quad14','tandem10',
                         'single6','light4','trailer8'));

create table if not exists tw_vehicles (
  id                uuid primary key default gen_random_uuid(),
  number            text not null unique,           -- 'DT-882'
  make              text,
  model             text,
  model_year        text,
  division          text not null check (division in ('DT','HT','OT')),
  axle_config       text not null default 'dump12'
                      check (axle_config in ('dump12','dualpush14','quad14',
                                             'tandem10','single6','light4',
                                             'trailer8')),
  motive_vehicle_id bigint unique,                  -- for odometer sync
  active            boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists tw_vehicles_division_idx on tw_vehicles (division) where active;


create table if not exists tw_tire_brands (
  name       text primary key,
  sort_order integer not null default 100,
  active     boolean not null default true
);

-- The brands the Haul Division runs. Edit rows here to change the
-- dropdown — no code change or migration needed. "Other" stays last
-- and opens a free-text box in the app; whatever gets typed there is
-- stored on tw_tires.brand as-is.
insert into tw_tire_brands (name, sort_order) values
  ('Bridgestone', 10),
  ('Continental', 20),
  ('Firestone',   30),
  ('Goodyear',    40),
  ('Maxam',       50),
  ('Michelin',    60)
on conflict (name) do nothing;


create table if not exists tw_tires (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references tw_vehicles(id) on delete cascade,
  position         text not null,                   -- '3RO'
  brand            text,
  model            text,
  size             text,
  tire_type        text not null default 'virgin'
                     check (tire_type in ('virgin','retread')),
  wheel_material   text check (wheel_material in ('aluminum','steel')),
  casing_id        text,                            -- serial, follows a casing through retreads
  mounted_date     date not null,
  mounted_odometer integer not null check (mounted_odometer >= 0),
  mounted_depth    numeric(4,1) not null check (mounted_depth > 0),   -- 32nds
  cost             numeric(10,2),
  removed_date     date,
  removed_odometer integer,
  removed_reason   text,
  notes            text,                            -- free text on this wheel, e.g. 'sidewall plug'
  created_by       text,
  created_at       timestamptz not null default now(),

  constraint tw_removal_is_complete check (
    (removed_date is null and removed_odometer is null)
    or (removed_date is not null and removed_odometer is not null)
  ),
  constraint tw_removed_after_mounted check (
    removed_odometer is null or removed_odometer >= mounted_odometer
  )
);

-- Added after the first deploy, so it has to be applied to the tables
-- already out there as well as created above. Null means nobody recorded
-- it, which is every tire mounted before this column existed.
alter table tw_tires add column if not exists wheel_material text;
do $$ begin
  alter table tw_tires add constraint tw_wheel_material_known
    check (wheel_material in ('aluminum','steel'));
exception when duplicate_object then null;
end $$;

comment on column tw_tires.wheel_material is
  'The wheel the tire is mounted on: aluminum or steel. Null on tires mounted before the field existed.';

-- Only one tire may occupy a position at a time.
create unique index if not exists tw_one_active_tire_per_position
  on tw_tires (vehicle_id, position) where removed_date is null;

/* Moving a tire to another wheel on the same truck.
   ─────────────────────────────────────────────────────────────────
   Three cases, and they are not interchangeable.

   The wheel is bare       → the tire just moves.
   The wheel is taken, and
     the tire there is
     being scrapped        → pull it, then move. This is the common
                             one: a tire is moved onto a wheel whose
                             tire is worn out, and swapping it back
                             would put the worn-out tire on the truck.
     the two trade places  → a rotation.

   The swap is the awkward one. The index above is a partial unique
   INDEX — checked row by row, not at commit, and not deferrable
   because it carries a WHERE clause — so two tires cannot simply
   swap in two updates: whichever lands first collides with the one
   still sitting there. Hence the park, at a value carrying the row's
   own id so two rotations at once cannot collide on it, inside one
   transaction that rolls back rather than leaving a tire parked.

   A replace needs none of that. Setting removed_date drops the tire
   out of the partial index, so the move behind it is unobstructed —
   which is why the date is required rather than left to the caller's
   good intentions.

   Either way the wheel the tire came FROM is left empty, and the tire
   being moved keeps its id, its mount figures and every reading. It
   is the same casing on a different wheel, so the wear rate carries
   on. Nothing here touches tw_tread_readings.

   security invoker on purpose: anon already has full rights on
   tw_tires, so this grants nothing the caller did not have. It exists
   for the transaction, not for the privilege. search_path is pinned
   or the function resolves tw_tires against whatever the caller has
   set. */
create or replace function tw_move_tire(
  p_tire         uuid,
  p_to           text,
  p_pull_other   boolean default false,
  p_off_date     date    default null,
  p_off_odometer integer default null,
  p_off_reason   text    default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_veh   uuid;
  v_from  text;
  v_other uuid;
  v_park  text;
begin
  select vehicle_id, position into v_veh, v_from
    from tw_tires where id = p_tire and removed_date is null;

  if v_veh is null then
    raise exception 'That tire is not on a truck.' using errcode = 'P0002';
  end if;
  if p_to is null or btrim(p_to) = '' then
    raise exception 'Say which wheel to move it to.' using errcode = '22023';
  end if;
  if p_to = v_from then
    raise exception 'That tire is already on %.', v_from using errcode = '22023';
  end if;

  select id into v_other
    from tw_tires
   where vehicle_id = v_veh and position = p_to and removed_date is null;

  if v_other is null then
    update tw_tires set position = p_to where id = p_tire;

  elsif p_pull_other then
    if p_off_date is null then
      raise exception 'Say what date the tire coming off came off.' using errcode = '22023';
    end if;
    update tw_tires
       set removed_date     = p_off_date,
           removed_odometer = p_off_odometer,
           removed_reason   = coalesce(nullif(btrim(p_off_reason), ''), 'Replaced')
     where id = v_other;
    update tw_tires set position = p_to where id = p_tire;

  else
    v_park := '~moving:' || v_other::text;
    update tw_tires set position = v_park  where id = v_other;
    update tw_tires set position = p_to    where id = p_tire;
    update tw_tires set position = v_from  where id = v_other;
  end if;

  return jsonb_build_object(
    'vehicle_id',   v_veh,
    'from',         v_from,
    'to',           p_to,
    'swapped_with', case when v_other is not null and not p_pull_other then v_other end,
    'pulled',       case when v_other is not null and p_pull_other then v_other end);
end;
$$;

grant execute on function
  tw_move_tire(uuid, text, boolean, date, integer, text) to anon, authenticated;

comment on column tw_tires.notes is
  'Free-text note on the mounted tire, shown on the wheel position. Overwritten in place, so it carries no history — a dated observation belongs on tw_tread_readings instead.';

create index if not exists tw_tires_vehicle_idx on tw_tires (vehicle_id);
create index if not exists tw_tires_casing_idx  on tw_tires (casing_id) where casing_id is not null;


create table if not exists tw_tread_readings (
  id           uuid primary key default gen_random_uuid(),
  tire_id      uuid not null references tw_tires(id) on delete cascade,
  reading_date date not null,
  odometer     integer not null check (odometer >= 0),
  depth_32nds  numeric(4,1) not null check (depth_32nds >= 0),
  recorded_by  text,
  created_at   timestamptz not null default now(),
  unique (tire_id, odometer)
);

create index if not exists tw_readings_tire_idx on tw_tread_readings (tire_id, odometer);


create table if not exists tw_odometer_log (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references tw_vehicles(id) on delete cascade,
  reading_date date not null,
  odometer     integer not null check (odometer >= 0),
  source       text not null default 'manual' check (source in ('manual','motive','inspection')),
  recorded_by  text,
  created_at   timestamptz not null default now(),
  unique (vehicle_id, reading_date, odometer)
);

create index if not exists tw_odo_vehicle_idx on tw_odometer_log (vehicle_id, odometer desc);


create table if not exists tw_settings (
  id                 boolean primary key default true check (id),  -- single row
  pull_steer_32nds   numeric(4,1) not null default 6,
  pull_other_32nds   numeric(4,1) not null default 4,
  default_new_depth  numeric(4,1) not null default 28,
  -- How far apart two tires on the same end of an axle may be before
  -- the pair is flagged. Duals only share a load if they are close to
  -- the same size; four 32nds is what the industry uses. Zero means
  -- "flag any difference at all".
  dual_match_32nds   numeric(4,1) not null default 4 check (dual_match_32nds >= 0),
  updated_at         timestamptz not null default now()
);

insert into tw_settings (id) values (true) on conflict do nothing;

-- Who hears about a tire that has reached its pull depth. Deliberately
-- not derived from the roster: the people who want to know are not
-- always the people who book hours, and one of them may not be on the
-- roster at all. Empty means the alerts are off.
alter table tw_settings
  add column if not exists alert_emails text[] not null default '{}';


-- One row per tire that has been reported. Without it the Monday digest
-- names the same worn tire every week until somebody changes it, and the
-- walk-around alert fires again on every reading. A later reading above
-- the pull depth removes the row, so a tire that wears out a second time
-- does alert again.
create table if not exists tw_tire_alerts (
  tire_id     uuid primary key references tw_tires(id) on delete cascade,
  depth_32nds numeric(4,1) not null,
  pull_32nds  numeric(4,1) not null,
  sent_to     text[] not null default '{}',
  sent_at     timestamptz not null default now()
);

create index if not exists tw_tire_alerts_sent_idx on tw_tire_alerts (sent_at desc);

-- Federal minimums are 4/32 steer and 2/32 all other positions
-- (49 CFR 393.75). Defaults above pull earlier than that on purpose.


-- ── Wear rate ───────────────────────────────────────────────
-- The mount record is the first data point: mounted_odometer /
-- mounted_depth. Every tread reading after it is another point.
-- Rate = miles run divided by 32nds given up, first point to last.
-- A tire needs at least one reading beyond the mount to get a rate.

create or replace view tw_tire_wear as
with points as (
  select id as tire_id, mounted_odometer as odometer, mounted_depth as depth
    from tw_tires
  union all
  select tire_id, odometer, depth_32nds from tw_tread_readings
),
bounds as (
  select
    tire_id,
    first_value(odometer) over w_asc  as first_odometer,
    first_value(depth)    over w_asc  as first_depth,
    first_value(odometer) over w_desc as last_odometer,
    first_value(depth)    over w_desc as last_depth,
    count(*)              over (partition by tire_id) as point_count
  from points
  window
    w_asc  as (partition by tire_id order by odometer asc),
    w_desc as (partition by tire_id order by odometer desc)
)
select distinct
  b.tire_id,
  b.point_count,
  b.first_odometer,
  b.first_depth,
  b.last_odometer,
  b.last_depth,
  (b.last_odometer - b.first_odometer)          as miles_run,
  (b.first_depth   - b.last_depth)              as worn_32nds,
  case
    when b.last_odometer > b.first_odometer
     and b.first_depth   > b.last_depth
    then round((b.last_odometer - b.first_odometer)
             / (b.first_depth   - b.last_depth), 0)
  end as miles_per_32nd,
  case
    when b.last_odometer > b.first_odometer
     and b.first_depth   > b.last_depth
    then round((b.last_odometer - b.first_odometer)
             / (b.first_depth   - b.last_depth) / 31.25, 1)
  end as miles_per_mil          -- 1/32 inch = 31.25 mils
from bounds b;


-- Every mounted tire at or below the depth it should be pulled at, with
-- what a person needs to act on it. The alert sender reads this rather
-- than rebuilding the threshold rule, so the rule stays in one place.
create or replace view tw_tires_due_out as
select
  a.tire_id, a.truck, a.vehicle_id, a.position, a.division,
  a.brand, a.model, a.size, a.tire_type,
  a.current_depth, a.pull_depth,
  a.miles_run, a.miles_per_32nd,
  al.sent_at as alerted_at
from tw_active_tires a
left join tw_tire_alerts al on al.tire_id = a.tire_id
where a.current_depth is not null
  and a.current_depth <= a.pull_depth;


-- Everything a screen needs about a currently mounted tire.
create or replace view tw_active_tires as
select
  t.id            as tire_id,
  v.id            as vehicle_id,
  v.number        as truck,
  v.division,
  v.axle_config,
  t.position,
  t.brand, t.model, t.size, t.tire_type, t.casing_id,
  t.mounted_date, t.mounted_odometer, t.mounted_depth, t.cost,
  w.last_depth    as current_depth,
  w.miles_run,
  w.miles_per_32nd,
  w.miles_per_mil,
  case when t.position ~ '^1[LR]$'
       then s.pull_steer_32nds else s.pull_other_32nds end as pull_depth,
  case
    when w.miles_per_32nd is null then null
    else greatest(0, round((w.last_depth -
           case when t.position ~ '^1[LR]$'
                then s.pull_steer_32nds else s.pull_other_32nds end)
         * w.miles_per_32nd, 0))
  end as est_miles_remaining,
  case when t.cost is not null and w.miles_run > 0
       then round(t.cost / w.miles_run, 4) end as cost_per_mile,
  t.notes
from tw_tires t
join tw_vehicles v on v.id = t.vehicle_id
join tw_settings s on s.id = true
left join tw_tire_wear w on w.tire_id = t.id
where t.removed_date is null;

-- Views run with the caller's rights, not the owner's. Without this a
-- view is a hole straight through the row level security below: anon
-- could read every tire by selecting the view instead of the table.
alter view tw_tire_wear     set (security_invoker = true);
alter view tw_active_tires  set (security_invoker = true);
alter view tw_tires_due_out set (security_invoker = true);


-- ── Row level security ──────────────────────────────────────
-- The app has no login: it asks for an Allen email, checks the
-- domain in the browser, and lets you through. Requests therefore
-- arrive as `anon`, the same posture as hct_jobs (the Haul Cycle
-- Tracker has no login either). See HANDOFF.md for what that costs.
--
-- These policies are PER TABLE, so they open the tw_ tables only —
-- the QC, bid and purchasing tables sharing this project still deny
-- anon. scripts/check-anon-access.mjs asserts exactly that.
--
-- The `authenticated` policies are kept so that putting a real login
-- back is only a matter of dropping the anon ones.

alter table tw_vehicles       enable row level security;
alter table tw_tire_brands    enable row level security;
alter table tw_tires          enable row level security;
alter table tw_tread_readings enable row level security;
alter table tw_odometer_log   enable row level security;
alter table tw_settings       enable row level security;
alter table tw_tire_alerts    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tw_vehicles','tw_tire_brands','tw_tires',
                           'tw_tread_readings','tw_odometer_log','tw_settings',
                           'tw_tire_alerts']
  loop
    execute format('drop policy if exists %I on %I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t);

    execute format('drop policy if exists %I on %I', t || '_anon_all', t);
    execute format(
      'create policy %I on %I for all to anon using (true) with check (true)',
      t || '_anon_all', t);
  end loop;
end $$;
