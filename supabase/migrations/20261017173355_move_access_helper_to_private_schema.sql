-- Keep authorization helper out of the exposed public API schema.
create or replace function private.asa_account_is_active(p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
begin
 if auth.uid() is null then return false; end if;
 if p_user_id is distinct from auth.uid() and not exists(select 1 from public.admin_users au where au.user_id=auth.uid() and au.role='admin' and not au.is_suspended) then return false; end if;
 if exists(select 1 from public.council_account_requests r where r.user_id=p_user_id and r.status in ('suspended','rejected','revoked')) then return false; end if;
 if exists(select 1 from public.admin_users au where au.user_id=p_user_id and au.role='admin') then return not exists(select 1 from public.admin_users au where au.user_id=p_user_id and au.role='admin' and au.is_suspended); end if;
 return exists(select 1 from public.council_role_assignments ca where ca.user_id=p_user_id and ca.is_active);
end $$;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
revoke all on function private.asa_account_is_active(uuid) from public,anon;
grant execute on function private.asa_account_is_active(uuid) to authenticated;
do $$
declare p record; q text; w text;
begin
 for p in select schemaname,tablename,policyname,qual,with_check from pg_policies where schemaname='public' and (coalesce(qual,'') like '%asa_account_is_active%' or coalesce(with_check,'') like '%asa_account_is_active%')
 loop
  q:=case when p.qual is null then null else replace(replace(p.qual,'public.asa_account_is_active','private.asa_account_is_active'),'asa_account_is_active','private.asa_account_is_active') end;
  w:=case when p.with_check is null then null else replace(replace(p.with_check,'public.asa_account_is_active','private.asa_account_is_active'),'asa_account_is_active','private.asa_account_is_active') end;
  if q is not null and w is not null then execute format('alter policy %I on %I.%I using (%s) with check (%s)',p.policyname,p.schemaname,p.tablename,q,w);
  elsif q is not null then execute format('alter policy %I on %I.%I using (%s)',p.policyname,p.schemaname,p.tablename,q);
  elsif w is not null then execute format('alter policy %I on %I.%I with check (%s)',p.policyname,p.schemaname,p.tablename,w); end if;
 end loop;
end $$;
drop function if exists public.asa_account_is_active(uuid);
