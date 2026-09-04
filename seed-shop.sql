-- Allen Company · Haul Division — shop reference data
-- Source: the live database, 09/03/2026. Run after schema-shop.sql.
--
-- Configuration, not history: the cost codes a mechanic books time
-- against and the PM programs the due board is built from. Both upsert,
-- so re-running refreshes names and intervals without duplicating.
--
-- Deliberately not here: the mechanic roster (people change, and PIN
-- hashes are credentials), the parts catalog (thousands of rows, and
-- the shop maintains it through the Inventory CSV import), and anything
-- transactional.

-- Every timecard line carries one of these; tw_time_entries.cost_code
-- is a foreign key to this table, so an empty one means no hours can be
-- booked at all.

insert into tw_cost_codes (code, name, code_group, active, sort_order) values
  ('873', 'Service', 'Vehicle', true, 10),
  ('875', 'Small Engine', 'Vehicle', true, 20),
  ('878', 'Tire Group', 'Vehicle', true, 30),
  ('880', 'Transmission / Power Train', 'Vehicle', true, 40),
  ('885', 'Truck Attachments', 'Vehicle', true, 50),
  ('886', 'Rental', 'Other', true, 60),
  ('890', 'Undercarriage', 'Vehicle', true, 70),
  ('895', 'Water Systems', 'Vehicle', true, 80),
  ('910', 'Plant Greasing', 'Plant', true, 90),
  ('912', 'Plant Welding', 'Plant', true, 100),
  ('914', 'Plant Electrical', 'Plant', true, 110),
  ('916', 'Plant Repair', 'Plant', true, 120),
  ('918', 'Electrical Misc Parts -- ALEX', 'Plant', true, 130),
  ('920', 'Plant Painting', 'Plant', true, 140),
  ('SHOP-CF', 'Clays Ferry Shop', 'Shop', true, 150),
  ('SHOP-NIC', 'Nicholasville Shop', 'Shop', true, 160),
  ('SHOP-CB', 'Clover Bottom Shop', 'Shop', true, 170),
  ('835', 'Engine', 'Vehicle', true, 180)
on conflict (code) do update set
  name = excluded.name,
  code_group = excluded.code_group,
  sort_order = excluded.sort_order;


-- The twelve service programs the PM due board is built from. Intervals
-- are miles, months, or both — a program needs at least one.
insert into tw_pm_programs (id, name, category, interval_miles, interval_months, lead_miles, lead_days, est_hours, applies_to, active, sort_order) values
  ('c8659758-9465-4a46-9622-8c83f1a54e7a', 'Engine oil & filter', 'Engine', 15000, null, 1500, null, 2, null, true, 10),
  ('75319dc9-2826-4bb5-b222-28b34654d2f1', 'Chassis lube / grease', 'Chassis', 5000, null, 500, null, 1, null, true, 20),
  ('e314fc9a-feac-4340-adf4-742939c67761', 'Fuel filters', 'Engine', 15000, null, 1500, null, 1, null, true, 30),
  ('2e229434-0186-4bfb-9d49-cb7f4f0247ec', 'Air filter', 'Engine', 30000, null, 3000, null, 0.5, null, true, 40),
  ('b8f0bbbf-19b7-4b9c-92cf-c991febf5d5a', 'Brake inspection & adjust', 'Brakes', 10000, 6, 1000, 21, 2.5, null, true, 50),
  ('4fbd5442-06f5-41c7-9ea9-11d9a346eb7a', 'Tire rotation', 'Tires', 20000, null, 2000, null, 1.5, null, true, 60),
  ('a026e812-e56b-477d-9ff7-46ac3c0c8965', 'Transmission service', 'Drivetrain', 100000, null, 8000, null, 3, null, true, 70),
  ('7ea9e908-570d-4ea6-9fed-5a3e99d28029', 'Differential service', 'Drivetrain', 100000, null, 8000, null, 3, null, true, 80),
  ('15fcfd95-970e-4132-a438-c8aa90f8222e', 'DOT annual inspection', 'Compliance', null, 12, null, 30, 3, null, true, 90),
  ('7c9fa21f-9830-44b3-8ce5-95bfe499abf1', 'Coolant flush', 'Engine', null, 24, null, 30, 2, null, true, 100),
  ('d325aff1-b140-41e6-932d-4d11f5394358', 'Air dryer cartridge', 'Air system', null, 24, null, 30, 1, null, true, 110),
  ('68464096-97aa-4370-ac4d-1e9119b4223d', 'A/C service', 'Cab', null, 12, null, 30, 1.5, null, true, 120)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  interval_miles = excluded.interval_miles,
  interval_months = excluded.interval_months,
  lead_miles = excluded.lead_miles,
  lead_days = excluded.lead_days,
  est_hours = excluded.est_hours,
  sort_order = excluded.sort_order;
