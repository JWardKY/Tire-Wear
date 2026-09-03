-- ============================================================
-- Allen Company · Haul Division — Tire Wear
-- Postgres / Supabase schema
-- Run this before seed-fleet.sql
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
--   dump12   axle1 single (steer), axle2 single (pusher),
--            axles 3-4 dual (drive)              = 12 tires
--   quad14   steer + 2 pushers + tandem drive    = 14 tires
--   tandem10 steer + tandem drive                = 10 tires
--   single6  steer + single drive axle           =  6 tires
--   light4   front + rear, all singles           =  4 tires

create table if not exists tw_vehicles (
  id                uuid primary key default gen_random_uuid(),
  number            text not null unique,           -- 'DT-882'
  make              text,
  model             text,
  model_year        text,
  division          text not null check (division in ('DT','HT')),
  axle_config       text not null default 'dump12'
                      check (axle_config in ('dump12','quad14','tandem10','single6','light4')),
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
  updated_at         timestamptz not null default now()
);

insert into tw_settings (id) values (true) on conflict do nothing;

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
alter view tw_tire_wear    set (security_invoker = true);
alter view tw_active_tires set (security_invoker = true);


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

do $$
declare t text;
begin
  foreach t in array array['tw_vehicles','tw_tire_brands','tw_tires',
                           'tw_tread_readings','tw_odometer_log','tw_settings']
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
