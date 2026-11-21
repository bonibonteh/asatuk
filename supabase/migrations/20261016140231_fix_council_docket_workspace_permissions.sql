-- Make each active council docket able to manage its own action workspace.
DROP POLICY IF EXISTS "Council staff manage tasks" ON public.council_tasks;
CREATE POLICY "Council staff manage tasks" ON public.council_tasks FOR ALL TO authenticated
USING (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (
   ca.docket='Executive' OR ca.can_manage_secretariat
   OR (ca.docket IN ('Events','Organizing') AND public.council_tasks.docket IN ('Events','Organizing') AND (ca.can_manage_events OR ca.docket=public.council_tasks.docket))
   OR (ca.docket='Academic' AND public.council_tasks.docket='Academic')
   OR (ca.docket='PR & Communications' AND public.council_tasks.docket='PR & Communications')
   OR (ca.docket='Merchandise' AND public.council_tasks.docket='Merchandise')
   OR (ca.docket='Treasury' AND public.council_tasks.docket='Treasury')
   OR (ca.docket='Secretariat' AND public.council_tasks.docket='Secretariat')
 ))
)
WITH CHECK (
 EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS (SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (
   ca.docket='Executive' OR ca.can_manage_secretariat
   OR (ca.docket IN ('Events','Organizing') AND public.council_tasks.docket IN ('Events','Organizing') AND (ca.can_manage_events OR ca.docket=public.council_tasks.docket))
   OR (ca.docket='Academic' AND public.council_tasks.docket='Academic')
   OR (ca.docket='PR & Communications' AND public.council_tasks.docket='PR & Communications')
   OR (ca.docket='Merchandise' AND public.council_tasks.docket='Merchandise')
   OR (ca.docket='Treasury' AND public.council_tasks.docket='Treasury')
   OR (ca.docket='Secretariat' AND public.council_tasks.docket='Secretariat')
 ))
);