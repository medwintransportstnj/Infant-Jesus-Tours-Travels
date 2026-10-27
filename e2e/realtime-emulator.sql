-- Test-only: feeds the local Realtime emulator (e2e/local-stack.mjs).
-- Every table in the supabase_realtime publication gets a trigger that NOTIFYs the changed row, after commit.
-- Never part of the production migrations.
create schema if not exists e2e_rt;

create or replace function e2e_rt.emit() returns trigger language plpgsql as $$
declare
  payload jsonb := jsonb_build_object(
    'table', tg_table_name, 'type', tg_op, 'at', now(),
    'record', case when tg_op <> 'DELETE' then to_jsonb(new) end,
    'old', case when tg_op <> 'INSERT' then to_jsonb(old) end);
begin
  if octet_length(payload::text) > 7800 then         -- NOTIFY limit: send keys only, the emulator refetches
    payload := payload || jsonb_build_object(
      'record', case when tg_op <> 'DELETE' then jsonb_build_object('id', to_jsonb(new)->'id') end,
      'old', case when tg_op <> 'INSERT' then jsonb_build_object('id', to_jsonb(old)->'id') end,
      'partial', true);
  end if;
  perform pg_notify('ijt_realtime', payload::text);
  return null;
end $$;

do $$
declare t record;
begin
  for t in select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' loop
    execute format('drop trigger if exists e2e_rt_emit on public.%I', t.tablename);
    execute format('create trigger e2e_rt_emit after insert or update or delete on public.%I for each row execute function e2e_rt.emit()', t.tablename);
  end loop;
end $$;
