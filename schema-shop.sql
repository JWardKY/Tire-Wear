-- ============================================================
-- Allen Company · Haul Division — Shop system
-- Postgres / Supabase schema
--
-- Everything the app uses that is NOT tire wear: defects, PM,
-- timecards and the clock, parts and inventory, purchasing, work
-- orders, and the mechanic roster. Run schema.sql first (it creates
-- tw_vehicles, which most of this references), then this, then
-- seed-fleet.sql and seed-shop.sql.
--
-- Provenance: these objects were built directly in the database
-- during the first weeks of the shop rollout and were never written
-- down. This file was reconstructed from the live database on
-- 09/03/2026 while moving the app onto its own Supabase project, and
-- is now the source of truth. Change it here first.
--
-- Two columns are GENERATED and must stay that way. Neither is ever
-- written by the app, and as plain columns both fail silently:
--   tw_mechanics.pin_set  — the app reads it to tell "has a PIN" from
--                           "needs to set one"; plain, it stays null
--                           and sign-in stalls.
--   tw_parts.available    — plain, it is written once and then drifts
--                           away from on_hand on every part issued.
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

create table if not exists tw_cost_codes (
  code text not null,
  name text not null,
  code_group text not null,
  active boolean default true not null,
  sort_order integer default 100 not null
);

create table if not exists tw_defects (
  id uuid default gen_random_uuid() not null,
  defect_key text not null,
  vehicle_id uuid,
  unit_number text not null,
  category text,
  note text,
  driver text,
  location text,
  severity text default 'minor'::text not null,
  safety text default 'safe'::text not null,
  first_reported date default CURRENT_DATE not null,
  last_reported date default CURRENT_DATE not null,
  report_count integer default 1 not null,
  source text default 'manual'::text not null,
  state text default 'open'::text not null,
  claimed_by text,
  claimed_at timestamptz,
  priority text,
  work_order text,
  repaired_by text,
  repaired_at timestamptz,
  repair_note text,
  repair_hours numeric(5,2),
  created_by text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  closed_at timestamptz
);

create table if not exists tw_mechanics (
  id uuid default gen_random_uuid() not null,
  email text,
  name text not null,
  pin_hash text,
  pin_set boolean generated always as (pin_hash is not null) stored,
  failed_attempts integer default 0 not null,
  locked_until timestamptz,
  active boolean default true not null,
  created_at timestamptz default now() not null,
  role text default 'mechanic'::text not null,
  emp_no text,
  address text,
  phone text,
  emergency_name text,
  emergency_phone text
);

create table if not exists tw_part_requests (
  id uuid default gen_random_uuid() not null,
  part_id uuid,
  part_number text,
  description text not null,
  qty numeric(12,2) default 1 not null,
  shop text,
  unit_label text,
  vehicle_id uuid,
  requested_by text,
  state text default 'open'::text not null,
  note text,
  po_id uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists tw_part_txns (
  id uuid default gen_random_uuid() not null,
  part_id uuid not null,
  kind text not null,
  qty_delta numeric(12,2) not null,
  vehicle_id uuid,
  work_order text,
  note text,
  who text,
  created_at timestamptz default now() not null,
  time_entry_id uuid
);

create table if not exists tw_parts (
  id uuid default gen_random_uuid() not null,
  part_number text not null,
  name text,
  shop text not null,
  category text,
  uom text default 'each'::text not null,
  on_hand numeric(12,2) default 0 not null,
  allocated numeric(12,2) default 0 not null,
  on_order numeric(12,2) default 0 not null,
  available numeric(12,2) generated always as (on_hand - allocated) stored,
  min_qty numeric(12,2),
  max_qty numeric(12,2),
  bin text,
  unit_cost numeric(12,4),
  tags text,
  tracked boolean default true not null,
  active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  vendor_id uuid
);

create table if not exists tw_pm_completions (
  id uuid default gen_random_uuid() not null,
  vehicle_id uuid not null,
  program_id uuid not null,
  done_date date not null,
  done_odometer integer,
  done_by text,
  hours numeric(5,2),
  note text,
  created_at timestamptz default now() not null
);

create table if not exists tw_pm_programs (
  id uuid default gen_random_uuid() not null,
  name text not null,
  category text,
  interval_miles integer,
  interval_months integer,
  lead_miles integer,
  lead_days integer,
  est_hours numeric(4,1),
  applies_to text,
  active boolean default true not null,
  sort_order integer default 100 not null,
  created_at timestamptz default now() not null
);

create table if not exists tw_po_lines (
  id uuid default gen_random_uuid() not null,
  po_id uuid not null,
  part_id uuid,
  part_number text not null,
  name text,
  shop text,
  qty numeric(12,2) not null,
  qty_received numeric(12,2) default 0 not null,
  unit_cost numeric(12,2)
);

create table if not exists tw_purchase_orders (
  id uuid default gen_random_uuid() not null,
  po_number text not null,
  vendor_id uuid,
  vendor_name text default '(no vendor)'::text not null,
  vendor_email text,
  sent_how text,
  state text default 'ordered'::text not null,
  total numeric(12,2) default 0 not null,
  note text,
  ordered_by text,
  ordered_at timestamptz default now() not null
);

create table if not exists tw_shifts (
  id uuid default gen_random_uuid() not null,
  mechanic_id uuid not null,
  started_at timestamptz default now() not null,
  ended_at timestamptz,
  note text,
  created_at timestamptz default now() not null,
  lunch_minutes integer default 30 not null
);

create table if not exists tw_time_entries (
  id uuid default gen_random_uuid() not null,
  mechanic_id uuid not null,
  work_date date not null,
  vehicle_id uuid,
  unit_label text,
  where_worked text default 'shop'::text not null,
  hours numeric(5,2) not null,
  cost_code text not null,
  work_order text,
  note text,
  defect_id uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  work_types text[] default '{}'::text[] not null,
  unit_seconds integer default 0 not null,
  stints jsonb default '[]'::jsonb not null,
  work_performed text,
  job_location text,
  pm_program_id uuid
);

create table if not exists tw_time_entry_parts (
  id uuid default gen_random_uuid() not null,
  time_entry_id uuid not null,
  part_id uuid,
  part_number text not null,
  description text,
  qty numeric(10,2) not null,
  created_at timestamptz default now() not null
);

create table if not exists tw_vendor_categories (
  category text not null,
  vendor_id uuid not null,
  updated_at timestamptz default now() not null
);

create table if not exists tw_vendors (
  id uuid default gen_random_uuid() not null,
  name text not null,
  email text,
  cc text,
  phone text,
  account text,
  note text,
  active boolean default true not null,
  created_at timestamptz default now() not null
);

create table if not exists tw_work_log (
  id bigint generated by default as identity not null,
  occurred_at timestamptz default now() not null,
  event_type text not null,
  mechanic_id uuid,
  actor_name text not null,
  vehicle_id uuid,
  unit_number text,
  summary text not null,
  detail jsonb default '{}'::jsonb not null
);

create table if not exists tw_work_orders (
  id uuid default gen_random_uuid() not null,
  wo_number text not null,
  kind text not null,
  source_key text not null,
  vehicle_id uuid,
  unit_number text,
  title text not null,
  detail text,
  priority text default 'normal'::text not null,
  state text default 'open'::text not null,
  assigned_to uuid,
  assigned_name text,
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by text,
  completion_note text,
  -- Stopped without being finished, and why. The mechanic's hours are
  -- already saved and they can clock out; this is the order saying it is
  -- still open on purpose rather than because nobody has touched it.
  hold_reason text,
  hold_since timestamptz,
  created_by text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);


-- ── Constraints ─────────────────────────────────────────────
-- Each is guarded by an existence check rather than an exception
-- handler: a duplicate PRIMARY KEY raises invalid_table_definition,
-- not duplicate_object, so catching the obvious sqlstate is not enough.

do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_cost_codes_code_group_check' and conrelid = 'tw_cost_codes'::regclass) then
    alter table tw_cost_codes add constraint tw_cost_codes_code_group_check CHECK ((code_group = ANY (ARRAY['Vehicle'::text, 'Plant'::text, 'Shop'::text, 'Other'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_cost_codes_pkey' and conrelid = 'tw_cost_codes'::regclass) then
    alter table tw_cost_codes add constraint tw_cost_codes_pkey PRIMARY KEY (code);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defect_claim_is_complete' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defect_claim_is_complete CHECK (((state <> 'claimed'::text) OR (claimed_by IS NOT NULL)));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defect_dates_sane' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defect_dates_sane CHECK ((last_reported >= first_reported));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defect_repair_is_complete' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defect_repair_is_complete CHECK (((state <> 'repaired'::text) OR ((repaired_at IS NOT NULL) AND (repaired_by IS NOT NULL))));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defects_closed_has_a_time' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defects_closed_has_a_time CHECK (((state = 'closed'::text) = (closed_at IS NOT NULL)));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defects_defect_key_key' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defects_defect_key_key UNIQUE (defect_key);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defects_pkey' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defects_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defects_priority_check' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defects_priority_check CHECK ((priority = ANY (ARRAY['normal'::text, 'high'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defects_repair_hours_check' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defects_repair_hours_check CHECK ((repair_hours >= (0)::numeric));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defects_report_count_check' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defects_report_count_check CHECK ((report_count > 0));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defects_safety_check' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defects_safety_check CHECK ((safety = ANY (ARRAY['safe'::text, 'unsafe'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defects_severity_check' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defects_severity_check CHECK ((severity = ANY (ARRAY['minor'::text, 'major'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defects_source_check' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defects_source_check CHECK ((source = ANY (ARRAY['motive'::text, 'manual'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defects_state_check' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defects_state_check CHECK ((state = ANY (ARRAY['open'::text, 'claimed'::text, 'repaired'::text, 'closed'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_mechanic_email_is_real' and conrelid = 'tw_mechanics'::regclass) then
    alter table tw_mechanics add constraint tw_mechanic_email_is_real CHECK (((email IS NULL) OR ((length(btrim(email)) > 0) AND (email ~~ '%@%'::text))));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_mechanics_email_key' and conrelid = 'tw_mechanics'::regclass) then
    alter table tw_mechanics add constraint tw_mechanics_email_key UNIQUE (email);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_mechanics_pkey' and conrelid = 'tw_mechanics'::regclass) then
    alter table tw_mechanics add constraint tw_mechanics_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_mechanics_role_check' and conrelid = 'tw_mechanics'::regclass) then
    alter table tw_mechanics add constraint tw_mechanics_role_check CHECK ((role = ANY (ARRAY['mechanic'::text, 'dashboard'::text, 'admin'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_requests_pkey' and conrelid = 'tw_part_requests'::regclass) then
    alter table tw_part_requests add constraint tw_part_requests_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_requests_qty_check' and conrelid = 'tw_part_requests'::regclass) then
    alter table tw_part_requests add constraint tw_part_requests_qty_check CHECK ((qty > (0)::numeric));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_requests_state_check' and conrelid = 'tw_part_requests'::regclass) then
    alter table tw_part_requests add constraint tw_part_requests_state_check CHECK ((state = ANY (ARRAY['open'::text, 'ordered'::text, 'issued'::text, 'declined'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_txns_kind_check' and conrelid = 'tw_part_txns'::regclass) then
    alter table tw_part_txns add constraint tw_part_txns_kind_check CHECK ((kind = ANY (ARRAY['issue'::text, 'receive'::text, 'adjust'::text, 'import'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_txns_pkey' and conrelid = 'tw_part_txns'::regclass) then
    alter table tw_part_txns add constraint tw_part_txns_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_txns_qty_delta_check' and conrelid = 'tw_part_txns'::regclass) then
    alter table tw_part_txns add constraint tw_part_txns_qty_delta_check CHECK ((qty_delta <> (0)::numeric));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_txn_direction' and conrelid = 'tw_part_txns'::regclass) then
    alter table tw_part_txns add constraint tw_txn_direction CHECK ((((kind = 'issue'::text) AND (qty_delta < (0)::numeric)) OR ((kind = 'receive'::text) AND (qty_delta > (0)::numeric)) OR (kind = ANY (ARRAY['adjust'::text, 'import'::text]))));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_parts_allocated_check' and conrelid = 'tw_parts'::regclass) then
    alter table tw_parts add constraint tw_parts_allocated_check CHECK ((allocated >= (0)::numeric));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_parts_on_order_check' and conrelid = 'tw_parts'::regclass) then
    alter table tw_parts add constraint tw_parts_on_order_check CHECK ((on_order >= (0)::numeric));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_parts_part_number_shop_key' and conrelid = 'tw_parts'::regclass) then
    alter table tw_parts add constraint tw_parts_part_number_shop_key UNIQUE (part_number, shop);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_parts_pkey' and conrelid = 'tw_parts'::regclass) then
    alter table tw_parts add constraint tw_parts_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_parts_unit_cost_check' and conrelid = 'tw_parts'::regclass) then
    alter table tw_parts add constraint tw_parts_unit_cost_check CHECK ((unit_cost >= (0)::numeric));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_completions_done_odometer_check' and conrelid = 'tw_pm_completions'::regclass) then
    alter table tw_pm_completions add constraint tw_pm_completions_done_odometer_check CHECK ((done_odometer >= 0));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_completions_hours_check' and conrelid = 'tw_pm_completions'::regclass) then
    alter table tw_pm_completions add constraint tw_pm_completions_hours_check CHECK ((hours >= (0)::numeric));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_completions_pkey' and conrelid = 'tw_pm_completions'::regclass) then
    alter table tw_pm_completions add constraint tw_pm_completions_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_completions_vehicle_id_program_id_done_date_done_odom_key' and conrelid = 'tw_pm_completions'::regclass) then
    alter table tw_pm_completions add constraint tw_pm_completions_vehicle_id_program_id_done_date_done_odom_key UNIQUE (vehicle_id, program_id, done_date, done_odometer);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_needs_an_interval' and conrelid = 'tw_pm_programs'::regclass) then
    alter table tw_pm_programs add constraint tw_pm_needs_an_interval CHECK (((interval_miles IS NOT NULL) OR (interval_months IS NOT NULL)));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_programs_applies_to_check' and conrelid = 'tw_pm_programs'::regclass) then
    alter table tw_pm_programs add constraint tw_pm_programs_applies_to_check CHECK ((applies_to = ANY (ARRAY['DT'::text, 'HT'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_programs_est_hours_check' and conrelid = 'tw_pm_programs'::regclass) then
    alter table tw_pm_programs add constraint tw_pm_programs_est_hours_check CHECK ((est_hours >= (0)::numeric));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_programs_interval_miles_check' and conrelid = 'tw_pm_programs'::regclass) then
    alter table tw_pm_programs add constraint tw_pm_programs_interval_miles_check CHECK ((interval_miles > 0));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_programs_interval_months_check' and conrelid = 'tw_pm_programs'::regclass) then
    alter table tw_pm_programs add constraint tw_pm_programs_interval_months_check CHECK ((interval_months > 0));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_programs_lead_days_check' and conrelid = 'tw_pm_programs'::regclass) then
    alter table tw_pm_programs add constraint tw_pm_programs_lead_days_check CHECK ((lead_days >= 0));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_programs_lead_miles_check' and conrelid = 'tw_pm_programs'::regclass) then
    alter table tw_pm_programs add constraint tw_pm_programs_lead_miles_check CHECK ((lead_miles >= 0));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_programs_name_key' and conrelid = 'tw_pm_programs'::regclass) then
    alter table tw_pm_programs add constraint tw_pm_programs_name_key UNIQUE (name);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_programs_pkey' and conrelid = 'tw_pm_programs'::regclass) then
    alter table tw_pm_programs add constraint tw_pm_programs_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_po_line_not_over_received' and conrelid = 'tw_po_lines'::regclass) then
    alter table tw_po_lines add constraint tw_po_line_not_over_received CHECK ((qty_received <= qty));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_po_lines_pkey' and conrelid = 'tw_po_lines'::regclass) then
    alter table tw_po_lines add constraint tw_po_lines_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_po_lines_qty_check' and conrelid = 'tw_po_lines'::regclass) then
    alter table tw_po_lines add constraint tw_po_lines_qty_check CHECK ((qty > (0)::numeric));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_po_lines_qty_received_check' and conrelid = 'tw_po_lines'::regclass) then
    alter table tw_po_lines add constraint tw_po_lines_qty_received_check CHECK ((qty_received >= (0)::numeric));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_purchase_orders_pkey' and conrelid = 'tw_purchase_orders'::regclass) then
    alter table tw_purchase_orders add constraint tw_purchase_orders_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_purchase_orders_po_number_key' and conrelid = 'tw_purchase_orders'::regclass) then
    alter table tw_purchase_orders add constraint tw_purchase_orders_po_number_key UNIQUE (po_number);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_purchase_orders_state_check' and conrelid = 'tw_purchase_orders'::regclass) then
    alter table tw_purchase_orders add constraint tw_purchase_orders_state_check CHECK ((state = ANY (ARRAY['ordered'::text, 'part-received'::text, 'received'::text, 'cancelled'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_shift_ends_after_it_starts' and conrelid = 'tw_shifts'::regclass) then
    alter table tw_shifts add constraint tw_shift_ends_after_it_starts CHECK (((ended_at IS NULL) OR (ended_at >= started_at)));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_shifts_lunch_minutes_check' and conrelid = 'tw_shifts'::regclass) then
    alter table tw_shifts add constraint tw_shifts_lunch_minutes_check CHECK (((lunch_minutes >= 0) AND (lunch_minutes <= 240)));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_shifts_pkey' and conrelid = 'tw_shifts'::regclass) then
    alter table tw_shifts add constraint tw_shifts_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entries_hours_check' and conrelid = 'tw_time_entries'::regclass) then
    alter table tw_time_entries add constraint tw_time_entries_hours_check CHECK (((hours > (0)::numeric) AND (hours <= (24)::numeric)));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entries_pkey' and conrelid = 'tw_time_entries'::regclass) then
    alter table tw_time_entries add constraint tw_time_entries_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entries_unit_seconds_ck' and conrelid = 'tw_time_entries'::regclass) then
    alter table tw_time_entries add constraint tw_time_entries_unit_seconds_ck CHECK ((unit_seconds >= 0));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entries_where_worked_check' and conrelid = 'tw_time_entries'::regclass) then
    alter table tw_time_entries add constraint tw_time_entries_where_worked_check CHECK ((where_worked = ANY (ARRAY['shop'::text, 'field'::text, 'road'::text, 'plant'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_needs_a_home' and conrelid = 'tw_time_entries'::regclass) then
    alter table tw_time_entries add constraint tw_time_needs_a_home CHECK (((vehicle_id IS NOT NULL) OR ((unit_label IS NOT NULL) AND (length(btrim(unit_label)) > 0))));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entry_parts_part_number_check' and conrelid = 'tw_time_entry_parts'::regclass) then
    alter table tw_time_entry_parts add constraint tw_time_entry_parts_part_number_check CHECK ((length(btrim(part_number)) > 0));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entry_parts_pkey' and conrelid = 'tw_time_entry_parts'::regclass) then
    alter table tw_time_entry_parts add constraint tw_time_entry_parts_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entry_parts_qty_check' and conrelid = 'tw_time_entry_parts'::regclass) then
    alter table tw_time_entry_parts add constraint tw_time_entry_parts_qty_check CHECK ((qty > (0)::numeric));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_vendor_categories_pkey' and conrelid = 'tw_vendor_categories'::regclass) then
    alter table tw_vendor_categories add constraint tw_vendor_categories_pkey PRIMARY KEY (category);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_vendors_pkey' and conrelid = 'tw_vendors'::regclass) then
    alter table tw_vendors add constraint tw_vendors_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_work_log_event_type_check' and conrelid = 'tw_work_log'::regclass) then
    alter table tw_work_log add constraint tw_work_log_event_type_check CHECK ((event_type = ANY (ARRAY['timecard_saved'::text, 'timecard_deleted'::text, 'defect_repaired'::text, 'defect_reopened'::text, 'defect_closed'::text, 'pm_completed'::text, 'tire_reading'::text, 'tire_mounted'::text, 'tire_pulled'::text, 'work_order_assigned'::text, 'work_order_completed'::text, 'part_issued'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_work_log_pkey' and conrelid = 'tw_work_log'::regclass) then
    alter table tw_work_log add constraint tw_work_log_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_wo_assigned_is_complete' and conrelid = 'tw_work_orders'::regclass) then
    alter table tw_work_orders add constraint tw_wo_assigned_is_complete CHECK (((state <> 'in progress'::text) OR (assigned_to IS NOT NULL)));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_wo_hold_is_complete' and conrelid = 'tw_work_orders'::regclass) then
    alter table tw_work_orders add constraint tw_wo_hold_is_complete
      CHECK (((hold_reason IS NULL) = (hold_since IS NULL)));
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_wo_done_is_not_held' and conrelid = 'tw_work_orders'::regclass) then
    -- A finished order is not waiting on anything. closeWorkOrder clears
    -- the hold in the same statement; this stops the two disagreeing.
    alter table tw_work_orders add constraint tw_wo_done_is_not_held
      CHECK ((state <> 'done'::text) OR (hold_reason IS NULL));
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_wo_done_is_complete' and conrelid = 'tw_work_orders'::regclass) then
    alter table tw_work_orders add constraint tw_wo_done_is_complete CHECK (((state <> 'done'::text) OR (completed_at IS NOT NULL)));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_work_orders_kind_check' and conrelid = 'tw_work_orders'::regclass) then
    alter table tw_work_orders add constraint tw_work_orders_kind_check CHECK ((kind = ANY (ARRAY['defect'::text, 'pm'::text, 'other'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_work_orders_pkey' and conrelid = 'tw_work_orders'::regclass) then
    alter table tw_work_orders add constraint tw_work_orders_pkey PRIMARY KEY (id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_work_orders_priority_check' and conrelid = 'tw_work_orders'::regclass) then
    alter table tw_work_orders add constraint tw_work_orders_priority_check CHECK ((priority = ANY (ARRAY['now'::text, 'today'::text, 'normal'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_work_orders_state_check' and conrelid = 'tw_work_orders'::regclass) then
    alter table tw_work_orders add constraint tw_work_orders_state_check CHECK ((state = ANY (ARRAY['open'::text, 'in progress'::text, 'done'::text, 'cancelled'::text])));
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_work_orders_wo_number_key' and conrelid = 'tw_work_orders'::regclass) then
    alter table tw_work_orders add constraint tw_work_orders_wo_number_key UNIQUE (wo_number);
  end if;
end $do$;

-- Foreign keys last, so every table exists first.
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_defects_vehicle_id_fkey' and conrelid = 'tw_defects'::regclass) then
    alter table tw_defects add constraint tw_defects_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES tw_vehicles(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_requests_part_id_fkey' and conrelid = 'tw_part_requests'::regclass) then
    alter table tw_part_requests add constraint tw_part_requests_part_id_fkey FOREIGN KEY (part_id) REFERENCES tw_parts(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_requests_po_id_fkey' and conrelid = 'tw_part_requests'::regclass) then
    alter table tw_part_requests add constraint tw_part_requests_po_id_fkey FOREIGN KEY (po_id) REFERENCES tw_purchase_orders(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_requests_vehicle_id_fkey' and conrelid = 'tw_part_requests'::regclass) then
    alter table tw_part_requests add constraint tw_part_requests_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES tw_vehicles(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_txns_part_id_fkey' and conrelid = 'tw_part_txns'::regclass) then
    alter table tw_part_txns add constraint tw_part_txns_part_id_fkey FOREIGN KEY (part_id) REFERENCES tw_parts(id) ON DELETE CASCADE;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_txns_time_entry_id_fkey' and conrelid = 'tw_part_txns'::regclass) then
    alter table tw_part_txns add constraint tw_part_txns_time_entry_id_fkey FOREIGN KEY (time_entry_id) REFERENCES tw_time_entries(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_part_txns_vehicle_id_fkey' and conrelid = 'tw_part_txns'::regclass) then
    alter table tw_part_txns add constraint tw_part_txns_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES tw_vehicles(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_parts_vendor_id_fkey' and conrelid = 'tw_parts'::regclass) then
    alter table tw_parts add constraint tw_parts_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES tw_vendors(id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_completions_program_id_fkey' and conrelid = 'tw_pm_completions'::regclass) then
    alter table tw_pm_completions add constraint tw_pm_completions_program_id_fkey FOREIGN KEY (program_id) REFERENCES tw_pm_programs(id) ON DELETE CASCADE;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_pm_completions_vehicle_id_fkey' and conrelid = 'tw_pm_completions'::regclass) then
    alter table tw_pm_completions add constraint tw_pm_completions_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES tw_vehicles(id) ON DELETE CASCADE;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_po_lines_part_id_fkey' and conrelid = 'tw_po_lines'::regclass) then
    alter table tw_po_lines add constraint tw_po_lines_part_id_fkey FOREIGN KEY (part_id) REFERENCES tw_parts(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_po_lines_po_id_fkey' and conrelid = 'tw_po_lines'::regclass) then
    alter table tw_po_lines add constraint tw_po_lines_po_id_fkey FOREIGN KEY (po_id) REFERENCES tw_purchase_orders(id) ON DELETE CASCADE;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_purchase_orders_vendor_id_fkey' and conrelid = 'tw_purchase_orders'::regclass) then
    alter table tw_purchase_orders add constraint tw_purchase_orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES tw_vendors(id);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_shifts_mechanic_id_fkey' and conrelid = 'tw_shifts'::regclass) then
    alter table tw_shifts add constraint tw_shifts_mechanic_id_fkey FOREIGN KEY (mechanic_id) REFERENCES tw_mechanics(id) ON DELETE CASCADE;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entries_cost_code_fkey' and conrelid = 'tw_time_entries'::regclass) then
    alter table tw_time_entries add constraint tw_time_entries_cost_code_fkey FOREIGN KEY (cost_code) REFERENCES tw_cost_codes(code);
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entries_defect_id_fkey' and conrelid = 'tw_time_entries'::regclass) then
    alter table tw_time_entries add constraint tw_time_entries_defect_id_fkey FOREIGN KEY (defect_id) REFERENCES tw_defects(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entries_mechanic_id_fkey' and conrelid = 'tw_time_entries'::regclass) then
    alter table tw_time_entries add constraint tw_time_entries_mechanic_id_fkey FOREIGN KEY (mechanic_id) REFERENCES tw_mechanics(id) ON DELETE CASCADE;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entries_pm_program_id_fkey' and conrelid = 'tw_time_entries'::regclass) then
    alter table tw_time_entries add constraint tw_time_entries_pm_program_id_fkey FOREIGN KEY (pm_program_id) REFERENCES tw_pm_programs(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entries_vehicle_id_fkey' and conrelid = 'tw_time_entries'::regclass) then
    alter table tw_time_entries add constraint tw_time_entries_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES tw_vehicles(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entry_parts_part_id_fkey' and conrelid = 'tw_time_entry_parts'::regclass) then
    alter table tw_time_entry_parts add constraint tw_time_entry_parts_part_id_fkey FOREIGN KEY (part_id) REFERENCES tw_parts(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_time_entry_parts_time_entry_id_fkey' and conrelid = 'tw_time_entry_parts'::regclass) then
    alter table tw_time_entry_parts add constraint tw_time_entry_parts_time_entry_id_fkey FOREIGN KEY (time_entry_id) REFERENCES tw_time_entries(id) ON DELETE CASCADE;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_vendor_categories_vendor_id_fkey' and conrelid = 'tw_vendor_categories'::regclass) then
    alter table tw_vendor_categories add constraint tw_vendor_categories_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES tw_vendors(id) ON DELETE CASCADE;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_work_log_mechanic_id_fkey' and conrelid = 'tw_work_log'::regclass) then
    alter table tw_work_log add constraint tw_work_log_mechanic_id_fkey FOREIGN KEY (mechanic_id) REFERENCES tw_mechanics(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_work_log_vehicle_id_fkey' and conrelid = 'tw_work_log'::regclass) then
    alter table tw_work_log add constraint tw_work_log_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES tw_vehicles(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_work_orders_assigned_to_fkey' and conrelid = 'tw_work_orders'::regclass) then
    alter table tw_work_orders add constraint tw_work_orders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES tw_mechanics(id) ON DELETE SET NULL;
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'tw_work_orders_vehicle_id_fkey' and conrelid = 'tw_work_orders'::regclass) then
    alter table tw_work_orders add constraint tw_work_orders_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES tw_vehicles(id) ON DELETE SET NULL;
  end if;
end $do$;


-- ── Indexes ─────────────────────────────────────────────────

create index if not exists tw_defects_closed_idx ON public.tw_defects USING btree (closed_at DESC) WHERE (state = 'closed'::text);
create index if not exists tw_defects_state_idx ON public.tw_defects USING btree (state, safety, severity);
create index if not exists tw_defects_vehicle_idx ON public.tw_defects USING btree (vehicle_id);
create index if not exists tw_mechanics_email_idx ON public.tw_mechanics USING btree (lower(email));
create index if not exists tw_part_requests_state ON public.tw_part_requests USING btree (state);
create index if not exists tw_part_txns_part_idx ON public.tw_part_txns USING btree (part_id, created_at DESC);
create index if not exists tw_part_txns_time_entry_idx ON public.tw_part_txns USING btree (time_entry_id) WHERE (time_entry_id IS NOT NULL);
create index if not exists tw_part_txns_veh_idx ON public.tw_part_txns USING btree (vehicle_id);
create index if not exists tw_parts_number_idx ON public.tw_parts USING btree (lower(part_number));
create index if not exists tw_parts_shop_idx ON public.tw_parts USING btree (shop) WHERE active;
create index if not exists tw_pm_completions_idx ON public.tw_pm_completions USING btree (vehicle_id, program_id, done_date DESC);
create index if not exists tw_po_lines_part ON public.tw_po_lines USING btree (part_id);
create index if not exists tw_po_lines_po ON public.tw_po_lines USING btree (po_id);
create index if not exists tw_shifts_started ON public.tw_shifts USING btree (started_at DESC);
create unique index if not exists tw_shifts_one_open_per_mechanic ON public.tw_shifts USING btree (mechanic_id) WHERE (ended_at IS NULL);
create index if not exists tw_time_date_idx ON public.tw_time_entries USING btree (work_date DESC);
create index if not exists tw_time_mech_date_idx ON public.tw_time_entries USING btree (mechanic_id, work_date DESC);
create index if not exists tw_time_vehicle_idx ON public.tw_time_entries USING btree (vehicle_id);
create index if not exists tw_tep_entry_idx ON public.tw_time_entry_parts USING btree (time_entry_id);
create index if not exists tw_tep_number_idx ON public.tw_time_entry_parts USING btree (lower(btrim(part_number)));
create unique index if not exists tw_tep_one_line_per_part ON public.tw_time_entry_parts USING btree (time_entry_id, lower(btrim(part_number)));
create unique index if not exists tw_vendors_name ON public.tw_vendors USING btree (lower(name));
create index if not exists tw_work_log_time_idx ON public.tw_work_log USING btree (occurred_at DESC);
create index if not exists tw_work_log_type_idx ON public.tw_work_log USING btree (event_type, occurred_at DESC);
create index if not exists tw_work_log_unit_idx ON public.tw_work_log USING btree (unit_number, occurred_at DESC);
create index if not exists tw_work_log_who_idx ON public.tw_work_log USING btree (mechanic_id, occurred_at DESC);
create index if not exists tw_work_orders_state ON public.tw_work_orders USING btree (state);
create index if not exists tw_work_orders_held ON public.tw_work_orders USING btree (hold_since DESC) WHERE (hold_reason IS NOT NULL);
create unique index if not exists tw_work_orders_source ON public.tw_work_orders USING btree (kind, source_key);


-- ── Functions ───────────────────────────────────────────────
-- Every mechanic write goes through one of these rather than a direct
-- table grant, which is why tw_mechanics is select-only below. PINs are
-- bcrypt via pgcrypto in the extensions schema.

CREATE OR REPLACE FUNCTION public.tw_apply_part_txn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update tw_parts
     set on_hand = on_hand + new.qty_delta,
         updated_at = now()
   where id = new.part_id;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.tw_close_shift(p_shift uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_started timestamptz;
  v_ended   timestamptz;
begin
  select started_at, ended_at into v_started, v_ended
    from public.tw_shifts where id = p_shift;

  if v_started is null then
    return jsonb_build_object('ok', false, 'error', 'No such shift.');
  end if;
  if v_ended is not null then
    return jsonb_build_object('ok', false, 'error', 'That shift is already closed.');
  end if;

  update public.tw_shifts
     set ended_at = greatest(now(), started_at)
   where id = p_shift;

  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_commit_order(p_vendor_id uuid, p_lines jsonb, p_sent_how text, p_who text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po      uuid;
  v_num     text;
  v_vname   text := '(no vendor)';
  v_vemail  text;
  v_total   numeric(12,2) := 0;
  l         jsonb;
  v_part    record;
  v_qty     numeric(12,2);
  v_cost    numeric(12,2);
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Nothing on the order.');
  end if;

  if p_vendor_id is not null then
    select name, email into v_vname, v_vemail from tw_vendors where id = p_vendor_id;
    if v_vname is null then
      return jsonb_build_object('ok', false, 'error', 'No such vendor.');
    end if;
  end if;

  v_num := tw_next_po_number();
  insert into tw_purchase_orders
    (po_number, vendor_id, vendor_name, vendor_email, sent_how, ordered_by, note)
  values (v_num, p_vendor_id, v_vname, v_vemail, p_sent_how, p_who, p_note)
  returning id into v_po;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (l->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'A line needs a quantity above zero.';
    end if;
    select * into v_part from tw_parts where id = (l->>'part_id')::uuid;
    if v_part.id is null then
      raise exception 'A line points at a part that does not exist.';
    end if;
    v_cost := coalesce((l->>'unit_cost')::numeric, v_part.unit_cost);

    insert into tw_po_lines (po_id, part_id, part_number, name, shop, qty, unit_cost)
    values (v_po, v_part.id, v_part.part_number, v_part.name, v_part.shop, v_qty, v_cost);

    update tw_parts set on_order = on_order + v_qty, updated_at = now()
     where id = v_part.id;

    v_total := v_total + (v_qty * coalesce(v_cost, 0));
  end loop;

  update tw_purchase_orders set total = v_total where id = v_po;
  return jsonb_build_object('ok', true, 'id', v_po, 'po_number', v_num, 'total', v_total);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_add(p_email text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_email text := lower(btrim(p_email));
  v_name  text := btrim(p_name);
  v_id    uuid;
begin
  if v_email = '' or v_email not like '%@%' then
    return jsonb_build_object('ok', false, 'error', 'A real email address is needed.');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'A name is needed.');
  end if;

  select id into v_id from tw_mechanics where lower(email) = v_email;
  if v_id is not null then
    /* Already on the roster. Bring them back rather than refusing —
       somebody re-adding a name almost always means "reactivate". The
       PIN is untouched either way. */
    update tw_mechanics set name = v_name, active = true where id = v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'reactivated', true);
  end if;

  insert into tw_mechanics (email, name, active)
  values (v_email, v_name, true)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'reactivated', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_add_named(p_name text, p_role text DEFAULT 'mechanic'::text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_name  text := btrim(p_name);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_id    uuid;
begin
  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'A name is needed.');
  end if;
  if v_email is not null and v_email not like '%@%' then
    return jsonb_build_object('ok', false, 'error', 'That is not an email address.');
  end if;

  if v_email is not null then
    select id into v_id from tw_mechanics where lower(email) = v_email;
  end if;
  if v_id is null then
    select id into v_id from tw_mechanics
     where lower(name) = lower(v_name) and email is null;
  end if;

  if v_id is not null then
    update tw_mechanics
       set name = v_name, role = coalesce(p_role, role), active = true,
           email = coalesce(v_email, email)
     where id = v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'existing', true);
  end if;

  insert into tw_mechanics (name, email, role, active)
  values (v_name, v_email, coalesce(p_role, 'mechanic'), true)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'existing', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_add_named(p_name text, p_role text DEFAULT 'mechanic'::text, p_email text DEFAULT NULL::text, p_emp_no text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_name  text := btrim(p_name);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_emp   text := nullif(btrim(coalesce(p_emp_no, '')), '');
  v_id    uuid;
begin
  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'A name is needed.');
  end if;
  if v_email is not null and v_email not like '%@%' then
    return jsonb_build_object('ok', false, 'error', 'That is not an email address.');
  end if;

  if v_email is not null then
    select id into v_id from tw_mechanics where lower(email) = v_email;
  end if;
  if v_id is null then
    select id into v_id from tw_mechanics
     where lower(name) = lower(v_name) and email is null;
  end if;

  if v_id is not null then
    update tw_mechanics
       set name = v_name, role = coalesce(p_role, role), active = true,
           email = coalesce(v_email, email), emp_no = coalesce(v_emp, emp_no)
     where id = v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'existing', true);
  end if;

  insert into tw_mechanics (name, email, role, emp_no, active)
  values (v_name, v_email, coalesce(p_role, 'mechanic'), v_emp, true)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'existing', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_change_pin(p_email text, p_old text, p_new text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare r tw_mechanics%rowtype;
begin
  if p_new !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'The new PIN has to be four digits.');
  end if;
  select * into r from tw_mechanics where lower(email) = lower(btrim(p_email));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No one is set up with that email yet.');
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'Too many wrong PINs. Try again in a few minutes.');
  end if;
  if r.pin_hash is null or r.pin_hash <> extensions.crypt(p_old, r.pin_hash) then
    update tw_mechanics set failed_attempts = r.failed_attempts + 1,
      locked_until = case when r.failed_attempts + 1 >= 5 then now() + interval '15 minutes' end
     where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'The current PIN is not right.');
  end if;
  update tw_mechanics
     set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')),
         failed_attempts = 0, locked_until = null
   where id = r.id;
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_change_pin_by_id(p_id uuid, p_old text, p_new text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare m record;
begin
  if p_new !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'The new PIN has to be four digits.');
  end if;
  select * into m from tw_mechanics where id = p_id;
  if m.id is null or m.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'No PIN to change.');
  end if;
  if m.pin_hash <> extensions.crypt(p_old, m.pin_hash) then
    return jsonb_build_object('ok', false, 'error', 'The old PIN is not right.');
  end if;
  update tw_mechanics
     set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')),
         failed_attempts = 0, locked_until = null
   where id = p_id;
  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_check_pin(p_id uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare m record;
begin
  select * into m from tw_mechanics where id = p_id;
  if m.id is null then
    return jsonb_build_object('ok', false, 'error', 'No such mechanic.');
  end if;
  if m.locked_until is not null and m.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'Locked for a few minutes.');
  end if;
  if m.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'No PIN set yet.', 'needs_pin', true);
  end if;

  if m.pin_hash = extensions.crypt(p_pin, m.pin_hash) then
    update tw_mechanics set failed_attempts = 0, locked_until = null where id = p_id;
    return jsonb_build_object('ok', true, 'id', m.id, 'name', m.name, 'role', m.role);
  end if;

  /* Five wrong guesses and it stops answering for a quarter of an hour.
     Enough to stop somebody thumbing through 0000 to 9999 on a tablet,
     short enough that a mechanic who fat-fingered it is not stuck. */
  update tw_mechanics
     set failed_attempts = coalesce(failed_attempts, 0) + 1,
         locked_until = case when coalesce(failed_attempts, 0) + 1 >= 5
                             then now() + interval '15 minutes' else null end
   where id = p_id;
  return jsonb_build_object('ok', false, 'error', 'That PIN is not right.');
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_is_supervisor(p_actor uuid, p_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare m record;
begin
  select * into m from tw_mechanics where id = p_actor;
  if m.id is null or not m.active then return false; end if;
  if m.role not in ('dashboard', 'admin') then return false; end if;
  if m.locked_until is not null and m.locked_until > now() then return false; end if;
  if m.pin_hash is null then return false; end if;
  return m.pin_hash = extensions.crypt(p_pin, m.pin_hash);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_private_get(p_actor uuid, p_pin text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare m record;
begin
  if not tw_mechanic_is_supervisor(p_actor, p_pin) then
    return jsonb_build_object('ok', false, 'error',
      'That PIN does not belong to a supervisor.');
  end if;
  select address, phone, emergency_name, emergency_phone
    into m from tw_mechanics where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No such mechanic.');
  end if;
  return jsonb_build_object('ok', true,
    'address', m.address, 'phone', m.phone,
    'emergency_name', m.emergency_name, 'emergency_phone', m.emergency_phone);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_private_set(p_actor uuid, p_pin text, p_id uuid, p_address text, p_phone text, p_emergency_name text, p_emergency_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare n integer;
begin
  if not tw_mechanic_is_supervisor(p_actor, p_pin) then
    return jsonb_build_object('ok', false, 'error',
      'That PIN does not belong to a supervisor.');
  end if;
  update tw_mechanics
     set address         = nullif(btrim(coalesce(p_address, '')), ''),
         phone           = nullif(btrim(coalesce(p_phone, '')), ''),
         emergency_name  = nullif(btrim(coalesce(p_emergency_name, '')), ''),
         emergency_phone = nullif(btrim(coalesce(p_emergency_phone, '')), '')
   where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'No such mechanic.'); end if;
  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_register(p_email text, p_name text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_email text := lower(btrim(p_email));
  v_id    uuid;
  v_has   boolean;
begin
  if p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'The PIN has to be four digits.');
  end if;
  if coalesce(btrim(p_name), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Your name is needed.');
  end if;

  select id, pin_hash is not null into v_id, v_has
    from tw_mechanics where lower(email) = v_email;

  if v_id is not null and v_has then
    return jsonb_build_object('ok', false,
      'error', 'That email already has a PIN. Enter it instead.');
  end if;

  if v_id is not null then
    /* On the roster already, or just had their PIN reset. Setting one
       is exactly what they are supposed to do here. */
    update tw_mechanics
       set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
           name = coalesce(nullif(btrim(p_name), ''), name),
           active = true, failed_attempts = 0, locked_until = null
     where id = v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'existing', true);
  end if;

  insert into tw_mechanics (email, name, pin_hash)
  values (v_email, btrim(p_name),
          extensions.crypt(p_pin, extensions.gen_salt('bf')))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'existing', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_remove(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare entries integer; shifts integer; nm text;
begin
  select name into nm from tw_mechanics where id = p_id;
  if nm is null then
    return jsonb_build_object('ok', false, 'error', 'No such mechanic.');
  end if;

  select count(*) into entries from tw_time_entries where mechanic_id = p_id;
  select count(*) into shifts  from tw_shifts       where mechanic_id = p_id;

  if entries > 0 or shifts > 0 then
    return jsonb_build_object('ok', false, 'kept', true, 'error',
      nm || ' has ' || entries || ' timecard line(s) and ' || shifts
      || ' punch(es) on record, so removing them would take those with it. '
      || 'Take them off the roster instead — the hours stay.');
  end if;

  delete from tw_mechanics where id = p_id;
  return jsonb_build_object('ok', true, 'name', nm);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_reset_pin(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n integer;
begin
  update tw_mechanics
     set pin_hash = null, locked_until = null, failed_attempts = 0
   where lower(email) = lower(btrim(p_email));
  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('ok', false, 'error', 'No mechanic with that email.');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_reset_pin_by_id(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n integer;
begin
  update tw_mechanics
     set pin_hash = null, locked_until = null, failed_attempts = 0
   where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'No such mechanic.'); end if;
  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_set_active(p_email text, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n integer;
begin
  /* Deactivating rather than deleting, always. Hours already booked
     point at this row and a deleted mechanic would orphan them. */
  update tw_mechanics set active = coalesce(p_active, true)
   where lower(email) = lower(btrim(p_email));
  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('ok', false, 'error', 'No mechanic with that email.');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_set_active_by_id(p_id uuid, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n integer;
begin
  update tw_mechanics set active = coalesce(p_active, true) where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'No such mechanic.'); end if;
  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_set_pin(p_id uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_has boolean;
begin
  if p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'The PIN has to be four digits.');
  end if;
  select pin_hash is not null into v_has from tw_mechanics where id = p_id;
  if v_has is null then
    return jsonb_build_object('ok', false, 'error', 'No such mechanic.');
  end if;
  if v_has then
    return jsonb_build_object('ok', false,
      'error', 'A PIN is already set. Enter it, or ask for a reset.');
  end if;
  update tw_mechanics
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
         failed_attempts = 0, locked_until = null
   where id = p_id;
  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_set_role(p_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n integer;
begin
  if p_role not in ('mechanic','dashboard','admin') then
    return jsonb_build_object('ok', false, 'error', 'Not a role we have.');
  end if;
  update tw_mechanics set role = p_role where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'No such mechanic.'); end if;
  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_update(p_id uuid, p_name text, p_email text, p_emp_no text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n integer; e text; nm text;
begin
  nm := nullif(btrim(coalesce(p_name, '')), '');
  if nm is null then
    return jsonb_build_object('ok', false, 'error', 'A mechanic needs a name.');
  end if;

  e := nullif(btrim(coalesce(p_email, '')), '');
  if e is not null and e not like '%@%' then
    return jsonb_build_object('ok', false, 'error', 'That is not an email address.');
  end if;

  if e is not null and exists (
       select 1 from tw_mechanics
        where lower(email) = lower(e) and id <> p_id) then
    return jsonb_build_object('ok', false, 'error',
      'Somebody else on the roster already has that email.');
  end if;

  update tw_mechanics
     set name   = nm,
         email  = e,
         emp_no = nullif(btrim(coalesce(p_emp_no, '')), '')
   where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'No such mechanic.'); end if;
  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_mechanic_verify_pin(p_email text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare r tw_mechanics%rowtype;
begin
  select * into r from tw_mechanics where lower(email) = lower(btrim(p_email));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No one is set up with that email yet.');
  end if;

  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('ok', false, 'locked', true,
      'error', 'Too many wrong PINs. Try again in a few minutes.');
  end if;

  if r.pin_hash is not null and r.pin_hash = extensions.crypt(p_pin, r.pin_hash) then
    update tw_mechanics set failed_attempts = 0, locked_until = null where id = r.id;
    return jsonb_build_object('ok', true, 'id', r.id, 'name', r.name);
  end if;

  -- Five wrong tries buys a fifteen minute wait. A four digit PIN is
  -- 10,000 guesses; without this the whole space falls in seconds.
  update tw_mechanics
     set failed_attempts = r.failed_attempts + 1,
         locked_until = case when r.failed_attempts + 1 >= 5
                             then now() + interval '15 minutes' end
   where id = r.id;

  return jsonb_build_object('ok', false, 'error', 'That PIN is not right.');
end $function$;

CREATE OR REPLACE FUNCTION public.tw_next_po_number()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select 'HD-' || to_char(now(), 'YYYY') || '-' ||
         lpad((count(*) + 1)::text, 4, '0')
    from tw_purchase_orders
   where po_number like 'HD-' || to_char(now(), 'YYYY') || '-%';
$function$;

CREATE OR REPLACE FUNCTION public.tw_next_wo_number()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select 'WO-' || to_char(now(), 'YY') || '-' ||
         lpad((coalesce(max(
           nullif(regexp_replace(wo_number, '^WO-\d\d-', ''), '')::integer), 0) + 1)::text,
           4, '0')
    from tw_work_orders
   where wo_number like 'WO-' || to_char(now(), 'YY') || '-%';
$function$;

CREATE OR REPLACE FUNCTION public.tw_open_work_order(p_kind text, p_key text, p_unit text, p_title text, p_detail text DEFAULT NULL::text, p_priority text DEFAULT 'normal'::text, p_vehicle_id uuid DEFAULT NULL::uuid, p_who text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id  uuid;
  v_num text;
begin
  select id, wo_number into v_id, v_num from tw_work_orders
   where kind = p_kind and source_key = p_key;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'wo_number', v_num, 'created', false);
  end if;

  v_num := tw_next_wo_number();
  insert into tw_work_orders
    (wo_number, kind, source_key, vehicle_id, unit_number, title, detail,
     priority, created_by)
  values (v_num, p_kind, p_key, p_vehicle_id, p_unit, coalesce(nullif(btrim(p_title), ''), 'Untitled'),
          p_detail, coalesce(p_priority, 'normal'), p_who)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'wo_number', v_num, 'created', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_punch_out(p_mechanic uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
begin
  select id into v_id
    from public.tw_shifts
   where mechanic_id = p_mechanic and ended_at is null
   order by started_at desc
   limit 1;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not on the clock.');
  end if;

  /* greatest() rather than a bare now(): if the row was somehow stamped
     a moment in the future, a zero-length shift is a better answer than
     an error in a mechanic's face at the end of a shift. */
  update public.tw_shifts
     set ended_at = greatest(now(), started_at)
   where id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_purge_test_mechanic(p_email text DEFAULT NULL::text, p_name text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  n integer := 0;
begin
  if v_email is null and v_name is null then
    raise exception 'tw_purge_test_mechanic needs an email or a name'
      using errcode = '22023';
  end if;
  if v_email is not null and v_email not like '%@invalid' then
    raise exception 'tw_purge_test_mechanic only removes @invalid addresses, refused: %',
      p_email using errcode = '42501';
  end if;
  if v_name is not null and v_name not like 'AUTOMATED-TEST-DO-NOT-USE%' then
    raise exception 'tw_purge_test_mechanic only removes names marked as test data, refused: %',
      p_name using errcode = '42501';
  end if;

  delete from tw_time_entries where mechanic_id in (
    select id from tw_mechanics
     where (v_email is not null and lower(email) = v_email)
        or (v_name  is not null and name = v_name));

  delete from tw_mechanics
   where (v_email is not null and lower(email) = v_email)
      or (v_name  is not null and name = v_name);
  get diagnostics n = row_count;
  return n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_purge_test_work_log(p_mechanic uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_email text;
  v_gone  integer;
begin
  select email into v_email from public.tw_mechanics where id = p_mechanic;
  if v_email is null then
    raise exception 'No such mechanic.';
  end if;
  if v_email !~* '@invalid$' then
    raise exception 'Refusing to touch the work log for a real mechanic (%).', v_email;
  end if;

  delete from public.tw_work_log where mechanic_id = p_mechanic;
  get diagnostics v_gone = row_count;
  return v_gone;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_purge_test_work_log_by_actor(p_actor text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_gone integer;
begin
  if p_actor is null
     or (p_actor !~* '@invalid$' and p_actor !~ '^AUTOMATED-TEST-DO-NOT-USE') then
    raise exception 'Refusing to remove work log rows for a real actor (%).', p_actor;
  end if;

  delete from public.tw_work_log where actor_name = p_actor;
  get diagnostics v_gone = row_count;
  return v_gone;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_receive_po_line(p_line_id uuid, p_qty numeric, p_who text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_line record;
  v_left numeric(12,2);
  v_po   uuid;
  v_open integer;
begin
  select * into v_line from tw_po_lines where id = p_line_id;
  if v_line.id is null then
    return jsonb_build_object('ok', false, 'error', 'No such order line.');
  end if;
  if p_qty is null or p_qty <= 0 then
    return jsonb_build_object('ok', false, 'error', 'A quantity is needed.');
  end if;

  v_left := v_line.qty - v_line.qty_received;
  if p_qty > v_left then
    return jsonb_build_object('ok', false,
      'error', format('Only %s of that line is still outstanding.', v_left));
  end if;

  if v_line.part_id is not null then
    insert into tw_part_txns (part_id, kind, qty_delta, note, who)
    values (v_line.part_id, 'receive', p_qty,
            'Received against ' ||
              (select po_number from tw_purchase_orders where id = v_line.po_id),
            p_who);
    update tw_parts
       set on_order = greatest(0, on_order - p_qty), updated_at = now()
     where id = v_line.part_id;
  end if;

  update tw_po_lines set qty_received = qty_received + p_qty where id = p_line_id;

  v_po := v_line.po_id;
  select count(*) into v_open from tw_po_lines
   where po_id = v_po and qty_received < qty;
  update tw_purchase_orders
     set state = case when v_open = 0 then 'received' else 'part-received' end
   where id = v_po;

  return jsonb_build_object('ok', true, 'fully_received', v_open = 0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_shift_hours(p_start timestamp with time zone, p_end timestamp with time zone, p_lunch integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when p_start is null or p_end is null then 0::numeric
    else greatest(0, round(
      (extract(epoch from (p_end - p_start)) / 60 - coalesce(p_lunch, 0)) / 60.0, 2))
  end;
$function$;

CREATE OR REPLACE FUNCTION public.tw_sync_defect_work_orders(p_who text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  d      record;
  r      jsonb;
  made   integer := 0;
  linked integer := 0;
begin
  for d in
    select id, defect_key, unit_number, category, note, safety, severity,
           vehicle_id, work_order
      from tw_defects where state <> 'repaired'
  loop
    r := tw_open_work_order(
      'defect', d.defect_key, d.unit_number,
      coalesce(nullif(btrim(d.category), ''), 'Defect'), d.note,
      case when d.safety = 'unsafe' then 'now'
           when d.severity = 'major' then 'today'
           else 'normal' end,
      d.vehicle_id, p_who);
    if (r->>'created')::boolean then made := made + 1; end if;
    if d.work_order is distinct from (r->>'wo_number') then
      update tw_defects set work_order = r->>'wo_number', updated_at = now()
       where id = d.id;
      linked := linked + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'opened', made, 'linked', linked);
end;
$function$;


-- ── Views ───────────────────────────────────────────────────
-- security_invoker on every one: without it a view reads with its
-- owner's rights and becomes a hole straight through the RLS below.

create or replace view tw_vehicle_meter as
SELECT v.id AS vehicle_id,
    v.number AS truck,
    o.odometer AS current_odometer,
    o.reading_date AS odometer_date,
    o.source AS odometer_source
   FROM (tw_vehicles v
     LEFT JOIN LATERAL ( SELECT tw_odometer_log.odometer,
            tw_odometer_log.reading_date,
            tw_odometer_log.source
           FROM tw_odometer_log
          WHERE (tw_odometer_log.vehicle_id = v.id)
          ORDER BY tw_odometer_log.odometer DESC, tw_odometer_log.reading_date DESC
         LIMIT 1) o ON (true));

create or replace view tw_shift_days as
SELECT s.id,
    s.mechanic_id,
    m.name AS mechanic,
    ((s.started_at AT TIME ZONE 'America/New_York'::text))::date AS work_date,
    s.started_at,
    s.ended_at,
    s.lunch_minutes,
    tw_shift_hours(s.started_at, s.ended_at, s.lunch_minutes) AS clock_hours,
    (s.ended_at IS NULL) AS open,
    s.note
   FROM (tw_shifts s
     JOIN tw_mechanics m ON ((m.id = s.mechanic_id)));

create or replace view tw_hours as
SELECT t.id,
    t.work_date,
    t.hours,
    t.cost_code,
    t.where_worked,
    t.work_order,
    t.note,
    t.defect_id,
    m.id AS mechanic_id,
    m.name AS mechanic,
    m.email AS mechanic_email,
    v.id AS vehicle_id,
    COALESCE(v.number, t.unit_label) AS unit,
    v.division,
    c.name AS cost_code_name,
    c.code_group,
    t.work_types,
    t.unit_seconds,
    t.stints,
    t.work_performed,
    t.created_at
   FROM (((tw_time_entries t
     JOIN tw_mechanics m ON ((m.id = t.mechanic_id)))
     LEFT JOIN tw_cost_codes c ON ((c.code = t.cost_code)))
     LEFT JOIN tw_vehicles v ON ((v.id = t.vehicle_id)));

create or replace view tw_on_clock as
SELECT s.id,
    s.mechanic_id,
    m.name AS mechanic,
    m.email AS mechanic_email,
    s.started_at,
    s.note,
    ((s.started_at AT TIME ZONE 'America/New_York'::text))::date AS started_on,
    (((s.started_at AT TIME ZONE 'America/New_York'::text))::date < ((now() AT TIME ZONE 'America/New_York'::text))::date) AS stale
   FROM (tw_shifts s
     JOIN tw_mechanics m ON ((m.id = s.mechanic_id)))
  WHERE (s.ended_at IS NULL);

create or replace view tw_part_vendor as
SELECT p.id AS part_id,
    COALESCE(p.vendor_id, vc.vendor_id) AS vendor_id,
    v.name AS vendor_name,
    v.email AS vendor_email,
    (p.vendor_id IS NOT NULL) AS overridden
   FROM ((tw_parts p
     LEFT JOIN tw_vendor_categories vc ON ((vc.category = p.category)))
     LEFT JOIN tw_vendors v ON ((v.id = COALESCE(p.vendor_id, vc.vendor_id))));

create or replace view tw_parts_reorder as
SELECT id,
    part_number,
    name,
    shop,
    category,
    uom,
    on_hand,
    allocated,
    on_order,
    available,
    min_qty,
    max_qty,
    bin,
    unit_cost,
    tags,
    tracked,
    active,
    created_at,
    updated_at,
        CASE
            WHEN (NOT tracked) THEN 'untracked'::text
            WHEN ((min_qty IS NULL) AND (max_qty IS NULL)) THEN
            CASE
                WHEN (on_hand <= (0)::numeric) THEN 'not stocked'::text
                ELSE 'no reorder point'::text
            END
            WHEN (on_hand <= (0)::numeric) THEN 'out'::text
            WHEN ((min_qty IS NOT NULL) AND (on_hand <= min_qty)) THEN 'low'::text
            ELSE 'ok'::text
        END AS stock_state,
        CASE
            WHEN ((max_qty IS NOT NULL) AND (max_qty > on_hand)) THEN (max_qty - on_hand)
            ELSE NULL::numeric
        END AS suggested_order
   FROM tw_parts p
  WHERE active;

create or replace view tw_payroll_lines as
SELECT t.work_date,
    m.emp_no,
    m.name AS mechanic,
    t.cost_code,
    c.name AS cost_code_name,
    COALESCE(v.number, t.unit_label) AS unit,
    t.where_worked,
    t.job_location,
    t.hours,
    round(((t.unit_seconds)::numeric / 3600.0), 2) AS true_hours,
    jsonb_array_length(t.stints) AS segments,
    t.work_order,
    array_to_string(t.work_types, ' · '::text) AS work_types,
        CASE
            WHEN (d.id IS NULL) THEN NULL::text
            ELSE (d.category || COALESCE((' — '::text || d.note), ''::text))
        END AS dvir,
    p.name AS pm_service,
    COALESCE(( SELECT string_agg(((trim_scale(ep.qty) || 'x '::text) || ep.part_number), '; '::text ORDER BY ep.part_number) AS string_agg
           FROM tw_time_entry_parts ep
          WHERE (ep.time_entry_id = t.id)), ''::text) AS parts_used,
    t.work_performed,
    t.id AS entry_id,
    m.id AS mechanic_id
   FROM (((((tw_time_entries t
     JOIN tw_mechanics m ON ((m.id = t.mechanic_id)))
     LEFT JOIN tw_cost_codes c ON ((c.code = t.cost_code)))
     LEFT JOIN tw_vehicles v ON ((v.id = t.vehicle_id)))
     LEFT JOIN tw_defects d ON ((d.id = t.defect_id)))
     LEFT JOIN tw_pm_programs p ON ((p.id = t.pm_program_id)));

create or replace view tw_pm_due as
WITH base AS (
         SELECT v.id AS vehicle_id,
            v.number AS truck,
            v.division,
            p.id AS program_id,
            p.name AS program,
            p.category,
            p.interval_miles,
            p.interval_months,
            p.est_hours,
            COALESCE(p.lead_miles, (ceil(((p.interval_miles)::numeric * 0.1)))::integer) AS lead_miles,
            COALESCE(p.lead_days, 30) AS lead_days,
            c_1.done_date AS last_date,
            c_1.done_odometer AS last_odometer,
            c_1.done_by AS last_by,
            m.current_odometer,
            m.odometer_date
           FROM (((tw_vehicles v
             CROSS JOIN tw_pm_programs p)
             LEFT JOIN LATERAL ( SELECT tw_pm_completions.done_date,
                    tw_pm_completions.done_odometer,
                    tw_pm_completions.done_by
                   FROM tw_pm_completions
                  WHERE ((tw_pm_completions.vehicle_id = v.id) AND (tw_pm_completions.program_id = p.id))
                  ORDER BY tw_pm_completions.done_date DESC, tw_pm_completions.done_odometer DESC NULLS LAST
                 LIMIT 1) c_1 ON (true))
             LEFT JOIN tw_vehicle_meter m ON ((m.vehicle_id = v.id)))
          WHERE (v.active AND p.active AND ((p.applies_to IS NULL) OR (p.applies_to = v.division)))
        ), calc AS (
         SELECT b.vehicle_id,
            b.truck,
            b.division,
            b.program_id,
            b.program,
            b.category,
            b.interval_miles,
            b.interval_months,
            b.est_hours,
            b.lead_miles,
            b.lead_days,
            b.last_date,
            b.last_odometer,
            b.last_by,
            b.current_odometer,
            b.odometer_date,
                CASE
                    WHEN ((b.interval_miles IS NOT NULL) AND (b.last_odometer IS NOT NULL)) THEN (b.last_odometer + b.interval_miles)
                    ELSE NULL::integer
                END AS due_at_odometer,
                CASE
                    WHEN ((b.interval_miles IS NOT NULL) AND (b.last_odometer IS NOT NULL) AND (b.current_odometer IS NOT NULL)) THEN ((b.last_odometer + b.interval_miles) - b.current_odometer)
                    ELSE NULL::integer
                END AS miles_remaining,
                CASE
                    WHEN ((b.interval_months IS NOT NULL) AND (b.last_date IS NOT NULL)) THEN ((b.last_date + ((b.interval_months || ' months'::text))::interval))::date
                    ELSE NULL::date
                END AS due_date,
                CASE
                    WHEN ((b.interval_months IS NOT NULL) AND (b.last_date IS NOT NULL)) THEN (((b.last_date + ((b.interval_months || ' months'::text))::interval))::date - CURRENT_DATE)
                    ELSE NULL::integer
                END AS days_remaining
           FROM base b
        )
 SELECT vehicle_id,
    truck,
    division,
    program_id,
    program,
    category,
    interval_miles,
    interval_months,
    est_hours,
    lead_miles,
    lead_days,
    last_date,
    last_odometer,
    last_by,
    current_odometer,
    odometer_date,
    due_at_odometer,
    miles_remaining,
    due_date,
    days_remaining,
        CASE
            WHEN (last_date IS NULL) THEN 'nobaseline'::text
            WHEN ((COALESCE((miles_remaining)::numeric, '1000000000'::numeric) <= (0)::numeric) OR (COALESCE((days_remaining)::numeric, '1000000000'::numeric) <= (0)::numeric)) THEN 'over'::text
            WHEN ((COALESCE((miles_remaining)::numeric, '1000000000'::numeric) <= (lead_miles)::numeric) OR (COALESCE((days_remaining)::numeric, '1000000000'::numeric) <= (lead_days)::numeric)) THEN 'soon'::text
            ELSE 'ok'::text
        END AS level
   FROM calc c;

create or replace view tw_timecard_days as
WITH booked AS (
         SELECT tw_time_entries.mechanic_id,
            tw_time_entries.work_date,
            sum(tw_time_entries.hours) AS booked_hours,
            ((sum(tw_time_entries.unit_seconds))::numeric / 3600.0) AS true_hours,
            count(*) AS lines,
            count(*) FILTER (WHERE (tw_time_entries.cost_code IS NULL)) AS uncoded_lines,
            sum(tw_time_entries.hours) FILTER (WHERE (tw_time_entries.cost_code IS NULL)) AS uncoded_hours
           FROM tw_time_entries
          GROUP BY tw_time_entries.mechanic_id, tw_time_entries.work_date
        ), clocked AS (
         SELECT tw_shift_days.mechanic_id,
            tw_shift_days.work_date,
            sum(tw_shift_days.clock_hours) AS clock_hours,
            min(tw_shift_days.started_at) AS first_in,
            max(tw_shift_days.ended_at) AS last_out,
            bool_or(tw_shift_days.open) AS still_open
           FROM tw_shift_days
          GROUP BY tw_shift_days.mechanic_id, tw_shift_days.work_date
        ), days AS (
         SELECT booked.mechanic_id,
            booked.work_date
           FROM booked
        UNION
         SELECT clocked.mechanic_id,
            clocked.work_date
           FROM clocked
        )
 SELECT d.mechanic_id,
    m.name AS mechanic,
    m.emp_no,
    d.work_date,
    COALESCE(k.clock_hours, (0)::numeric) AS clock_hours,
    COALESCE(b.booked_hours, (0)::numeric) AS booked_hours,
    round(COALESCE(b.true_hours, (0)::numeric), 2) AS true_hours,
    round((COALESCE(k.clock_hours, (0)::numeric) - COALESCE(b.booked_hours, (0)::numeric)), 2) AS difference,
    COALESCE(b.lines, (0)::bigint) AS lines,
    COALESCE(b.uncoded_lines, (0)::bigint) AS uncoded_lines,
    COALESCE(b.uncoded_hours, (0)::numeric) AS uncoded_hours,
    k.first_in,
    k.last_out,
    COALESCE(k.still_open, false) AS still_open
   FROM (((days d
     JOIN tw_mechanics m ON ((m.id = d.mechanic_id)))
     LEFT JOIN booked b ON (((b.mechanic_id = d.mechanic_id) AND (b.work_date = d.work_date))))
     LEFT JOIN clocked k ON (((k.mechanic_id = d.mechanic_id) AND (k.work_date = d.work_date))));

create or replace view tw_work_history as
SELECT d.created_at AS at,
    'defect'::text AS kind,
    'Defect logged'::text AS what,
    d.unit_number AS unit,
    d.vehicle_id,
    (COALESCE(NULLIF(d.category, ''::text), 'Defect'::text) ||
        CASE
            WHEN (d.safety = 'unsafe'::text) THEN ' (out of service)'::text
            ELSE ''::text
        END) AS summary,
    COALESCE(d.created_by, d.source) AS who,
    d.work_order,
    NULL::numeric AS hours,
    d.id AS source_id
   FROM tw_defects d
UNION ALL
 SELECT d.repaired_at AS at,
    'defect'::text AS kind,
    'Defect repaired'::text AS what,
    d.unit_number AS unit,
    d.vehicle_id,
    (COALESCE(NULLIF(d.category, ''::text), 'Defect'::text) || COALESCE((' — '::text || NULLIF(d.repair_note, ''::text)), ''::text)) AS summary,
    d.repaired_by AS who,
    d.work_order,
    d.repair_hours AS hours,
    d.id AS source_id
   FROM tw_defects d
  WHERE (d.repaired_at IS NOT NULL)
UNION ALL
 SELECT h.created_at AS at,
    'hours'::text AS kind,
    'Hours booked'::text AS what,
    COALESCE(h.unit_label, v.number) AS unit,
    h.vehicle_id,
    (((h.hours || 'h · '::text) || COALESCE(h.cost_code, '—'::text)) || COALESCE((' · '::text || NULLIF(h.note, ''::text)), ''::text)) AS summary,
    m.name AS who,
    h.work_order,
    h.hours,
    h.id AS source_id
   FROM ((tw_time_entries h
     LEFT JOIN tw_vehicles v ON ((v.id = h.vehicle_id)))
     LEFT JOIN tw_mechanics m ON ((m.id = h.mechanic_id)))
UNION ALL
 SELECT t.created_at AS at,
    'parts'::text AS kind,
        CASE t.kind
            WHEN 'issue'::text THEN 'Parts issued'::text
            WHEN 'receive'::text THEN 'Parts received'::text
            WHEN 'import'::text THEN 'Stock imported'::text
            ELSE 'Stock adjusted'::text
        END AS what,
    v.number AS unit,
    t.vehicle_id,
    (((abs(t.qty_delta) || ' × '::text) || p.part_number) || COALESCE((' — '::text || NULLIF(p.name, ''::text)), ''::text)) AS summary,
    t.who,
    t.work_order,
    NULL::numeric AS hours,
    t.id AS source_id
   FROM ((tw_part_txns t
     JOIN tw_parts p ON ((p.id = t.part_id)))
     LEFT JOIN tw_vehicles v ON ((v.id = t.vehicle_id)))
UNION ALL
 SELECT c.created_at AS at,
    'pm'::text AS kind,
    'Service completed'::text AS what,
    v.number AS unit,
    c.vehicle_id,
    (pr.name || COALESCE(((' at '::text || c.done_odometer) || ' miles'::text), ''::text)) AS summary,
    c.done_by AS who,
    NULL::text AS work_order,
    c.hours,
    c.id AS source_id
   FROM ((tw_pm_completions c
     JOIN tw_pm_programs pr ON ((pr.id = c.program_id)))
     LEFT JOIN tw_vehicles v ON ((v.id = c.vehicle_id)))
UNION ALL
 SELECT r.created_at AS at,
    'tires'::text AS kind,
    'Tread read'::text AS what,
    v.number AS unit,
    t.vehicle_id,
    (((r.depth_32nds || '/32 on '::text) || t."position") || COALESCE(((' at '::text || r.odometer) || ' miles'::text), ''::text)) AS summary,
    r.recorded_by AS who,
    NULL::text AS work_order,
    NULL::numeric AS hours,
    r.id AS source_id
   FROM ((tw_tread_readings r
     JOIN tw_tires t ON ((t.id = r.tire_id)))
     LEFT JOIN tw_vehicles v ON ((v.id = t.vehicle_id)))
UNION ALL
 SELECT o.ordered_at AS at,
    'order'::text AS kind,
    'Parts ordered'::text AS what,
    NULL::text AS unit,
    NULL::uuid AS vehicle_id,
    (((o.po_number || ' · '::text) || o.vendor_name) ||
        CASE
            WHEN (o.total > (0)::numeric) THEN (' · $'::text || o.total)
            ELSE ''::text
        END) AS summary,
    o.ordered_by AS who,
    NULL::text AS work_order,
    NULL::numeric AS hours,
    o.id AS source_id
   FROM tw_purchase_orders o;

alter view tw_vehicle_meter set (security_invoker = true);
alter view tw_shift_days set (security_invoker = true);
alter view tw_hours set (security_invoker = true);
alter view tw_on_clock set (security_invoker = true);
alter view tw_part_vendor set (security_invoker = true);
alter view tw_parts_reorder set (security_invoker = true);
alter view tw_payroll_lines set (security_invoker = true);
alter view tw_pm_due set (security_invoker = true);
alter view tw_timecard_days set (security_invoker = true);
alter view tw_work_history set (security_invoker = true);


-- ── Triggers ────────────────────────────────────────────────
-- Stock moves are written as transactions; this keeps the running
-- total on tw_parts in step with them.
drop trigger if exists tw_part_txn_applies on tw_part_txns;
CREATE TRIGGER tw_part_txn_applies AFTER INSERT ON public.tw_part_txns FOR EACH ROW EXECUTE FUNCTION tw_apply_part_txn();


-- ── Row level security ──────────────────────────────────────
-- The app has no login, so requests arrive as anon. See HANDOFF.md
-- for what that costs and why it was chosen.

alter table tw_cost_codes enable row level security;
alter table tw_defects enable row level security;
alter table tw_mechanics enable row level security;
alter table tw_part_requests enable row level security;
alter table tw_part_txns enable row level security;
alter table tw_parts enable row level security;
alter table tw_pm_completions enable row level security;
alter table tw_pm_programs enable row level security;
alter table tw_po_lines enable row level security;
alter table tw_purchase_orders enable row level security;
alter table tw_shifts enable row level security;
alter table tw_time_entries enable row level security;
alter table tw_time_entry_parts enable row level security;
alter table tw_vendor_categories enable row level security;
alter table tw_vendors enable row level security;
alter table tw_work_log enable row level security;
alter table tw_work_orders enable row level security;

drop policy if exists "tw_cost_codes_anon_all" on tw_cost_codes;
create policy "tw_cost_codes_anon_all" on tw_cost_codes for all to anon using (true) with check (true);
drop policy if exists "tw_cost_codes_authenticated_all" on tw_cost_codes;
create policy "tw_cost_codes_authenticated_all" on tw_cost_codes for all to authenticated using (true) with check (true);
drop policy if exists "tw_defects_anon_all" on tw_defects;
create policy "tw_defects_anon_all" on tw_defects for all to anon using (true) with check (true);
drop policy if exists "tw_defects_authenticated_all" on tw_defects;
create policy "tw_defects_authenticated_all" on tw_defects for all to authenticated using (true) with check (true);
drop policy if exists "tw_mechanics_read" on tw_mechanics;
create policy "tw_mechanics_read" on tw_mechanics for select to anon,authenticated using (true);
drop policy if exists "tw_part_requests_anon_all" on tw_part_requests;
create policy "tw_part_requests_anon_all" on tw_part_requests for all to anon using (true) with check (true);
drop policy if exists "tw_part_requests_auth_all" on tw_part_requests;
create policy "tw_part_requests_auth_all" on tw_part_requests for all to authenticated using (true) with check (true);
drop policy if exists "tw_part_txns_anon_all" on tw_part_txns;
create policy "tw_part_txns_anon_all" on tw_part_txns for all to anon using (true) with check (true);
drop policy if exists "tw_part_txns_authenticated_all" on tw_part_txns;
create policy "tw_part_txns_authenticated_all" on tw_part_txns for all to authenticated using (true) with check (true);
drop policy if exists "tw_parts_anon_all" on tw_parts;
create policy "tw_parts_anon_all" on tw_parts for all to anon using (true) with check (true);
drop policy if exists "tw_parts_authenticated_all" on tw_parts;
create policy "tw_parts_authenticated_all" on tw_parts for all to authenticated using (true) with check (true);
drop policy if exists "tw_pm_completions_anon_all" on tw_pm_completions;
create policy "tw_pm_completions_anon_all" on tw_pm_completions for all to anon using (true) with check (true);
drop policy if exists "tw_pm_completions_authenticated_all" on tw_pm_completions;
create policy "tw_pm_completions_authenticated_all" on tw_pm_completions for all to authenticated using (true) with check (true);
drop policy if exists "tw_pm_programs_anon_all" on tw_pm_programs;
create policy "tw_pm_programs_anon_all" on tw_pm_programs for all to anon using (true) with check (true);
drop policy if exists "tw_pm_programs_authenticated_all" on tw_pm_programs;
create policy "tw_pm_programs_authenticated_all" on tw_pm_programs for all to authenticated using (true) with check (true);
drop policy if exists "tw_po_lines_anon_all" on tw_po_lines;
create policy "tw_po_lines_anon_all" on tw_po_lines for all to anon using (true) with check (true);
drop policy if exists "tw_po_lines_auth_all" on tw_po_lines;
create policy "tw_po_lines_auth_all" on tw_po_lines for all to authenticated using (true) with check (true);
drop policy if exists "tw_purchase_orders_anon_all" on tw_purchase_orders;
create policy "tw_purchase_orders_anon_all" on tw_purchase_orders for all to anon using (true) with check (true);
drop policy if exists "tw_purchase_orders_auth_all" on tw_purchase_orders;
create policy "tw_purchase_orders_auth_all" on tw_purchase_orders for all to authenticated using (true) with check (true);
drop policy if exists "tw_shifts_anon_all" on tw_shifts;
create policy "tw_shifts_anon_all" on tw_shifts for all to anon using (true) with check (true);
drop policy if exists "tw_shifts_authenticated_all" on tw_shifts;
create policy "tw_shifts_authenticated_all" on tw_shifts for all to authenticated using (true) with check (true);
drop policy if exists "tw_time_entries_anon_all" on tw_time_entries;
create policy "tw_time_entries_anon_all" on tw_time_entries for all to anon using (true) with check (true);
drop policy if exists "tw_time_entries_authenticated_all" on tw_time_entries;
create policy "tw_time_entries_authenticated_all" on tw_time_entries for all to authenticated using (true) with check (true);
drop policy if exists "tw_time_entry_parts_anon_all" on tw_time_entry_parts;
create policy "tw_time_entry_parts_anon_all" on tw_time_entry_parts for all to anon using (true) with check (true);
drop policy if exists "tw_time_entry_parts_auth_all" on tw_time_entry_parts;
create policy "tw_time_entry_parts_auth_all" on tw_time_entry_parts for all to authenticated using (true) with check (true);
drop policy if exists "tw_vendor_categories_anon_all" on tw_vendor_categories;
create policy "tw_vendor_categories_anon_all" on tw_vendor_categories for all to anon using (true) with check (true);
drop policy if exists "tw_vendor_categories_auth_all" on tw_vendor_categories;
create policy "tw_vendor_categories_auth_all" on tw_vendor_categories for all to authenticated using (true) with check (true);
drop policy if exists "tw_vendors_anon_all" on tw_vendors;
create policy "tw_vendors_anon_all" on tw_vendors for all to anon using (true) with check (true);
drop policy if exists "tw_vendors_auth_all" on tw_vendors;
create policy "tw_vendors_auth_all" on tw_vendors for all to authenticated using (true) with check (true);
drop policy if exists "tw_work_log_anon_insert" on tw_work_log;
create policy "tw_work_log_anon_insert" on tw_work_log for insert to anon with check (true);
drop policy if exists "tw_work_log_anon_read" on tw_work_log;
create policy "tw_work_log_anon_read" on tw_work_log for select to anon using (true);
drop policy if exists "tw_work_log_auth_insert" on tw_work_log;
create policy "tw_work_log_auth_insert" on tw_work_log for insert to authenticated with check (true);
drop policy if exists "tw_work_log_auth_read" on tw_work_log;
create policy "tw_work_log_auth_read" on tw_work_log for select to authenticated using (true);
drop policy if exists "tw_work_orders_anon_all" on tw_work_orders;
create policy "tw_work_orders_anon_all" on tw_work_orders for all to anon using (true) with check (true);
drop policy if exists "tw_work_orders_auth_all" on tw_work_orders;
create policy "tw_work_orders_auth_all" on tw_work_orders for all to authenticated using (true) with check (true);

-- ── Column grants ───────────────────────────────────────────
-- tw_mechanics is the one table the browser must not see whole. RLS
-- alone would not do it: policies work by row, and pin_hash, the
-- failed-attempt counter, home addresses and emergency contacts are
-- columns. Writes are not granted at all — they go through the
-- SECURITY DEFINER functions above.
revoke all on tw_mechanics from anon, authenticated;
grant select (id, name, email, emp_no, role, active, pin_set, locked_until,
              created_at, motive_user_id)
  on tw_mechanics to anon, authenticated;


-- ── Telling Motive a defect was repaired ────────────────────
-- Last, because it hangs off tw_defects and tw_mechanics.
--
-- A defect_key already carries the two numbers Motive needs to be told
-- about a repair: motive:<log_id>:<part_id>, where part_id is the
-- inspected part on the DVIR. What it cannot carry is the same fault
-- written up on a second morning — the sync folds those into one row so
-- the shop sees one job. This table keeps every DVIR a fault appeared
-- on, so marking it fixed here can close all of them there.

create table if not exists tw_defect_dvirs (
  id uuid primary key default gen_random_uuid(),
  defect_id uuid not null references tw_defects(id) on delete cascade,
  log_id bigint not null,
  part_id bigint not null,
  -- The id /v2/inspection_reports/{id} addresses, which is NOT log_id.
  -- Looked up on first use and kept.
  report_id bigint,
  unit_number text not null,
  reported_on date,
  -- What Motive currently holds from us, not what we wish it held. null
  -- means never sent, and it is stamped only after Motive answers 2xx —
  -- so a failed write leaves the row pending rather than claiming a
  -- repair was certified when it was not.
  sent_status text,
  sent_at timestamptz,
  -- Who it went out as. Kept here because a reopen has to be able to
  -- withdraw a repair under the same name that claimed it, and by then
  -- the defect's own repaired_by has been cleared.
  sent_by text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  constraint tw_defect_dvirs_unique unique (log_id, part_id),
  constraint tw_defect_dvirs_sent_status_check
    check (sent_status is null or sent_status in ('repaired','open','no_repair_needed')),
  constraint tw_defect_dvirs_sent_is_complete
    check ((sent_status is null) = (sent_at is null)),
  constraint tw_defect_dvirs_attempts_check check (attempts >= 0)
);

create index if not exists tw_defect_dvirs_defect_idx on tw_defect_dvirs (defect_id);
create index if not exists tw_defect_dvirs_pending_idx on tw_defect_dvirs (sent_status, attempts);

alter table tw_defect_dvirs enable row level security;
drop policy if exists "tw_defect_dvirs_anon_all" on tw_defect_dvirs;
create policy "tw_defect_dvirs_anon_all" on tw_defect_dvirs for all to anon using (true) with check (true);
drop policy if exists "tw_defect_dvirs_auth_all" on tw_defect_dvirs;
create policy "tw_defect_dvirs_auth_all" on tw_defect_dvirs for all to authenticated using (true) with check (true);

-- The mechanic as Motive knows them. Optional: without it the write-back
-- sends the name alone, which is right but less precise. Deliberately
-- not matched on name automatically — Dylan/Dillon and Isaah/Isiaih are
-- the same people spelled two ways, and a fuzzy match that got one
-- wrong would put the wrong name on a federal record.
alter table tw_mechanics add column if not exists motive_user_id bigint;

-- Re-runnable backfill for a database that already holds defects.
insert into tw_defect_dvirs (defect_id, log_id, part_id, unit_number, reported_on)
select d.id,
       split_part(d.defect_key, ':', 2)::bigint,
       split_part(d.defect_key, ':', 3)::bigint,
       d.unit_number,
       d.first_reported
  from tw_defects d
 where d.source = 'motive'
   and d.defect_key ~ '^motive:[0-9]+:[0-9]+$'
on conflict (log_id, part_id) do nothing;

-- Re-runnable for a database that already holds work orders.
alter table tw_work_orders add column if not exists hold_reason text;
alter table tw_work_orders add column if not exists hold_since timestamptz;
