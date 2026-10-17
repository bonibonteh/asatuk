alter table public.council_role_assignments
 add column if not exists can_manage_projects boolean not null default false,
 add column if not exists can_manage_gallery boolean not null default false,
 add column if not exists can_manage_membership boolean not null default false,
 add column if not exists can_manage_timetables boolean not null default false,
 add column if not exists can_manage_leadership boolean not null default false;

drop policy if exists "Admins manage projects" on public.projects;
create policy "Admins and authorised council manage projects" on public.projects for all to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_projects)))
with check(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_projects)));

drop policy if exists "Admins manage gallery collections" on public.gallery_collections;
create policy "Admins and authorised council manage gallery collections" on public.gallery_collections for all to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_gallery)))
with check(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_gallery)));

drop policy if exists "Admins manage gallery images" on public.gallery_images;
create policy "Admins and authorised council manage gallery images" on public.gallery_images for all to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_gallery)))
with check(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_gallery)));

drop policy if exists "Admins manage leadership profiles" on public.leadership_profiles;
create policy "Admins and authorised council manage leadership profiles" on public.leadership_profiles for all to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_leadership)))
with check(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_leadership)));

drop policy if exists "Admins manage academic timetables" on public.academic_timetables;
create policy "Admins and authorised council manage academic timetables" on public.academic_timetables for all to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_timetables)))
with check(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_timetables)));

drop policy if exists "Administrators can view membership applications" on public.members;
create policy "Admins and authorised council view membership applications" on public.members for select to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_membership)));
drop policy if exists "Administrators can review membership applications" on public.members;
create policy "Admins and authorised council review membership applications" on public.members for update to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_membership)))
with check(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_membership)));
drop policy if exists "Administrators can remove membership applications" on public.members;
create policy "Admins and authorised council remove membership applications" on public.members for delete to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_membership)));

drop policy if exists "Administrators can view membership applications" on public.membership_applications;
create policy "Admins and authorised council view membership applications" on public.membership_applications for select to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_membership)));
drop policy if exists "Administrators can update membership applications" on public.membership_applications;
create policy "Admins and authorised council update membership applications" on public.membership_applications for update to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_membership)))
with check(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_membership)));
