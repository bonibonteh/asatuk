-- Events and Organizing can manage events.
DROP POLICY IF EXISTS "Council docket manage events" ON public.events;
CREATE POLICY "Council docket manage events" ON public.events FOR ALL TO authenticated
USING (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.docket IN ('Events','Organizing') OR ca.can_manage_events))
)
WITH CHECK (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.docket IN ('Events','Organizing') OR ca.can_manage_events))
);
-- Academic docket manages learning resources. Timetable verification remains admin-only.
DROP POLICY IF EXISTS "Academic docket manage learning resources" ON public.learning_resources;
CREATE POLICY "Academic docket manage learning resources" ON public.learning_resources FOR ALL TO authenticated
USING (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.docket='Academic' OR ca.can_manage_academics))
)
WITH CHECK (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.docket='Academic' OR ca.can_manage_academics))
);
-- PR & Communications manages announcements and opportunities.
DROP POLICY IF EXISTS "PR docket manage announcements" ON public.announcements;
CREATE POLICY "PR docket manage announcements" ON public.announcements FOR ALL TO authenticated
USING (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.docket='PR & Communications' OR ca.can_manage_pr))
)
WITH CHECK (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.docket='PR & Communications' OR ca.can_manage_pr))
);
DROP POLICY IF EXISTS "PR docket manage opportunities" ON public.opportunities;
CREATE POLICY "PR docket manage opportunities" ON public.opportunities FOR ALL TO authenticated
USING (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.docket='PR & Communications' OR ca.can_manage_pr))
)
WITH CHECK (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.docket='PR & Communications' OR ca.can_manage_pr))
);