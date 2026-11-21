DROP POLICY IF EXISTS "Council staff manage tasks" ON public.council_tasks;
CREATE POLICY "Council staff manage tasks" ON public.council_tasks
FOR ALL TO authenticated
USING (
 EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (
   ca.can_manage_secretariat OR ca.docket='Executive'
   OR (ca.docket='Events' AND public.council_tasks.docket IN ('Events','Organizing') AND ca.can_manage_events)
   OR (ca.docket='Academic' AND public.council_tasks.docket='Academic' AND ca.can_manage_academics)
   OR (ca.docket='PR & Communications' AND public.council_tasks.docket='PR & Communications' AND ca.can_manage_pr)
   OR (ca.docket='Merchandise' AND public.council_tasks.docket='Merchandise' AND ca.can_manage_merchandise)
   OR (ca.docket='Treasury' AND ca.can_manage_finance)
 ))
)
WITH CHECK (
 EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (
   ca.can_manage_secretariat OR ca.docket='Executive'
   OR (ca.docket='Events' AND public.council_tasks.docket IN ('Events','Organizing') AND ca.can_manage_events)
   OR (ca.docket='Academic' AND public.council_tasks.docket='Academic' AND ca.can_manage_academics)
   OR (ca.docket='PR & Communications' AND public.council_tasks.docket='PR & Communications' AND ca.can_manage_pr)
   OR (ca.docket='Merchandise' AND public.council_tasks.docket='Merchandise' AND ca.can_manage_merchandise)
   OR (ca.docket='Treasury' AND ca.can_manage_finance)
 ))
);
