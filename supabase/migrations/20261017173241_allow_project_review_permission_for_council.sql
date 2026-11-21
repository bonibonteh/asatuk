drop policy if exists "Admins review project submissions" on public.project_submissions;
create policy "Admins and authorised council review project submissions" on public.project_submissions for select to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_projects)));
drop policy if exists "Admins update project submissions" on public.project_submissions;
create policy "Admins and authorised council update project submissions" on public.project_submissions for update to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_projects)))
with check(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_projects)));
drop policy if exists "Admins delete project submissions" on public.project_submissions;
create policy "Admins and authorised council delete project submissions" on public.project_submissions for delete to authenticated
using(public.asa_account_is_active((select auth.uid())) and (exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_projects)));
