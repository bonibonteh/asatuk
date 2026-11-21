-- Secretariat docket members can manage council meetings and minutes.
DROP POLICY IF EXISTS "Secretariat manage meetings" ON public.council_meetings;
CREATE POLICY "Secretariat manage meetings" ON public.council_meetings FOR ALL TO authenticated
USING (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_secretariat OR ca.docket IN ('Executive','Secretariat')))
)
WITH CHECK (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_secretariat OR ca.docket IN ('Executive','Secretariat')))
);
DROP POLICY IF EXISTS "Secretariat manage minutes" ON public.council_minutes;
CREATE POLICY "Secretariat manage minutes" ON public.council_minutes FOR ALL TO authenticated
USING (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_secretariat OR ca.docket IN ('Executive','Secretariat')))
)
WITH CHECK (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_secretariat OR ca.docket IN ('Executive','Secretariat')))
);