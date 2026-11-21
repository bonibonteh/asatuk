-- Council Hub: meeting and minutes documents (private Supabase Storage) and delete permissions.
-- Rules:
--   * Managers (admin, or an active council assignment with secretariat rights / Executive / Secretariat docket)
--     keep their current ability to create, read and edit meetings and minutes, and to upload or replace documents.
--   * Only an administrator or the Secretary General (exact role title) may DELETE a meeting or a minutes record.
--   * Other active council officials can read a record, and open its document, only when it is marked published.
-- Safe to run more than once.

-- 1. One optional attached document per meeting / minutes record, plus a "published" flag (default: not shared).
alter table public.council_meetings
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size integer,
  add column if not exists attachment_uploaded_at timestamptz,
  add column if not exists attachment_uploaded_by uuid references auth.users(id) on delete set null,
  add column if not exists published boolean not null default false;
alter table public.council_minutes
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size integer,
  add column if not exists attachment_uploaded_at timestamptz,
  add column if not exists attachment_uploaded_by uuid references auth.users(id) on delete set null,
  add column if not exists published boolean not null default false;

do $$
declare t text;
begin
  foreach t in array array['council_meetings','council_minutes'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t||'_attachment_check');
    execute format($f$alter table public.%I add constraint %I check (
      (attachment_path is null and attachment_name is null and attachment_type is null and attachment_size is null)
      or (attachment_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$'
          and char_length(coalesce(attachment_name,'')) between 1 and 200
          and attachment_type in ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','image/jpeg','image/png')
          and attachment_size between 1 and 20971520)
    )$f$, t, t||'_attachment_check');
    execute format('create unique index if not exists %I on public.%I(attachment_path) where attachment_path is not null', t||'_attachment_path_uidx', t);
  end loop;
end $$;

-- 2. Permission helpers (kept in the private schema, like the other council helpers).
create or replace function private.asa_council_can_manage_records()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select private.asa_account_is_active((select auth.uid()))
  and (
    exists (select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended)
    or exists (select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active
               and (ca.can_manage_secretariat or ca.docket in ('Executive','Secretariat')))
  );
$$;
create or replace function private.asa_council_can_delete_records()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select private.asa_account_is_active((select auth.uid()))
  and (
    exists (select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended)
    or exists (select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active
               and lower(btrim(ca.role_title))='secretary general')
  );
$$;
create or replace function private.asa_council_can_read_published()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.asa_account_is_active((select auth.uid())); $$;
revoke all on function private.asa_council_can_manage_records(), private.asa_council_can_delete_records(), private.asa_council_can_read_published() from public, anon;
grant execute on function private.asa_council_can_manage_records(), private.asa_council_can_delete_records(), private.asa_council_can_read_published() to authenticated;

-- 3. Table policies: split the old "manage" (ALL) policy so delete can be limited to the SG and administrators.
do $$
declare t text;
begin
  foreach t in array array['council_meetings','council_minutes'] loop
    execute format('drop policy if exists %I on public.%I', case t when 'council_meetings' then 'Secretariat manage meetings' else 'Secretariat manage minutes' end, t);
    execute format('drop policy if exists %I on public.%I', t||'_managers_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_officials_select_published', t);
    execute format('drop policy if exists %I on public.%I', t||'_managers_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_managers_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_sg_admin_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.asa_council_can_manage_records())', t||'_managers_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (published and private.asa_council_can_read_published())', t||'_officials_select_published', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.asa_council_can_manage_records())', t||'_managers_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.asa_council_can_manage_records()) with check (private.asa_council_can_manage_records())', t||'_managers_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.asa_council_can_delete_records())', t||'_sg_admin_delete', t);
  end loop;
end $$;
grant select, insert, update, delete on public.council_meetings, public.council_minutes to authenticated;

-- 4. Private storage bucket. Nothing here is public: files are opened with short-lived signed links.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('council-documents','council-documents',false,20971520,
 array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
       'text/plain','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=20971520, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Council managers read council documents" on storage.objects;
create policy "Council managers read council documents" on storage.objects for select to authenticated
  using (bucket_id='council-documents' and private.asa_council_can_manage_records());
drop policy if exists "Council officials read published council documents" on storage.objects;
create policy "Council officials read published council documents" on storage.objects for select to authenticated
  using (bucket_id='council-documents' and private.asa_council_can_read_published() and (
    exists (select 1 from public.council_meetings m where m.attachment_path=name and m.published)
    or exists (select 1 from public.council_minutes n where n.attachment_path=name and n.published)));
drop policy if exists "Council managers upload council documents" on storage.objects;
create policy "Council managers upload council documents" on storage.objects for insert to authenticated
  with check (bucket_id='council-documents' and private.asa_council_can_manage_records() and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "SG and admin delete council documents" on storage.objects;
create policy "SG and admin delete council documents" on storage.objects for delete to authenticated
  using (bucket_id='council-documents' and (private.asa_council_can_delete_records()
    or (private.asa_council_can_manage_records() and owner_id=(select auth.uid())::text)));
