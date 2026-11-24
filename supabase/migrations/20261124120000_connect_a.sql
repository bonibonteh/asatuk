create or replace function private.connect_is_sg() returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from admin_users where user_id=auth.uid() and role='admin')
 or exists(select 1 from council_role_assignments where user_id=auth.uid() and is_active and docket='Secretariat' and (is_docket_head or role_title ilike '%secretary%'));$$;
grant execute on function private.connect_is_sg() to authenticated;

create table if not exists connect_participants(
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references council_meetings(id) on delete cascade,
 user_id uuid not null, display_name text not null default '',
 consent text not null default 'pending' check (consent in ('pending','granted','declined')),
 consent_at timestamptz, joined_at timestamptz, left_at timestamptz, created_at timestamptz default now(),
 unique(meeting_id,user_id));
create table if not exists connect_recordings(
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references council_meetings(id) on delete cascade,
 status text not null default 'requested' check (status in ('requested','recording','stored','failed')),
 storage_path text, error text, started_by uuid, started_at timestamptz default now(), ended_at timestamptz);
create table if not exists connect_transcript_segments(
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references council_meetings(id) on delete cascade,
 speaker_user_id uuid, speaker_name text not null default 'Unknown speaker', start_ms int not null check(start_ms>=0), end_ms int,
 text text not null check(char_length(text) between 1 and 5000), source text not null default 'manual' check(source in ('livekit','upload','manual')),
 edited boolean not null default false, original_text text, edited_by uuid, created_at timestamptz default now());
create table if not exists connect_jobs(
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references council_meetings(id) on delete cascade,
 kind text not null check(kind in ('transcription','ai_minutes')), status text not null default 'pending' check(status in ('pending','running','succeeded','failed')),
 attempts int not null default 0, max_attempts int not null default 3, idempotency_key text not null unique,
 model text, error text, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists connect_ai_outputs(
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references council_meetings(id) on delete cascade,
 version int not null, status text not null default 'draft' check(status in ('draft','approved','rejected','superseded')),
 summary text not null default '', decisions jsonb not null default '[]', model text, created_by uuid, approved_by uuid, approved_at timestamptz, created_at timestamptz default now(),
 unique(meeting_id,version));
create table if not exists connect_action_points(
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references council_meetings(id) on delete cascade,
 output_id uuid references connect_ai_outputs(id) on delete set null,
 title text not null check(char_length(btrim(title)) between 3 and 180), description text not null default '',
 docket text not null check(docket in ('Executive','Secretariat','Events','Academic','PR & Communications','Merchandise','Treasury','Organizing')),
 chapter text check(chapter is null or chapter in ('Architecture','Urban Planning')),
 assigned_to uuid, due_date date, status text not null default 'proposed' check(status in ('proposed','approved','rejected')),
 task_id uuid unique references council_tasks(id) on delete set null, approved_by uuid, created_at timestamptz default now());
create table if not exists connect_notifications(
 id uuid primary key default gen_random_uuid(), user_id uuid not null, action_point_id uuid references connect_action_points(id) on delete cascade,
 message text not null, delivery_status text not null default 'delivered' check(delivery_status in ('delivered','failed')), error text,
 created_at timestamptz default now(), read_at timestamptz, unique(user_id,action_point_id));
create table if not exists connect_health_events(
 id uuid primary key default gen_random_uuid(), service text not null check(service in ('livekit','openai','supabase','transcription','ai','recording','notification')),
 level text not null check(level in ('info','warn','error')), message text not null, meeting_id uuid, created_at timestamptz default now());

do $$ declare t text; begin
 foreach t in array array['connect_participants','connect_recordings','connect_transcript_segments','connect_jobs','connect_ai_outputs','connect_action_points','connect_notifications','connect_health_events'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from anon, authenticated',t);
  execute format('grant select on %I to authenticated',t);
 end loop; end $$;
create policy cp_sel on connect_participants for select to authenticated using (user_id=auth.uid() or private.asa_council_can_manage_records());
create policy cr_sel on connect_recordings for select to authenticated using (private.asa_council_can_manage_records());
create policy ct_sel on connect_transcript_segments for select to authenticated using (private.asa_council_can_manage_records());
create policy cj_sel on connect_jobs for select to authenticated using (private.asa_council_can_manage_records());
create policy co_sel on connect_ai_outputs for select to authenticated using (private.asa_council_can_manage_records());
create policy ca_sel on connect_action_points for select to authenticated using (private.asa_council_can_manage_records() or assigned_to=auth.uid());
create policy cn_sel on connect_notifications for select to authenticated using (user_id=auth.uid());
create policy ch_sel on connect_health_events for select to authenticated using (private.connect_is_sg());
