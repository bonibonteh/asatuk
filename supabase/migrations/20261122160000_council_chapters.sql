-- Chapters (adds new functions; nothing is dropped): ASA TUK has two chapters (Architecture, Urban Planning) that each run their own dockets.
-- The single President is association-wide (chapter 'Association') and sees both chapters; everyone else belongs to one chapter.
-- Members whose chapter has not been set yet (chapter IS NULL) keep working on legacy records but cannot use Correspondence until an administrator sets it.

alter table public.council_role_assignments add column if not exists chapter text;
alter table public.council_account_requests add column if not exists requested_chapter text;
do $$ begin
  alter table public.council_role_assignments drop constraint if exists council_role_assignments_chapter_check;
  alter table public.council_role_assignments add constraint council_role_assignments_chapter_check check (chapter is null or chapter in ('Architecture','Urban Planning','Association'));
  alter table public.council_account_requests drop constraint if exists council_account_requests_chapter_check;
  alter table public.council_account_requests add constraint council_account_requests_chapter_check check (requested_chapter is null or requested_chapter in ('Architecture','Urban Planning'));
end $$;
update public.council_role_assignments set chapter='Association' where chapter is null and lower(btrim(role_title))='president';

alter table public.council_tasks add column if not exists chapter text check (chapter is null or chapter in ('Architecture','Urban Planning'));
alter table public.council_meetings add column if not exists chapter text check (chapter is null or chapter in ('Architecture','Urban Planning'));
alter table public.council_minutes add column if not exists chapter text check (chapter is null or chapter in ('Architecture','Urban Planning'));

-- Sign-up trigger: remember the chapter the applicant chose.
create or replace function private.create_council_request_for_new_user() returns trigger
language plpgsql security definer set search_path to 'pg_catalog','public' as $function$
declare requested text; person_name text; ch text;
begin
  requested := new.raw_user_meta_data ->> 'council_requested_position';
  person_name := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  ch := new.raw_user_meta_data ->> 'council_requested_chapter';
  if ch not in ('Architecture','Urban Planning') then ch := null; end if;
  if requested is not null and person_name <> '' then
    if requested not in ('President','Vice President','Secretary General','Assistant Secretary General','Treasurer','Assistant Treasurer','Organizing Coordinator','Assistant Organizing Coordinator','Academic & Professional Affairs Coordinator','Assistant Academic & Professional Affairs Coordinator','Events Coordinator','Assistant Events Coordinator','PR team','Merchandise Officer','Social Media Coordinator','Assistant Social Media Coordinator') then
      requested := 'PR team';
    end if;
    insert into public.council_account_requests(user_id, full_name, email, requested_position, requested_chapter, status)
    values(new.id, left(person_name,120), lower(new.email), requested, ch, case when new.email_confirmed_at is null then 'pending_email_verification' else 'pending_approval' end)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $function$;
revoke execute on function private.create_council_request_for_new_user() from public, anon;
grant execute on function private.create_council_request_for_new_user() to authenticated;

-- Approval: the administrator confirms the chapter (defaults to what the applicant asked for; the President is association-wide).
create or replace function private.admin_review_council_request_with_chapter(p_request_id uuid, p_decision text, p_role_title text default null, p_docket text default null, p_can_manage_secretariat boolean default false, p_can_manage_events boolean default false, p_can_manage_academics boolean default false, p_can_manage_pr boolean default false, p_can_manage_merchandise boolean default false, p_can_manage_finance boolean default false, p_can_manage_projects boolean default false, p_can_manage_gallery boolean default false, p_can_manage_membership boolean default false, p_can_manage_timetables boolean default false, p_can_manage_leadership boolean default false, p_notes text default '', p_chapter text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','auth' as $function$
declare actor uuid:=auth.uid(); req public.council_account_requests%rowtype; result jsonb; ch text; role_t text;
begin
 if actor is null or not exists(select 1 from public.admin_users au where au.user_id=actor and au.role='admin' and not au.is_suspended) then raise exception 'Only an active ASA TUK administrator can review council requests.'; end if;
 select * into req from public.council_account_requests where id=p_request_id;
 if not found then raise exception 'Council request not found.'; end if;
 if req.user_id=actor then raise exception 'You cannot approve or reject your own request.'; end if;
 role_t := coalesce(nullif(trim(p_role_title),''), req.requested_position);
 ch := coalesce(nullif(trim(p_chapter),''), req.requested_chapter);
 if lower(btrim(role_t))='president' then ch := 'Association'; end if;
 if p_decision='approve' and (ch is null or ch not in ('Architecture','Urban Planning','Association')) then raise exception 'Choose the chapter (Architecture or Urban Planning) before approving.'; end if;
 result:=public.admin_review_council_request(p_request_id,p_decision,p_role_title,p_docket,p_can_manage_secretariat,p_can_manage_events,p_can_manage_academics,p_can_manage_pr,p_can_manage_merchandise,p_can_manage_finance,p_notes);
 if p_decision='approve' then
   update public.council_role_assignments set
     chapter=ch,
     can_manage_projects=coalesce(p_can_manage_projects,false), can_manage_gallery=coalesce(p_can_manage_gallery,false),
     can_manage_membership=coalesce(p_can_manage_membership,false), can_manage_timetables=coalesce(p_can_manage_timetables,false),
     can_manage_leadership=coalesce(p_can_manage_leadership,false),
     can_manage_finance=case when req.requested_position='Assistant Treasurer' then false else coalesce(p_can_manage_finance,false) end,
     updated_at=now()
   where user_id=req.user_id and docket=coalesce(nullif(trim(p_docket),''),req.assigned_docket);
 end if;
 return result;
end $function$;
create or replace function public.admin_review_council_request_with_chapter(p_request_id uuid, p_decision text, p_role_title text default null, p_docket text default null, p_can_manage_secretariat boolean default false, p_can_manage_events boolean default false, p_can_manage_academics boolean default false, p_can_manage_pr boolean default false, p_can_manage_merchandise boolean default false, p_can_manage_finance boolean default false, p_can_manage_projects boolean default false, p_can_manage_gallery boolean default false, p_can_manage_membership boolean default false, p_can_manage_timetables boolean default false, p_can_manage_leadership boolean default false, p_notes text default '', p_chapter text default null)
returns jsonb language sql set search_path to 'pg_catalog','public','private','auth' as $function$
 select private.admin_review_council_request_with_chapter(p_request_id,p_decision,p_role_title,p_docket,p_can_manage_secretariat,p_can_manage_events,p_can_manage_academics,p_can_manage_pr,p_can_manage_merchandise,p_can_manage_finance,p_can_manage_projects,p_can_manage_gallery,p_can_manage_membership,p_can_manage_timetables,p_can_manage_leadership,p_notes,p_chapter)
$function$;
revoke all on function public.admin_review_council_request_with_chapter(uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text) from public, anon;
revoke all on function private.admin_review_council_request_with_chapter(uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text) from public, anon;
grant execute on function public.admin_review_council_request_with_chapter(uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text) to authenticated;
grant execute on function private.admin_review_council_request_with_chapter(uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text) to authenticated;

-- Chapter scoping for existing workspace records (RESTRICTIVE: combines with the existing policies).
create or replace function private.asa_chapter_visible(p_chapter text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_chapter is null
      or exists (select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended)
      or exists (select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.chapter in ('Association', p_chapter));
$$;
create or replace function private.asa_default_chapter() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ch text;
begin
  if new.chapter is null then
    select case when count(distinct ca.chapter)=1 then min(ca.chapter) end into ch
      from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.chapter in ('Architecture','Urban Planning');
    new.chapter := ch;
  end if;
  return new;
end $$;
revoke execute on function private.asa_chapter_visible(text), private.asa_default_chapter() from public, anon;
grant execute on function private.asa_chapter_visible(text) to authenticated;
do $$ declare t text; begin
  foreach t in array array['council_tasks','council_meetings','council_minutes'] loop
    execute format('drop policy if exists chapter_scope on public.%I', t);
    execute format('create policy chapter_scope on public.%I as restrictive for all to authenticated using (private.asa_chapter_visible(chapter)) with check (private.asa_chapter_visible(chapter))', t);
    execute format('drop trigger if exists asa_default_chapter on public.%I', t);
    execute format('create trigger asa_default_chapter before insert on public.%I for each row execute function private.asa_default_chapter()', t);
  end loop;
end $$;

-- ===== Correspondence: a docket is now "<Chapter> · <Docket>" (e.g. "Architecture · Treasury") =====
alter table public.correspondence drop constraint if exists correspondence_sender_docket_check;
alter table public.correspondence add constraint correspondence_sender_docket_check check (char_length(sender_docket) between 2 and 80);
alter table public.correspondence_recipients drop constraint if exists correspondence_recipients_docket_check;
alter table public.correspondence_recipients add constraint correspondence_recipients_docket_check check (char_length(docket) between 2 and 80);

create or replace function private.corr_keys(p_head_only boolean default false) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct k), '{}') from (
    select ca.chapter || ' · ' || ca.docket k from public.council_role_assignments ca
     where private.corr_active() and ca.user_id=(select auth.uid()) and ca.is_active and ca.chapter in ('Architecture','Urban Planning','Association') and (not p_head_only or ca.is_docket_head)
    union
    select ch || ' · Executive' from public.council_role_assignments ca, unnest(array['Architecture','Urban Planning']) ch
     where private.corr_active() and ca.user_id=(select auth.uid()) and ca.is_active and ca.chapter='Association' and (not p_head_only or ca.is_docket_head)
  ) s;
$$;
create or replace function private.corr_my_dockets() returns text[] language sql stable security definer set search_path = '' as $$ select private.corr_keys(false); $$;
create or replace function private.corr_my_head_dockets() returns text[] language sql stable security definer set search_path = '' as $$ select private.corr_keys(true); $$;

create or replace function private.corr_is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select private.corr_active() and exists (select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended);
$$;
-- Oversight for one letter: administrator, the association-wide President, or the Secretary General of a chapter the letter touches.
create or replace function private.corr_oversight_for(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.corr_active() and (
    private.corr_is_admin()
    or exists (select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.chapter='Association')
    or exists (select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and lower(btrim(ca.role_title))='secretary general' and ca.chapter in ('Architecture','Urban Planning')
        and ( exists (select 1 from public.correspondence c where c.id=p_id and split_part(c.sender_docket,' · ',1)=ca.chapter)
           or exists (select 1 from public.correspondence_recipients r where r.correspondence_id=p_id and split_part(r.docket,' · ',1)=ca.chapter)))
  );
$$;
create or replace function private.corr_oversight() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.corr_active() and (private.corr_is_admin() or exists (select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and (ca.chapter='Association' or (lower(btrim(ca.role_title))='secretary general'))));
$$;
create or replace function private.corr_can_send_from(p_docket text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.corr_active() and (private.corr_is_admin() or p_docket = any(private.corr_keys(false)));
$$;
create or replace function private.corr_docket_users(p_dockets text[], p_heads_only boolean default false) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct ca.user_id), '{}') from public.council_role_assignments ca
   where ca.is_active and ca.chapter is not null and (not p_heads_only or ca.is_docket_head)
     and ( (ca.chapter || ' · ' || ca.docket) = any(p_dockets)
        or (ca.chapter='Association' and exists (select 1 from unnest(p_dockets) d where d like '% · Executive')) );
$$;
create or replace function private.corr_ref_code(p_docket text) returns text
language sql immutable set search_path = '' as $$
  select (case split_part(p_docket,' · ',1) when 'Architecture' then 'ARC' when 'Urban Planning' then 'URP' when 'Association' then 'ASC' else 'GEN' end) || '/' ||
  case lower(coalesce(nullif(split_part(p_docket,' · ',2),''), p_docket))
    when 'executive' then 'EXE' when 'secretariat' then 'SEC' when 'events' then 'EVT' when 'organizing' then 'ORG'
    when 'academic' then 'ACA' when 'pr & communications' then 'PRC' when 'merchandise' then 'MER' when 'treasury' then 'TRE'
    when 'administration' then 'ADM'
    else upper(left(regexp_replace(coalesce(nullif(split_part(p_docket,' · ',2),''), p_docket),'[^A-Za-z]','','g'),3)) end;
$$;
create or replace function private.corr_actor() returns table(name text, docket text, designation text)
language sql stable security definer set search_path = '' as $$
  select coalesce(ca.display_name, au.display_name, 'Council official'),
         case when ca.docket is null then 'Administration' when ca.chapter is null then ca.docket else ca.chapter || ' · ' || ca.docket end,
         coalesce(ca.role_title,'Administrator')
    from (select 1) x
    left join lateral (select * from public.council_role_assignments a where a.user_id=(select auth.uid()) and a.is_active order by (a.chapter is not null) desc, a.is_docket_head desc, a.created_at limit 1) ca on true
    left join public.admin_users au on au.user_id=(select auth.uid());
$$;

-- Swap oversight checks for the per-letter version.
create or replace function private.corr_can_view(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.corr_active() and exists (
    select 1 from public.correspondence c
     where c.id = p_id
       and ( (c.status = 'draft' and c.sender_user_id = (select auth.uid()))
          or (c.status <> 'draft' and (
                c.sender_user_id = (select auth.uid())
             or private.corr_oversight_for(c.id)
             or c.sender_docket = any(private.corr_my_head_dockets())
             or private.corr_is_recipient(c.id)
             or exists (select 1 from public.correspondence_recipients r where r.correspondence_id = c.id and r.docket = any(private.corr_my_head_dockets()))
          )) )
  );
$$;

create or replace function public.correspondence_directory_v2()
returns table(user_id uuid, display_name text, docket text, role_title text, is_docket_head boolean, chapter text)
language sql stable security definer set search_path = '' as $$
  select ca.user_id, coalesce(ca.display_name, ca.email), ca.chapter || ' · ' || ca.docket, ca.role_title, ca.is_docket_head, ca.chapter
    from public.council_role_assignments ca
   where private.corr_active() and ca.is_active and ca.chapter is not null
   order by ca.chapter, ca.docket, ca.is_docket_head desc, ca.display_name;
$$;
revoke all on function public.correspondence_directory_v2() from public, anon;
grant execute on function public.correspondence_directory_v2() to authenticated;

create or replace function public.correspondence_forward(p_id uuid, p_dockets text[], p_users uuid[], p_kind text default 'to', p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.correspondence%rowtype; a record; me uuid := auth.uid(); d text; u record; added int := 0; ok boolean;
begin
  if not private.corr_active() then raise exception 'Not authorised'; end if;
  if p_kind not in ('to','cc') then raise exception 'Invalid kind'; end if;
  select * into c from public.correspondence where id=p_id for update;
  if not found or c.status <> 'sent' or not private.corr_can_view(p_id) then raise exception 'Correspondence not found or closed'; end if;
  select * into a from private.corr_actor();
  ok := private.corr_oversight_for(p_id) or c.sender_user_id=me or c.sender_docket=any(private.corr_my_head_dockets())
     or exists (select 1 from public.correspondence_recipients r where r.correspondence_id=p_id and r.kind='to'
                  and (r.user_id=me or (r.user_id is null and r.docket=any(private.corr_my_head_dockets()))));
  if not ok then raise exception 'Only the sender, an addressee, a docket head, the Secretary General or an administrator may forward or copy this correspondence'; end if;
  foreach d in array coalesce(p_dockets,'{}') loop
    if d !~ '^(Architecture|Urban Planning|Association) · [A-Za-z&][A-Za-z &]{1,59}$' then raise exception 'Invalid docket'; end if;
    insert into public.correspondence_recipients(correspondence_id,kind,docket,forwarded_from) values (p_id,p_kind,d,me) on conflict do nothing;
    if found then added := added+1; perform private.corr_notify(p_id,'forwarded',case p_kind when 'to' then 'Forwarded to you: ' else 'You were copied on: ' end||c.ref_no||' – '||c.subject, private.corr_docket_users(array[d])); end if;
  end loop;
  for u in select ca.user_id, ca.chapter || ' · ' || ca.docket as docket, ca.role_title, ca.display_name from public.council_role_assignments ca where ca.is_active and ca.chapter is not null and ca.user_id = any(coalesce(p_users,'{}')) loop
    insert into public.correspondence_recipients(correspondence_id,kind,docket,user_id,designation,recipient_name,forwarded_from)
      values (p_id,p_kind,u.docket,u.user_id,u.role_title,u.display_name,me) on conflict do nothing;
    if found then added := added+1; perform private.corr_notify(p_id,'forwarded',case p_kind when 'to' then 'Forwarded to you: ' else 'You were copied on: ' end||c.ref_no||' – '||c.subject, array[u.user_id]); end if;
  end loop;
  if added = 0 then raise exception 'No new recipients were added'; end if;
  insert into public.correspondence_events(correspondence_id,event_type,actor_user_id,actor_name,actor_docket,actor_designation,body,meta)
    values (p_id, case p_kind when 'to' then 'forwarded' else 'cc_added' end, me,a.name,a.docket,a.designation, nullif(btrim(coalesce(p_note,'')),''),
            jsonb_build_object('dockets',coalesce(p_dockets,'{}'),'users',coalesce(p_users,'{}')));
end $$;

create or replace function public.correspondence_archive(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.correspondence%rowtype; a record; me uuid := auth.uid();
begin
  if not private.corr_active() then raise exception 'Not authorised'; end if;
  select * into c from public.correspondence where id=p_id for update;
  if not found or c.status not in ('sent','completed') or not private.corr_can_view(p_id) then raise exception 'Correspondence not found'; end if;
  if not (private.corr_oversight_for(p_id) or c.sender_user_id=me or c.sender_docket=any(private.corr_my_head_dockets())) then raise exception 'Only the sender side, the Secretary General or an administrator can archive'; end if;
  if c.status <> 'completed' and not private.corr_oversight_for(p_id) then raise exception 'Mark the correspondence completed before archiving it'; end if;
  select * into a from private.corr_actor();
  update public.correspondence set status='archived', archived_at=now(), completed_at=coalesce(completed_at, now()) where id=p_id;
  insert into public.correspondence_events(correspondence_id,event_type,actor_user_id,actor_name,actor_docket,actor_designation) values (p_id,'archived',me,a.name,a.docket,a.designation);
  perform private.corr_notify(p_id,'archived',c.ref_no||' was archived', private.corr_recipient_users(p_id) || private.corr_sender_side_users(p_id));
end $$;

revoke execute on function private.corr_keys(boolean), private.corr_is_admin(), private.corr_oversight_for(uuid), private.corr_my_dockets(), private.corr_my_head_dockets(), private.corr_oversight(), private.corr_can_send_from(text), private.corr_can_view(uuid), private.corr_docket_users(text[],boolean), private.corr_ref_code(text), private.corr_actor() from public, anon, authenticated;
grant execute on function private.corr_my_dockets(), private.corr_my_head_dockets(), private.corr_oversight(), private.corr_can_send_from(text), private.corr_can_view(uuid) to authenticated;
revoke all on function public.correspondence_forward(uuid,text[],uuid[],text,text), public.correspondence_archive(uuid) from public, anon;
grant execute on function public.correspondence_forward(uuid,text[],uuid[],text,text), public.correspondence_archive(uuid) to authenticated;

-- The previous directory function (no chapter) is retired from the API.
revoke execute on function public.correspondence_directory() from authenticated;
