-- Public shop visitors must be able to read published products without
-- needing SELECT permission on the private admin_users table.
-- Keep the public policy intentionally simple; staff access to drafts remains
-- governed by the authenticated-only "Merchandise team manage products" policy.
DROP POLICY IF EXISTS "Published merchandise is public" ON public.merchandise_products;
CREATE POLICY "Published merchandise is public" ON public.merchandise_products
FOR SELECT TO anon, authenticated
USING (status = 'published');

GRANT SELECT ON TABLE public.merchandise_products TO anon, authenticated;
