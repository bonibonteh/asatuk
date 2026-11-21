-- ASA TUK council and merchandise baseline schema.
-- This migration is idempotent so it can document the schema already live in Supabase.
CREATE TABLE IF NOT EXISTS public.council_role_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text NOT NULL DEFAULT '',
 email text NOT NULL DEFAULT '',
 docket text NOT NULL CHECK (docket IN ('Executive','Secretariat','Events','Academic','PR & Communications','Merchandise','Treasury','Organizing')),
 role_title text NOT NULL DEFAULT '',
 can_manage_secretariat boolean NOT NULL DEFAULT false,
 can_manage_events boolean NOT NULL DEFAULT false,
 can_manage_academics boolean NOT NULL DEFAULT false,
 can_manage_pr boolean NOT NULL DEFAULT false,
 can_manage_merchandise boolean NOT NULL DEFAULT false,
 can_manage_finance boolean NOT NULL DEFAULT false,
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,docket)
);
CREATE TABLE IF NOT EXISTS public.council_meetings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 180),
 meeting_type text NOT NULL DEFAULT 'Council meeting' CHECK (char_length(meeting_type)<=80),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz,
 venue text NOT NULL DEFAULT '',
 meeting_link text NOT NULL DEFAULT '',
 agenda text NOT NULL DEFAULT '' CHECK (char_length(agenda)<=10000),
 status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
 created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.council_minutes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 meeting_id uuid REFERENCES public.council_meetings(id) ON DELETE SET NULL,
 title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 180),
 meeting_date date NOT NULL DEFAULT CURRENT_DATE,
 minutes_text text NOT NULL DEFAULT '' CHECK (char_length(minutes_text)<=20000),
 document_url text NOT NULL DEFAULT '',
 attendees text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
 created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.council_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 180),
 description text NOT NULL DEFAULT '' CHECK (char_length(description)<=3000),
 docket text NOT NULL DEFAULT 'Executive' CHECK (docket IN ('Executive','Secretariat','Events','Academic','PR & Communications','Merchandise','Treasury','Organizing')),
 assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 due_date date,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','blocked','completed')),
 created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.merchandise_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 180),
 slug text NOT NULL UNIQUE,
 category text NOT NULL DEFAULT 'General' CHECK (char_length(category)<=80),
 description text NOT NULL DEFAULT '' CHECK (char_length(description)<=4000),
 price_ksh integer NOT NULL CHECK (price_ksh>0),
 stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity>=0),
 image_url text NOT NULL DEFAULT '',
 image_path text NOT NULL DEFAULT '',
 image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
 options jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
 featured boolean NOT NULL DEFAULT false,
 display_order integer NOT NULL DEFAULT 0,
 created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.merchandise_orders (
 id uuid PRIMARY KEY,
 order_number text NOT NULL UNIQUE,
 customer_name text NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 2 AND 120),
 customer_email text NOT NULL CHECK (position('@' in customer_email)>1 AND char_length(customer_email)<=180),
 customer_phone text NOT NULL CHECK (char_length(btrim(customer_phone)) BETWEEN 7 AND 40),
 collection_method text NOT NULL DEFAULT 'collection' CHECK (collection_method IN ('collection','delivery_arranged')),
 customer_note text NOT NULL DEFAULT '' CHECK (char_length(customer_note)<=1000),
 payment_method text NOT NULL DEFAULT 'mpesa' CHECK (payment_method IN ('mpesa','other')),
 payment_reference text NOT NULL DEFAULT '' CHECK (char_length(payment_reference)<=100),
 payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','verified','rejected')),
 order_status text NOT NULL DEFAULT 'new' CHECK (order_status IN ('new','payment_pending','processing','ready','dispatched','completed','cancelled')),
 subtotal_ksh integer NOT NULL CHECK (subtotal_ksh>0),
 total_ksh integer NOT NULL CHECK (total_ksh>0),
 payment_verified_by uuid REFERENCES auth.users(id),
 payment_verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.merchandise_order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.merchandise_orders(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES public.merchandise_products(id),
 product_name text NOT NULL,
 unit_price_ksh integer NOT NULL CHECK (unit_price_ksh>0),
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
 line_total_ksh integer NOT NULL CHECK (line_total_ksh>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.council_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.council_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.council_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.council_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchandise_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchandise_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchandise_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Administrators manage council assignments" ON public.council_role_assignments;
CREATE POLICY "Administrators manage council assignments" ON public.council_role_assignments FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin'))
 WITH CHECK (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin'));
DROP POLICY IF EXISTS "Council members read their own assignments" ON public.council_role_assignments;
CREATE POLICY "Council members read their own assignments" ON public.council_role_assignments FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Secretariat manage meetings" ON public.council_meetings;
CREATE POLICY "Secretariat manage meetings" ON public.council_meetings FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_secretariat OR ca.docket='Executive')))
 WITH CHECK (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_secretariat OR ca.docket='Executive')));
DROP POLICY IF EXISTS "Secretariat manage minutes" ON public.council_minutes;
CREATE POLICY "Secretariat manage minutes" ON public.council_minutes FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_secretariat OR ca.docket='Executive')))
 WITH CHECK (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_secretariat OR ca.docket='Executive')));
DROP POLICY IF EXISTS "Merchandise team manage products" ON public.merchandise_products;
CREATE POLICY "Merchandise team manage products" ON public.merchandise_products FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND ca.can_manage_merchandise))
 WITH CHECK (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND ca.can_manage_merchandise));
DROP POLICY IF EXISTS "Published merchandise is public" ON public.merchandise_products;
CREATE POLICY "Published merchandise is public" ON public.merchandise_products FOR SELECT TO anon,authenticated
 USING (status='published' OR EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND ca.can_manage_merchandise));
DROP POLICY IF EXISTS "Council staff view orders" ON public.merchandise_orders;
CREATE POLICY "Council staff view orders" ON public.merchandise_orders FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_merchandise OR ca.can_manage_finance OR ca.docket IN ('Executive','Secretariat'))));
DROP POLICY IF EXISTS "Council staff update orders" ON public.merchandise_orders;
CREATE POLICY "Council staff update orders" ON public.merchandise_orders FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_merchandise OR ca.can_manage_finance)))
 WITH CHECK (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_merchandise OR ca.can_manage_finance)));
DROP POLICY IF EXISTS "Staff view order items" ON public.merchandise_order_items;
CREATE POLICY "Staff view order items" ON public.merchandise_order_items FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.merchandise_orders o WHERE o.id=merchandise_order_items.order_id)
 AND (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
 OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND (ca.can_manage_merchandise OR ca.can_manage_finance OR ca.docket IN ('Executive','Secretariat')))));
CREATE INDEX IF NOT EXISTS merchandise_order_items_order_id_idx ON public.merchandise_order_items(order_id);
CREATE INDEX IF NOT EXISTS merchandise_order_items_product_id_idx ON public.merchandise_order_items(product_id);
CREATE INDEX IF NOT EXISTS merchandise_orders_payment_verified_by_idx ON public.merchandise_orders(payment_verified_by);
CREATE INDEX IF NOT EXISTS merchandise_products_created_by_idx ON public.merchandise_products(created_by);
CREATE INDEX IF NOT EXISTS council_meetings_created_by_idx ON public.council_meetings(created_by);
CREATE INDEX IF NOT EXISTS council_minutes_created_by_idx ON public.council_minutes(created_by);
CREATE INDEX IF NOT EXISTS council_minutes_meeting_id_idx ON public.council_minutes(meeting_id);
CREATE INDEX IF NOT EXISTS council_tasks_assigned_to_idx ON public.council_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS council_tasks_created_by_idx ON public.council_tasks(created_by);
