create table if not exists public.council_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  welcome_message text not null default '',
  personal_reminder text not null default '',
  avatar_path text,
  updated_at timestamptz not null default now(),
  constraint council_user_preferences_welcome_message_length check (char_length(welcome_message) <= 240),
  constraint council_user_preferences_personal_reminder_length check (char_length(personal_reminder) <= 300)
);
alter table public.council_user_preferences enable row level security;
revoke all on table public.council_user_preferences from anon;
grant select, insert, update on table public.council_user_preferences to authenticated;
drop policy if exists "Council members read own preferences" on public.council_user_preferences;
create policy "Council members read own preferences" on public.council_user_preferences for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Council members create own preferences" on public.council_user_preferences;
create policy "Council members create own preferences" on public.council_user_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Council members update own preferences" on public.council_user_preferences;
create policy "Council members update own preferences" on public.council_user_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('council-profile-photos', 'council-profile-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Members read own council profile photo" on storage.objects;
create policy "Members read own council profile photo" on storage.objects for select to authenticated using (bucket_id = 'council-profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Members upload own council profile photo" on storage.objects;
create policy "Members upload own council profile photo" on storage.objects for insert to authenticated with check (bucket_id = 'council-profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Members update own council profile photo" on storage.objects;
create policy "Members update own council profile photo" on storage.objects for update to authenticated using (bucket_id = 'council-profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'council-profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Members delete own council profile photo" on storage.objects;
create policy "Members delete own council profile photo" on storage.objects for delete to authenticated using (bucket_id = 'council-profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
