-- Corrective migration: public-read policies use explicit non-suspended admin checks and do not require anon execution of private authorization helpers.
drop policy if exists "Verified timetables are publicly readable" on public.academic_timetables;
create policy "Verified timetables are publicly readable" on public.academic_timetables for select to anon,authenticated
using(status='verified' or exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended));
drop policy if exists "Published gallery collections are public" on public.gallery_collections;
create policy "Published gallery collections are public" on public.gallery_collections for select to anon,authenticated
using(status='published' or exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended));
drop policy if exists "Images of published collections are public" on public.gallery_images;
create policy "Images of published collections are public" on public.gallery_images for select to anon,authenticated
using(exists(select 1 from public.gallery_collections gc where gc.id=gallery_images.collection_id and (gc.status='published' or exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended))));
drop policy if exists "Public can read published opportunities" on public.opportunities;
create policy "Public can read published opportunities" on public.opportunities for select to anon,authenticated
using(status='published' or exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended));
drop policy if exists "Published projects are public" on public.projects;
create policy "Published projects are public" on public.projects for select to anon,authenticated
using(status='published' or exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended));
