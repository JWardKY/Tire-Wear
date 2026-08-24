-- ============================================================
-- Allen Company · Haul Division — Tire Wear
-- Postgres / Supabase schema
-- Run this before seed-fleet.sql
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

create table if not exists vehicles (
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

create index if not exists vehicles_division_idx on vehicles (division) where active;


create table if not exists tire_brands (
  name       text primary key,
  sort_order integer not null default 100,
  active     boolean not null default true
);

-- The brands the Haul Division runs. Edit rows here to change the
-- dropdown — no code change or migration needed. "Other" stays last
-- and opens a free-text box in the app; whatever gets typed there is
-- stored on tires.brand as-is.
insert into tire_brands (name, sort_order) values
  ('Bridgestone', 10),
  ('Continental', 20),
  ('Firestone',   30),
  ('Goodyear',    40),
  ('Maxam',       50),
  ('Michelin',    60)
on conflict (name) do nothing;


create table if not exists tires (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references vehicles(id) on delete cascade,
  position         text not null,                   -- '3RO'
  brand            text,
  model            text,
  size             text,
  tire_type        text not null default 'virgin'
                     check (tire_type in ('virgin','retread')),
  casing_id        text,                            -- serial, follows a casing through retreads
  mounted_date     date not null,
  mounted_odometer integer not null check (mounted_odometer >= 0),
  mounted_depth    numeric(4,1) not null check (mounted_depth > 0),   -- 32nds
  cost             numeric(10,2),
  removed_date     date,
  removed_odometer integer,
  removed_reason   text,
  created_by       text,
  created_at       timestamptz not null default now(),

  constraint removal_is_complete check (
    (removed_date is null and removed_odometer is null)
    or (removed_date is not null and removed_odometer is not null)
  ),
  constraint removed_after_mounted check (
    removed_odometer is null or removed_odometer >= mounted_odometer
  )
);

-- Only one tire may occupy a position at a time.
create unique index if not exists one_active_tire_per_position
  on tires (vehicle_id, position) where removed_date is null;

create index if not exists tires_vehicle_idx on tires (vehicle_id);
create index if not exists tires_casing_idx  on tires (casing_id) where casing_id is not null;


create table if not exists tread_readings (
  id           uuid primary key default gen_random_uuid(),
  tire_id      uuid not null references tires(id) on delete cascade,
  reading_date date not null,
  odometer     integer not null check (odometer >= 0),
  depth_32nds  numeric(4,1) not null check (depth_32nds >= 0),
  recorded_by  text,
  created_at   timestamptz not null default now(),
  unique (tire_id, odometer)
);

create index if not exists readings_tire_idx on tread_readings (tire_id, odometer);


create table if not exists odometer_log (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references vehicles(id) on delete cascade,
  reading_date date not null,
  odometer     integer not null check (odometer >= 0),
  source       text not null default 'manual' check (source in ('manual','motive','inspection')),
  recorded_by  text,
  created_at   timestamptz not null default now(),
  unique (vehicle_id, reading_date, odometer)
);

create index if not exists odo_vehicle_idx on odometer_log (vehicle_id, odometer desc);


create table if not exists settings (
  id                 boolean primary key default true check (id),  -- single row
  pull_steer_32nds   numeric(4,1) not null default 6,
  pull_other_32nds   numeric(4,1) not null default 4,
  default_new_depth  numeric(4,1) not null default 28,
  updated_at         timestamptz not null default now()
);

insert into settings (id) values (true) on conflict do nothing;

-- Federal minimums are 4/32 steer and 2/32 all other positions
-- (49 CFR 393.75). Defaults above pull earlier than that on purpose.


-- ── Wear rate ───────────────────────────────────────────────
-- The mount record is the first data point: mounted_odometer /
-- mounted_depth. Every tread reading after it is another point.
-- Rate = miles run divided by 32nds given up, first point to last.
-- A tire needs at least one reading beyond the mount to get a rate.

create or replace view tire_wear as
with points as (
  select id as tire_id, mounted_odometer as odometer, mounted_depth as depth
    from tires
  union all
  select tire_id, odometer, depth_32nds from tread_readings
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
create or replace view active_tires as
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
       then round(t.cost / w.miles_run, 4) end as cost_per_mile
from tires t
join vehicles v on v.id = t.vehicle_id
join settings s on s.id = true
left join tire_wear w on w.tire_id = t.id
where t.removed_date is null;


-- ── Row level security ──────────────────────────────────────
-- Small internal team: any signed-in Allen user can read and
-- write. Tighten to role-based if this opens up beyond the
-- shop and the Haul Division office.

alter table vehicles       enable row level security;
alter table tire_brands    enable row level security;
alter table tires          enable row level security;
alter table tread_readings enable row level security;
alter table odometer_log   enable row level security;
alter table settings       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['vehicles','tire_brands','tires','tread_readings','odometer_log','settings']
  loop
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t);
  end loop;
end $$;
