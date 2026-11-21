-- Council Correspondence & Inter-Docket Communication.
-- Reuses: council_role_assignments (dockets/roles), admin_users, private.asa_account_is_active, private.asa_council_can_delete_records (admin or Secretary General).
-- Access model (enforced by RLS, not the UI):
--   Administrator / Secretary General : read everything dispatched, forward, archive. Cannot edit or delete dispatched letters.
--   Docket head                        : all dispatched correspondence sent or received by their docket.
--   Other officials                    : only letters they wrote, or that are addressed (or forwarded/CC'd) to them or their docket.
--   Dispatched letters are immutable; responses / forwards / status changes are append-only events.
-- Safe to re-run.

-- 1. Docket heads
alter table public.council_role_assignments add column if not exists is_docket_head boolean not null default false;
update public.council_role_assignments
   set is_docket_head = true
 where is_docket_head = false
   and role_title ~* '(coordinator|treasurer|secretary general|vice president|president|head|chair|director)'
   and role_title !~* 'assistant';

-- 2. Tables
create table if not exists public.correspondence_ref_counters (
  code text not null, year int not null, last_no int not null default 0,
  primary key (code, year)
);
alter table public.correspondence_ref_counters enable row level security;

create table if not exists public.correspondence (
  id uuid primary key default gen_random_uuid(),
  ref_no text unique,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  sender_docket text not null check (char_length(sender_docket) between 2 and 60),
  sender_name text not null check (char_length(sender_name) between 1 and 120),
  sender_designation text not null check (char_length(sender_designation) between 1 and 120),
  comm_type text not null default 'Official Letter' check (comm_type in ('Official Letter','Internal Memo','Request','Invitation','Notice','Report Submission','Other')),
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null default '' check (char_length(body) <= 20000),
  priority text not null default 'Normal' check (priority in ('Normal','Urgent','High Priority')),
  response_deadline date,
  letter_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','sent','completed','archived')),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint correspondence_sent_has_ref check (status = 'draft' or (ref_no is not null and dispatched_at is not null))
);
create index if not exists correspondence_sender_idx on public.correspondence(sender_user_id, status);
create index if not exists correspondence_docket_idx on public.correspondence(sender_docket, status);
create index if not exists correspondence_dispatched_idx on public.correspondence(dispatched_at desc);

create table if not exists public.correspondence_recipients (
  id uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.correspondence(id) on delete cascade,
  kind text not null default 'to' check (kind in ('to','cc')),
  docket text not null check (char_length(docket) between 2 and 60),
  user_id uuid references auth.users(id) on delete restrict,
  designation text check (char_length(designation) <= 120),
  recipient_name text check (char_length(recipient_name) <= 120),
  status text not null default 'received' check (status in ('received','acknowledged','under_review','action_required','clarification_requested','responded','completed')),
  read_at timestamptz,
  forwarded_from uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists correspondence_recipients_uidx
  on public.correspondence_recipients(correspondence_id, kind, docket, coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists correspondence_recipients_user_idx on public.correspondence_recipients(user_id);
create index if not exists correspondence_recipients_docket_idx on public.correspondence_recipients(docket);

create table if not exists public.correspondence_events (
  id uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.correspondence(id) on delete cascade,
  event_type text not null check (event_type in ('created','dispatched','opened','acknowledged','under_review','action_required','clarification_requested','response','forwarded','cc_added','completed','archived')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text, actor_docket text, actor_designation text,
  body text check (char_length(body) <= 20000),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists correspondence_events_cid_idx on public.correspondence_events(correspondence_id, created_at);

create table if not exists public.correspondence_attachments (
  id uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.correspondence(id) on delete cascade,
  event_id uuid references public.correspondence_events(id) on delete restrict,
  path text not null unique,
  name text not null check (char_length(name) between 1 and 200),
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  uploaded_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  constraint correspondence_attachment_path_chk check (path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$'),
  constraint correspondence_attachment_type_chk check (mime_type in ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','image/jpeg','image/png'))
);
create index if not exists correspondence_attachments_cid_idx on public.correspondence_attachments(correspondence_id);

create table if not exists public.correspondence_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  correspondence_id uuid not null references public.correspondence(id) on delete cascade,
  kind text not null check (kind in ('received','forwarded','response','action_required','deadline','completed','archived')),
  message text not null check (char_length(message) <= 400),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists correspondence_notifications_user_idx on public.correspondence_notifications(user_id, read_at, created_at desc);

alter table public.correspondence enable row level security;
alter table public.correspondence_recipients enable row level security;
alter table public.correspondence_events enable row level security;
alter table public.correspondence_attachments enable row level security;
alter table public.correspondence_notifications enable row level security;

-- 3. Helpers (private schema; not exposed through the API)
create or replace function private.corr_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and private.asa_account_is_active((select auth.uid()));
$$;

create or replace function private.corr_oversight() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.corr_active() and private.asa_council_can_delete_records();
$$;

create or replace function private.corr_my_dockets() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct ca.docket), '{}')
    from public.council_role_assignments ca
   where private.corr_active() and ca.user_id = (select auth.uid()) and ca.is_active;
$$;

create or replace function private.corr_my_head_dockets() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct ca.docket), '{}')
    from public.council_role_assignments ca
   where private.corr_active() and ca.user_id = (select auth.uid()) and ca.is_active and ca.is_docket_head;
$$;

-- May this user dispatch letters from the given docket? head, Secretary General, administrator or secretariat-rights holder.
create or replace function private.corr_can_send_from(p_docket text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.corr_active() and (
    exists (select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended)
    or exists (select 1 from public.council_role_assignments ca
                where ca.user_id=(select auth.uid()) and ca.is_active and ca.docket = p_docket
                  and (ca.is_docket_head or ca.can_manage_secretariat or lower(btrim(ca.role_title))='secretary general'))
  );
$$;

create or replace function private.corr_is_recipient(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.corr_active() and exists (
    select 1 from public.correspondence_recipients r
     where r.correspondence_id = p_id
       and (r.user_id = (select auth.uid()) or (r.user_id is null and r.docket = any(private.corr_my_dockets())))
  );
$$;

create or replace function private.corr_can_view(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.corr_active() and exists (
    select 1 from public.correspondence c
     where c.id = p_id
       and ( (c.status = 'draft' and c.sender_user_id = (select auth.uid()))
          or (c.status <> 'draft' and (
                c.sender_user_id = (select auth.uid())
             or private.corr_oversight()
             or c.sender_docket = any(private.corr_my_head_dockets())
             or private.corr_is_recipient(c.id)
             or exists (select 1 from public.correspondence_recipients r
                         where r.correspondence_id = c.id and r.docket = any(private.corr_my_head_dockets()))
          )) )
  );
$$;

create or replace function private.corr_folder_id(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then split_part(p_name,'/',1)::uuid end;
$$;

create or replace function private.corr_can_attach(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.corr_active() and exists (
    select 1 from public.correspondence c
     where c.id = p_id
       and ( (c.status = 'draft' and c.sender_user_id = (select auth.uid()))
          or (c.status in ('sent','completed') and private.corr_can_view(c.id)) )
  );
$$;

create or replace function private.corr_ref_code(p_docket text) returns text
language sql immutable set search_path = '' as $$
  select case lower(p_docket)
    when 'executive' then 'EXE' when 'secretariat' then 'SEC' when 'events' then 'EVT' when 'organizing' then 'ORG'
    when 'academic' then 'ACA' when 'pr & communications' then 'PRC' when 'merchandise' then 'MER' when 'treasury' then 'TRE'
    when 'administration' then 'ADM'
    else upper(left(regexp_replace(p_docket,'[^A-Za-z]','','g'),3)) end;
$$;

create or replace function private.corr_actor() returns table(name text, docket text, designation text)
language sql stable security definer set search_path = '' as $$
  select coalesce(ca.display_name, au.display_name, 'Council official'), coalesce(ca.docket,'Administration'), coalesce(ca.role_title,'Administrator')
    from (select 1) x
    left join lateral (select * from public.council_role_assignments a where a.user_id=(select auth.uid()) and a.is_active order by a.is_docket_head desc, a.created_at limit 1) ca on true
    left join public.admin_users au on au.user_id=(select auth.uid());
$$;

-- 4. RLS policies (SELECT) and draft-only writes
drop policy if exists corr_select on public.correspondence;
-- sender clause first: a STABLE helper cannot see a row inserted by the same statement (INSERT ... RETURNING).
create policy corr_select on public.correspondence for select to authenticated
  using ((sender_user_id=(select auth.uid()) and private.corr_active()) or private.corr_can_view(id));
drop policy if exists corr_insert_draft on public.correspondence;
create policy corr_insert_draft on public.correspondence for insert to authenticated
  with check (status='draft' and ref_no is null and dispatched_at is null and sender_user_id=(select auth.uid()) and private.corr_can_send_from(sender_docket));
drop policy if exists corr_update_draft on public.correspondence;
create policy corr_update_draft on public.correspondence for update to authenticated
  using (status='draft' and sender_user_id=(select auth.uid()))
  with check (status='draft' and ref_no is null and dispatched_at is null and sender_user_id=(select auth.uid()) and private.corr_can_send_from(sender_docket));
drop policy if exists corr_delete_draft on public.correspondence;
create policy corr_delete_draft on public.correspondence for delete to authenticated
  using (status='draft' and sender_user_id=(select auth.uid()));

drop policy if exists corr_rcpt_select on public.correspondence_recipients;
create policy corr_rcpt_select on public.correspondence_recipients for select to authenticated using (private.corr_can_view(correspondence_id));
drop policy if exists corr_rcpt_draft_insert on public.correspondence_recipients;
create policy corr_rcpt_draft_insert on public.correspondence_recipients for insert to authenticated
  with check (exists (select 1 from public.correspondence c where c.id=correspondence_id and c.status='draft' and c.sender_user_id=(select auth.uid())) and status='received' and read_at is null and forwarded_from is null);
drop policy if exists corr_rcpt_draft_delete on public.correspondence_recipients;
create policy corr_rcpt_draft_delete on public.correspondence_recipients for delete to authenticated
  using (exists (select 1 from public.correspondence c where c.id=correspondence_id and c.status='draft' and c.sender_user_id=(select auth.uid())));

drop policy if exists corr_evt_select on public.correspondence_events;
create policy corr_evt_select on public.correspondence_events for select to authenticated using (private.corr_can_view(correspondence_id));

drop policy if exists corr_att_select on public.correspondence_attachments;
create policy corr_att_select on public.correspondence_attachments for select to authenticated using (private.corr_can_view(correspondence_id));
drop policy if exists corr_att_insert on public.correspondence_attachments;
create policy corr_att_insert on public.correspondence_attachments for insert to authenticated
  with check (uploaded_by=(select auth.uid()) and private.corr_can_attach(correspondence_id)
    and ( exists (select 1 from public.correspondence c where c.id=correspondence_id and c.status='draft')
       or exists (select 1 from public.correspondence_events e where e.id=event_id and e.correspondence_id=correspondence_attachments.correspondence_id and e.actor_user_id=(select auth.uid()) and e.event_type in ('response','clarification_requested')) )
    and path like correspondence_id::text || '/%');
drop policy if exists corr_att_delete_draft on public.correspondence_attachments;
create policy corr_att_delete_draft on public.correspondence_attachments for delete to authenticated
  using (uploaded_by=(select auth.uid()) and exists (select 1 from public.correspondence c where c.id=correspondence_id and c.status='draft' and c.sender_user_id=(select auth.uid())));

drop policy if exists corr_notif_select on public.correspondence_notifications;
create policy corr_notif_select on public.correspondence_notifications for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists corr_notif_update on public.correspondence_notifications;
create policy corr_notif_update on public.correspondence_notifications for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

-- Least privilege on top of RLS
revoke all on public.correspondence, public.correspondence_recipients, public.correspondence_events, public.correspondence_attachments, public.correspondence_notifications, public.correspondence_ref_counters from anon, authenticated;
grant select on public.correspondence, public.correspondence_recipients, public.correspondence_events, public.correspondence_attachments, public.correspondence_notifications to authenticated;
grant insert (sender_user_id, sender_docket, sender_name, sender_designation, comm_type, subject, body, priority, response_deadline, letter_date, status) on public.correspondence to authenticated;
grant update (sender_docket, sender_name, sender_designation, comm_type, subject, body, priority, response_deadline, letter_date, updated_at) on public.correspondence to authenticated;
grant delete on public.correspondence to authenticated;
grant insert (correspondence_id, kind, docket, user_id, designation, recipient_name) on public.correspondence_recipients to authenticated;
grant delete on public.correspondence_recipients to authenticated;
grant insert (correspondence_id, event_id, path, name, mime_type, size_bytes, uploaded_by) on public.correspondence_attachments to authenticated;
grant delete on public.correspondence_attachments to authenticated;
grant update (read_at) on public.correspondence_notifications to authenticated;

-- 5. Append-only events; immutable dispatched letters
create or replace function private.corr_events_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'correspondence history is append-only'; end $$;
drop trigger if exists corr_events_no_change on public.correspondence_events;
create trigger corr_events_no_change before update or delete on public.correspondence_events
  for each row execute function private.corr_events_append_only();

create or replace function private.corr_guard_update() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'dispatched correspondence cannot be deleted'; end if;
    return old;
  end if;
  if old.ref_no is not null and new.ref_no is distinct from old.ref_no then raise exception 'reference number is immutable'; end if;
  if old.status <> 'draft' and (new.subject is distinct from old.subject or new.body is distinct from old.body
      or new.sender_user_id is distinct from old.sender_user_id or new.sender_docket is distinct from old.sender_docket
      or new.comm_type is distinct from old.comm_type or new.priority is distinct from old.priority
      or new.letter_date is distinct from old.letter_date or new.response_deadline is distinct from old.response_deadline
      or new.dispatched_at is distinct from old.dispatched_at or new.sender_name is distinct from old.sender_name
      or new.sender_designation is distinct from old.sender_designation) then
    raise exception 'a dispatched letter cannot be altered; add a response instead';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists corr_guard on public.correspondence;
create trigger corr_guard before update or delete on public.correspondence
  for each row execute function private.corr_guard_update();

-- 6. Workflow RPCs (security definer; every function re-checks auth.uid())
create or replace function private.corr_notify(p_id uuid, p_kind text, p_msg text, p_users uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.correspondence_notifications(user_id, correspondence_id, kind, message)
  select distinct u, p_id, p_kind, left(p_msg,400) from unnest(p_users) u
   where u is not null and u is distinct from (select auth.uid());
end $$;

create or replace function private.corr_docket_users(p_dockets text[], p_heads_only boolean default false) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct ca.user_id), '{}') from public.council_role_assignments ca
   where ca.is_active and ca.docket = any(p_dockets) and (not p_heads_only or ca.is_docket_head);
$$;

create or replace function private.corr_recipient_users(p_id uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select r.user_id x from public.correspondence_recipients r where r.correspondence_id=p_id and r.user_id is not null
    union
    select u from public.correspondence_recipients r, unnest(private.corr_docket_users(array[r.docket])) u where r.correspondence_id=p_id and r.user_id is null
  ) s;
$$;

create or replace function private.corr_sender_side_users(p_id uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select c.sender_user_id x from public.correspondence c where c.id=p_id
    union
    select u from public.correspondence c, unnest(private.corr_docket_users(array[c.sender_docket], true)) u where c.id=p_id
  ) s;
$$;

create or replace function public.correspondence_directory()
returns table(user_id uuid, display_name text, docket text, role_title text, is_docket_head boolean)
language sql stable security definer set search_path = '' as $$
  select ca.user_id, coalesce(ca.display_name, ca.email), ca.docket, ca.role_title, ca.is_docket_head
    from public.council_role_assignments ca
   where private.corr_active() and ca.is_active
   order by ca.docket, ca.is_docket_head desc, ca.display_name;
$$;

create or replace function public.correspondence_dispatch(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare c public.correspondence%rowtype; v_yr int := extract(year from now())::int; v_code text; n int; ref text; a record;
begin
  select * into c from public.correspondence where id=p_id for update;
  if not found or c.sender_user_id is distinct from auth.uid() or c.status <> 'draft' then raise exception 'Draft not found or already dispatched'; end if;
  if not private.corr_can_send_from(c.sender_docket) then raise exception 'You are not authorised to send correspondence for %', c.sender_docket; end if;
  if char_length(btrim(c.subject)) < 3 then raise exception 'Add a subject (at least 3 characters)'; end if;
  if char_length(btrim(c.body)) < 3 then raise exception 'Add the letter body'; end if;
  if not exists (select 1 from public.correspondence_recipients r where r.correspondence_id=p_id and r.kind='to') then raise exception 'Choose at least one recipient'; end if;
  v_code := private.corr_ref_code(c.sender_docket);
  insert into public.correspondence_ref_counters as k(code, year, last_no) values (v_code, v_yr, 1)
    on conflict (code, year) do update set last_no = k.last_no + 1 returning k.last_no into n;
  ref := 'ASATUK/' || v_code || '/' || v_yr || '/' || lpad(n::text, 4, '0');
  update public.correspondence set ref_no=ref, status='sent', dispatched_at=now(), letter_date=current_date where id=p_id;
  insert into public.correspondence_events(correspondence_id,event_type,actor_user_id,actor_name,actor_docket,actor_designation,created_at)
    values (p_id,'created',auth.uid(),c.sender_name,c.sender_docket,c.sender_designation,c.created_at);
  insert into public.correspondence_events(correspondence_id,event_type,actor_user_id,actor_name,actor_docket,actor_designation,meta)
    values (p_id,'dispatched',auth.uid(),c.sender_name,c.sender_docket,c.sender_designation,jsonb_build_object('ref',ref));
  perform private.corr_notify(p_id,'received','New correspondence '||ref||': '||c.subject, private.corr_recipient_users(p_id));
  return ref;
end $$;

-- p_action: acknowledge | under_review | action_required | clarification | respond | complete | open
create or replace function public.correspondence_act(p_id uuid, p_action text, p_body text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.correspondence%rowtype; a record; ev uuid; newstat text; etype text; v_kind text; remaining int; me uuid := auth.uid();
begin
  if not private.corr_active() then raise exception 'Not authorised'; end if;
  select * into c from public.correspondence where id=p_id for update;
  if not found or c.status not in ('sent','completed') or not private.corr_can_view(p_id) then raise exception 'Correspondence not found'; end if;
  select * into a from private.corr_actor();
  if p_action = 'open' then
    if exists (select 1 from public.correspondence_recipients r where r.correspondence_id=p_id and r.read_at is null
               and (r.user_id=me or (r.user_id is null and r.docket=any(private.corr_my_dockets())))) then
      update public.correspondence_recipients set read_at=now(), updated_at=now()
       where correspondence_id=p_id and read_at is null and (user_id=me or (user_id is null and docket=any(private.corr_my_dockets())));
      insert into public.correspondence_events(correspondence_id,event_type,actor_user_id,actor_name,actor_docket,actor_designation)
        values (p_id,'opened',me,a.name,a.docket,a.designation);
    end if;
    return null;
  end if;
  if c.status = 'completed' then raise exception 'This correspondence is already completed'; end if;
  if not exists (select 1 from public.correspondence_recipients r where r.correspondence_id=p_id and r.kind='to'
                 and (r.user_id=me or (r.user_id is null and r.docket=any(private.corr_my_dockets())))) then
    raise exception 'Only an addressee can act on this correspondence'; end if;
  if p_action in ('respond','clarification') and char_length(btrim(coalesce(p_body,''))) < 2 then raise exception 'Write your message'; end if;
  case p_action
    when 'acknowledge' then newstat:='acknowledged'; etype:='acknowledged'; v_kind:='response';
    when 'under_review' then newstat:='under_review'; etype:='under_review'; v_kind:='response';
    when 'action_required' then newstat:='action_required'; etype:='action_required'; v_kind:='action_required';
    when 'clarification' then newstat:='clarification_requested'; etype:='clarification_requested'; v_kind:='response';
    when 'respond' then newstat:='responded'; etype:='response'; v_kind:='response';
    when 'complete' then newstat:='completed'; etype:='completed'; v_kind:='completed';
    else raise exception 'Unknown action';
  end case;
  update public.correspondence_recipients set status=newstat, updated_at=now(), read_at=coalesce(read_at,now())
   where correspondence_id=p_id and kind='to' and (user_id=me or (user_id is null and docket=any(private.corr_my_dockets())));
  insert into public.correspondence_events(correspondence_id,event_type,actor_user_id,actor_name,actor_docket,actor_designation,body)
    values (p_id,etype,me,a.name,a.docket,a.designation,nullif(btrim(coalesce(p_body,'')),'')) returning id into ev;
  perform private.corr_notify(p_id,v_kind,a.docket||' ('||c.ref_no||'): '||replace(etype,'_',' '), private.corr_sender_side_users(p_id));
  if p_action = 'complete' then
    select count(*) into remaining from public.correspondence_recipients where correspondence_id=p_id and kind='to' and status <> 'completed';
    if remaining = 0 then
      update public.correspondence set status='completed', completed_at=now() where id=p_id;
      perform private.corr_notify(p_id,'completed',c.ref_no||' is completed', private.corr_sender_side_users(p_id) || private.corr_recipient_users(p_id));
    end if;
  end if;
  return ev;
end $$;

create or replace function public.correspondence_forward(p_id uuid, p_dockets text[], p_users uuid[], p_kind text default 'to', p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.correspondence%rowtype; a record; me uuid := auth.uid(); d text; u record; added int := 0; ok boolean;
begin
  if not private.corr_active() then raise exception 'Not authorised'; end if;
  if p_kind not in ('to','cc') then raise exception 'Invalid kind'; end if;
  select * into c from public.correspondence where id=p_id for update;
  if not found or c.status <> 'sent' or not private.corr_can_view(p_id) then raise exception 'Correspondence not found or closed'; end if;
  select * into a from private.corr_actor();
  ok := private.corr_oversight() or c.sender_user_id=me or c.sender_docket=any(private.corr_my_head_dockets())
     or exists (select 1 from public.correspondence_recipients r where r.correspondence_id=p_id and r.kind='to'
                  and (r.user_id=me or (r.user_id is null and r.docket=any(private.corr_my_head_dockets()))));
  if not ok then raise exception 'Only the sender, an addressee, a docket head, the Secretary General or an administrator may forward or copy this correspondence'; end if;
  foreach d in array coalesce(p_dockets,'{}') loop
    if d !~ '^[A-Za-z&][A-Za-z &]{1,59}$' then raise exception 'Invalid docket'; end if;
    insert into public.correspondence_recipients(correspondence_id,kind,docket,forwarded_from) values (p_id,p_kind,d,me) on conflict do nothing;
    if found then added := added+1; perform private.corr_notify(p_id,'forwarded',case p_kind when 'to' then 'Forwarded to you: ' else 'You were copied on: ' end||c.ref_no||' – '||c.subject, private.corr_docket_users(array[d])); end if;
  end loop;
  for u in select ca.user_id, ca.docket, ca.role_title, ca.display_name from public.council_role_assignments ca where ca.is_active and ca.user_id = any(coalesce(p_users,'{}')) loop
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
  if not (private.corr_oversight() or c.sender_user_id=me or c.sender_docket=any(private.corr_my_head_dockets())) then raise exception 'Only the sender side, the Secretary General or an administrator can archive'; end if;
  if c.status <> 'completed' and not private.corr_oversight() then raise exception 'Mark the correspondence completed before archiving it'; end if;
  select * into a from private.corr_actor();
  update public.correspondence set status='archived', archived_at=now(), completed_at=coalesce(completed_at, now()) where id=p_id;
  insert into public.correspondence_events(correspondence_id,event_type,actor_user_id,actor_name,actor_docket,actor_designation)
    values (p_id,'archived',me,a.name,a.docket,a.designation);
  perform private.corr_notify(p_id,'archived',c.ref_no||' was archived', private.corr_recipient_users(p_id) || private.corr_sender_side_users(p_id));
end $$;

-- Creates (once) a deadline reminder for the signed-in user for letters due within 3 days.
create or replace function public.correspondence_refresh_deadline_alerts() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record; me uuid := auth.uid();
begin
  if not private.corr_active() then return 0; end if;
  for r in select distinct c.id, c.ref_no, c.subject, c.response_deadline from public.correspondence c
            join public.correspondence_recipients rc on rc.correspondence_id=c.id and rc.kind='to'
           where c.status='sent' and c.response_deadline is not null and c.response_deadline <= current_date + 3
             and rc.status not in ('responded','completed')
             and (rc.user_id=me or (rc.user_id is null and rc.docket=any(private.corr_my_dockets())))
             and not exists (select 1 from public.correspondence_notifications nn where nn.user_id=me and nn.correspondence_id=c.id and nn.kind='deadline') loop
    insert into public.correspondence_notifications(user_id,correspondence_id,kind,message)
      values (me,r.id,'deadline',left(case when r.response_deadline < current_date then 'Response overdue: ' else 'Response due '||to_char(r.response_deadline,'DD Mon YYYY')||': ' end||r.ref_no||' – '||r.subject,400));
    n := n+1;
  end loop;
  return n;
end $$;

revoke all on function public.correspondence_directory(), public.correspondence_dispatch(uuid), public.correspondence_act(uuid,text,text),
  public.correspondence_forward(uuid,text[],uuid[],text,text), public.correspondence_archive(uuid), public.correspondence_refresh_deadline_alerts() from public, anon;
grant execute on function public.correspondence_directory(), public.correspondence_dispatch(uuid), public.correspondence_act(uuid,text,text),
  public.correspondence_forward(uuid,text[],uuid[],text,text), public.correspondence_archive(uuid), public.correspondence_refresh_deadline_alerts() to authenticated;
grant usage on schema private to authenticated;

-- 7. Private storage bucket for attachments
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('correspondence-files','correspondence-files',false,20971520,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.corr_can_read_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.corr_active() and exists (select 1 from public.correspondence_attachments a where a.path=p_name and private.corr_can_view(a.correspondence_id));
$$;
create or replace function private.corr_can_delete_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.corr_active() and (
    not exists (select 1 from public.correspondence_attachments a where a.path=p_name)
    or exists (select 1 from public.correspondence_attachments a join public.correspondence c on c.id=a.correspondence_id where a.path=p_name and c.status='draft' and c.sender_user_id=(select auth.uid())));
$$;

drop policy if exists corr_files_select on storage.objects;
create policy corr_files_select on storage.objects for select to authenticated
  using (bucket_id='correspondence-files' and (owner_id=(select auth.uid())::text or private.corr_can_read_object(name)));
drop policy if exists corr_files_insert on storage.objects;
create policy corr_files_insert on storage.objects for insert to authenticated
  with check (bucket_id='correspondence-files' and private.corr_folder_id(name) is not null and private.corr_can_attach(private.corr_folder_id(name)));
drop policy if exists corr_files_delete on storage.objects;
create policy corr_files_delete on storage.objects for delete to authenticated
  using (bucket_id='correspondence-files' and owner_id=(select auth.uid())::text and private.corr_can_delete_object(name));

-- 8. Function privileges: only the helpers used inside RLS policies are executable by signed-in users.
revoke execute on function private.corr_active(), private.corr_actor(), private.corr_can_attach(uuid), private.corr_can_delete_object(text), private.corr_can_read_object(text), private.corr_can_send_from(text), private.corr_can_view(uuid), private.corr_docket_users(text[],boolean), private.corr_events_append_only(), private.corr_folder_id(text), private.corr_guard_update(), private.corr_is_recipient(uuid), private.corr_my_dockets(), private.corr_my_head_dockets(), private.corr_notify(uuid,text,text,uuid[]), private.corr_oversight(), private.corr_recipient_users(uuid), private.corr_ref_code(text), private.corr_sender_side_users(uuid) from public, anon, authenticated;
grant execute on function private.corr_active(), private.corr_can_attach(uuid), private.corr_can_delete_object(text), private.corr_can_read_object(text), private.corr_can_send_from(text), private.corr_can_view(uuid), private.corr_folder_id(text), private.corr_is_recipient(uuid), private.corr_my_dockets(), private.corr_my_head_dockets(), private.corr_oversight() to authenticated;
