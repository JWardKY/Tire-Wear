-- Every tw_ object the database has, one row each: columns, constraints,
-- indexes, views, functions, triggers, RLS, policies and grants.
-- Read-only — it only reads the system catalog.
--
-- Used to check the schema files against the live database. Run it in the
-- live project's SQL editor and export the result as CSV; build
-- schema.sql + schema-shop.sql into an empty local Postgres, run it there
-- too, and compare the two. Columns are keyed by position, so compare on
-- (kind, object, column name) rather than the raw name field. Ignore the
-- 'grant' rows: Supabase grants every table to anon and authenticated by
-- default, which a plain Postgres does not.
with t as (
  select c.oid, c.relname, c.relkind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname like 'tw\_%' and c.relkind in ('r','v','m')
)
select * from (
  select 'column' as kind, t.relname as object,
         lpad(a.attnum::text, 3, '0') || ' ' || a.attname as name,
         format_type(a.atttypid, a.atttypmod)
           || case when a.attnotnull then ' not null' else '' end
           || coalesce(case when a.attgenerated = 's' then ' generated always as (' else ' default ' end
                       || pg_get_expr(d.adbin, d.adrelid)
                       || case when a.attgenerated = 's' then ') stored' else '' end, '') as definition
  from t join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
  union all
  select 'constraint', t.relname, co.conname, pg_get_constraintdef(co.oid)
  from t join pg_constraint co on co.conrelid = t.oid
  union all
  select 'index', tablename, indexname, indexdef
  from pg_indexes where schemaname = 'public' and tablename like 'tw\_%'
  union all
  select 'view', t.relname, coalesce(array_to_string(c.reloptions, ','), ''), pg_get_viewdef(t.oid)
  from t join pg_class c on c.oid = t.oid where t.relkind in ('v','m')
  union all
  select 'function', p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'tw\_%' and p.prokind = 'f'
  union all
  select 'trigger', t.relname, tg.tgname, pg_get_triggerdef(tg.oid)
  from t join pg_trigger tg on tg.tgrelid = t.oid and not tg.tgisinternal
  union all
  select 'rls', t.relname, '', case when c.relrowsecurity then 'enabled' else 'disabled' end
  from t join pg_class c on c.oid = t.oid where t.relkind = 'r'
  union all
  select 'policy', tablename, policyname,
         cmd || ' to ' || array_to_string(roles, ',') || ' using (' || coalesce(qual, '') || ') with check (' || coalesce(with_check, '') || ')'
  from pg_policies where schemaname = 'public' and tablename like 'tw\_%'
  union all
  select 'grant', table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name like 'tw\_%' and grantee in ('anon','authenticated')
  group by table_name, grantee
  union all
  select 'column_grant', table_name, grantee || '.' || column_name, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.column_privileges
  where table_schema = 'public' and table_name like 'tw\_%' and grantee = 'anon'
    and (table_name, column_name) in (
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'tw_mechanics')
  group by table_name, grantee, column_name
) x
order by kind, object, name;
