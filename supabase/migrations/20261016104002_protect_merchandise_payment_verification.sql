CREATE OR REPLACE FUNCTION public.guard_merchandise_payment_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
 IF (
   NEW.payment_status IS DISTINCT FROM OLD.payment_status
   OR NEW.payment_verified_by IS DISTINCT FROM OLD.payment_verified_by
   OR NEW.payment_verified_at IS DISTINCT FROM OLD.payment_verified_at
   OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
 ) AND NOT (
   EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
   OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND ca.can_manage_finance)
 ) THEN
   RAISE EXCEPTION 'Only authorised finance officers can verify or change payment records.';
 END IF;
 RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS guard_merchandise_payment_verification_trigger ON public.merchandise_orders;
CREATE TRIGGER guard_merchandise_payment_verification_trigger
BEFORE UPDATE ON public.merchandise_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_merchandise_payment_verification();
