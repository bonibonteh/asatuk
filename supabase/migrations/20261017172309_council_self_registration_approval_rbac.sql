-- ASA TUK self-service council registration and approval.
-- Additive migration: preserve current admin_users and council assignments.
create schema if not exists private;
alter table public.admin_users add column if not exists is_suspended boolean not null default false;

create table if not exists public.council_account_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 full_name text not null check(char_length(trim(full_name)) between 2 and 120),
 email text not null,
 requested_position text not null check(requested_position in (
 'President','Vice President','Secretary General','Assistant Secretary General','Treasurer','Assistant Treasurer',
 'Organizing Coordinator','Assistant Organizing Coordinator','Academic & Professional Affairs Coordinator',
 'Assistant Academic & Professional Affairs Coordinator','Events Coordinator','Assistant Events Coordinator',
 'PR team','Merchandise Officer','Social Media Coordinator','Assistant Social Media Coordinator')),
 status text not null default 'pending_email_verification' check(status in (
 'pending_email_verification','pending_approval','approved','rejected','suspended','revoked')),
 assigned_docket text, assigned_role_title text, admin_notes text not null default '',
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now()
);
create table if not exists public.council_access_audit (
 id bigint generated always as identity primary key,
 request_id uuid references public.council_account_requests(id) on delete set null,
 target_user_id uuid references auth.users(id) on delete set null,
 actor_user_id uuid references auth.users(id) on delete set null,
 action text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.council_account_requests enable row level security;
alter table public.council_access_audit enable row level security;
drop policy if exists "Applicants read their own council request" on public.council_account_requests;
create policy "Applicants read their own council request" on public.council_account_requests for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "Admins read council requests" on public.council_account_requests;
create policy "Admins read council requests" on public.council_account_requests for select to authenticated using(exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended));
drop policy if exists "Admins read council access audit" on public.council_access_audit;
create policy "Admins read council access audit" on public.council_access_audit for select to authenticated using(exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended));
revoke all on public.council_account_requests from anon,authenticated;
grant select on public.council_account_requests to authenticated;
revoke all on public.council_access_audit from anon,authenticated;
grant select on public.council_access_audit to authenticated;

create or replace function private.create_council_request_for_new_user() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare requested text; person_name text;
begin
 requested:=new.raw_user_meta_data->>'council_requested_position';
 person_name:=trim(coalesce(new.raw_user_meta_data->>'full_name',''));
 if requested is not null and person_name<>'' then
  if requested not in ('President','Vice President','Secretary General','Assistant Secretary General','Treasurer','Assistant Treasurer','Organizing Coordinator','Assistant Organizing Coordinator','Academic & Professional Affairs Coordinator','Assistant Academic & Professional Affairs Coordinator','Events Coordinator','Assistant Events Coordinator','PR team','Merchandise Officer','Social Media Coordinator','Assistant Social Media Coordinator') then requested:='PR team'; end if;
  insert into public.council_account_requests(user_id,full_name,email,requested_position,status)
  values(new.id,left(person_name,120),lower(new.email),requested,case when new.email_confirmed_at is null then 'pending_email_verification' else 'pending_approval' end)
  on conflict(user_id) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists asa_create_council_request_after_signup on auth.users;
create trigger asa_create_council_request_after_signup after insert on auth.users for each row execute function private.create_council_request_for_new_user();

create or replace function public.refresh_my_council_request() returns text
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare uid uuid:=auth.uid(); confirmed_at timestamptz; current_status text;
begin
 if uid is null then raise exception 'Sign in first.'; end if;
 select u.email_confirmed_at into confirmed_at from auth.users u where u.id=uid;
 select r.status into current_status from public.council_account_requests r where r.user_id=uid for update;
 if current_status is null then raise exception 'No council registration request was found.'; end if;
 if current_status in ('rejected','suspended','revoked') then return current_status; end if;
 if confirmed_at is null then
  update public.council_account_requests set status='pending_email_verification',updated_at=now() where user_id=uid and status='pending_approval';
  return 'pending_email_verification';
 end if;
 update public.council_account_requests set status='pending_approval',updated_at=now() where user_id=uid and status='pending_email_verification';
 return case when current_status='approved' then 'approved' else 'pending_approval' end;
end $$;

create or replace function public.admin_review_council_request(
 p_request_id uuid,p_decision text,p_role_title text default null,p_docket text default null,
 p_can_manage_secretariat boolean default false,p_can_manage_events boolean default false,
 p_can_manage_academics boolean default false,p_can_manage_pr boolean default false,
 p_can_manage_merchandise boolean default false,p_can_manage_finance boolean default false,p_notes text default ''
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare actor uuid:=auth.uid(); req public.council_account_requests%rowtype; confirmed_at timestamptz; safe_docket text; safe_title text;
begin
 if actor is null or not exists(select 1 from public.admin_users au where au.user_id=actor and au.role='admin' and not au.is_suspended) then raise exception 'Only an active ASA TUK administrator can review council requests.'; end if;
 select * into req from public.council_account_requests where id=p_request_id for update;
 if not found then raise exception 'Council request not found.'; end if;
 if req.user_id=actor then raise exception 'You cannot approve or reject your own request.'; end if;
 if p_decision not in ('approve','reject','suspend','reinstate','revoke') then raise exception 'Unsupported decision.'; end if;
 select u.email_confirmed_at into confirmed_at from auth.users u where u.id=req.user_id;
 if p_decision='approve' then
  if confirmed_at is null then raise exception 'The applicant must verify their email before approval.'; end if;
  if req.status not in ('pending_email_verification','pending_approval','rejected') then raise exception 'This request cannot be approved from its current state.'; end if;
  safe_title:=coalesce(nullif(trim(p_role_title),''),req.requested_position);
  safe_docket:=coalesce(nullif(trim(p_docket),''),case when req.requested_position in ('President','Vice President','Secretary General','Assistant Secretary General') then 'Executive' when req.requested_position in ('Treasurer','Assistant Treasurer') then 'Treasury' when req.requested_position like '%Academic%' then 'Academic' when req.requested_position like '%Organizing%' then 'Organizing' when req.requested_position like '%Events%' then 'Events' when req.requested_position like '%Merchandise%' then 'Merchandise' when req.requested_position like '%Social Media%' or req.requested_position='PR team' then 'PR & Communications' else 'Executive' end);
  if safe_docket not in ('Executive','Secretariat','Events','Academic','PR & Communications','Merchandise','Treasury','Organizing') then raise exception 'Invalid council docket.'; end if;
  insert into public.council_role_assignments(user_id,display_name,email,docket,role_title,can_manage_secretariat,can_manage_events,can_manage_academics,can_manage_pr,can_manage_merchandise,can_manage_finance,is_active,updated_at)
  values(req.user_id,req.full_name,req.email,safe_docket,safe_title,coalesce(p_can_manage_secretariat,false),coalesce(p_can_manage_events,false),coalesce(p_can_manage_academics,false),coalesce(p_can_manage_pr,false),coalesce(p_can_manage_merchandise,false),case when req.requested_position='Assistant Treasurer' then false else coalesce(p_can_manage_finance,false) end,true,now())
  on conflict(user_id,docket) do update set display_name=excluded.display_name,email=excluded.email,role_title=excluded.role_title,can_manage_secretariat=excluded.can_manage_secretariat,can_manage_events=excluded.can_manage_events,can_manage_academics=excluded.can_manage_academics,can_manage_pr=excluded.can_manage_pr,can_manage_merchandise=excluded.can_manage_merchandise,can_manage_finance=excluded.can_manage_finance,is_active=true,updated_at=now();
  update public.council_account_requests set status='approved',assigned_docket=safe_docket,assigned_role_title=safe_title,admin_notes=coalesce(p_notes,''),reviewed_by=actor,reviewed_at=now(),updated_at=now() where id=req.id;
 elsif p_decision='reject' then
  update public.council_account_requests set status='rejected',admin_notes=coalesce(p_notes,''),reviewed_by=actor,reviewed_at=now(),updated_at=now() where id=req.id;
  update public.council_role_assignments set is_active=false,updated_at=now() where user_id=req.user_id;
 elsif p_decision='suspend' then
  update public.council_account_requests set status='suspended',admin_notes=coalesce(p_notes,admin_notes),reviewed_by=actor,reviewed_at=now(),updated_at=now() where id=req.id;
  update public.council_role_assignments set is_active=false,updated_at=now() where user_id=req.user_id;
  update public.admin_users set is_suspended=true where user_id=req.user_id and role='admin';
 elsif p_decision='reinstate' then
  if req.status not in ('suspended','approved') then raise exception 'Only suspended or approved accounts can be reinstated.'; end if;
  if confirmed_at is null then raise exception 'The account email is not verified.'; end if;
  update public.council_account_requests set status='approved',admin_notes=coalesce(p_notes,admin_notes),reviewed_by=actor,reviewed_at=now(),updated_at=now() where id=req.id;
  update public.council_role_assignments set is_active=true,updated_at=now() where user_id=req.user_id;
  update public.admin_users set is_suspended=false where user_id=req.user_id and role='admin';
 else
  update public.council_account_requests set status='revoked',admin_notes=coalesce(p_notes,admin_notes),reviewed_by=actor,reviewed_at=now(),updated_at=now() where id=req.id;
  update public.council_role_assignments set is_active=false,updated_at=now() where user_id=req.user_id;
  update public.admin_users set is_suspended=true where user_id=req.user_id and role='admin';
 end if;
 insert into public.council_access_audit(request_id,target_user_id,actor_user_id,action,details) values(req.id,req.user_id,actor,p_decision,jsonb_build_object('requested_position',req.requested_position,'docket',coalesce(safe_docket,req.assigned_docket),'role_title',coalesce(safe_title,req.assigned_role_title),'notes',left(coalesce(p_notes,''),1000)));
 return jsonb_build_object('ok',true,'decision',p_decision,'request_id',req.id);
end $$;
revoke all on function public.refresh_my_council_request() from public,anon;
grant execute on function public.refresh_my_council_request() to authenticated;
revoke all on function public.admin_review_council_request(uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text) from public,anon;
grant execute on function public.admin_review_council_request(uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text) to authenticated;

create or replace function public.asa_account_is_active(p_user_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select case when exists(select 1 from public.council_account_requests r where r.user_id=p_user_id and r.status in ('suspended','rejected','revoked')) then false
 when exists(select 1 from public.admin_users au where au.user_id=p_user_id and au.role='admin') then not exists(select 1 from public.admin_users au where au.user_id=p_user_id and au.role='admin' and au.is_suspended)
 else exists(select 1 from public.council_role_assignments ca where ca.user_id=p_user_id and ca.is_active) end
$$;
revoke all on function public.asa_account_is_active(uuid) from public,anon;
grant execute on function public.asa_account_is_active(uuid) to authenticated;

do $$
declare p record;
begin
 for p in select schemaname,tablename,policyname,qual,with_check from pg_policies where schemaname='public' and roles::text='{authenticated}' and (coalesce(qual,'') like '%admin_users%' or coalesce(qual,'') like '%council_role_assignments%' or coalesce(with_check,'') like '%admin_users%' or coalesce(with_check,'') like '%council_role_assignments%')
 loop
  if p.qual is not null and p.with_check is not null then execute format('alter policy %I on %I.%I using ((%s) and public.asa_account_is_active((select auth.uid()))) with check ((%s) and public.asa_account_is_active((select auth.uid())))',p.policyname,p.schemaname,p.tablename,p.qual,p.with_check);
  elsif p.qual is not null then execute format('alter policy %I on %I.%I using ((%s) and public.asa_account_is_active((select auth.uid())))',p.policyname,p.schemaname,p.tablename,p.qual);
  elsif p.with_check is not null then execute format('alter policy %I on %I.%I with check ((%s) and public.asa_account_is_active((select auth.uid())))',p.policyname,p.schemaname,p.tablename,p.with_check); end if;
 end loop;
end $$;
