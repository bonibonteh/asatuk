-- Applied to Supabase project oppxkzbebvznohqwglgw on 2026-10-16.
-- Keep the public checkout RPC intentionally callable by anon; it validates input,
-- locks published products, verifies stock, decrements stock atomically, and never
-- accepts a client-supplied price. Payment references are recorded but not verified.
DROP FUNCTION IF EXISTS public.place_merchandise_order(uuid,text,text,text,text,text,text,text,jsonb);

CREATE OR REPLACE FUNCTION public.place_merchandise_order(
 p_order_id uuid,
 p_order_number text,
 p_customer_name text,
 p_customer_email text,
 p_customer_phone text,
 p_collection_method text,
 p_customer_note text,
 p_payment_method text,
 p_items jsonb,
 p_payment_reference text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v_item jsonb;
 v_product public.merchandise_products%ROWTYPE;
 v_qty integer;
 v_subtotal integer:=0;
 v_line integer;
 v_count integer:=0;
BEGIN
 IF char_length(btrim(p_customer_name))<2
 OR char_length(p_customer_name)>120
 OR position('@' in p_customer_email)<=1
 OR char_length(p_customer_email)>180
 OR char_length(btrim(p_customer_phone))<7
 OR char_length(p_customer_phone)>40
 OR p_collection_method NOT IN ('collection','delivery_arranged')
 OR p_payment_method NOT IN ('mpesa','other')
 OR char_length(coalesce(p_payment_reference,''))>100
 OR jsonb_typeof(p_items)<>'array'
 OR jsonb_array_length(p_items)<1
 OR jsonb_array_length(p_items)>30 THEN
   RAISE EXCEPTION 'Please check checkout details and cart.';
 END IF;
 INSERT INTO public.merchandise_orders(
  id,order_number,customer_name,customer_email,customer_phone,
  collection_method,customer_note,payment_method,payment_reference,
  subtotal_ksh,total_ksh
 ) VALUES(
  p_order_id,left(p_order_number,80),btrim(p_customer_name),lower(btrim(p_customer_email)),
  btrim(p_customer_phone),p_collection_method,left(coalesce(p_customer_note,''),1000),
  p_payment_method,left(coalesce(p_payment_reference,''),100),1,1
 );
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  v_qty:=(v_item->>'quantity')::integer;
  IF v_qty<1 OR v_qty>100 THEN RAISE EXCEPTION 'Invalid item quantity.'; END IF;
  SELECT * INTO v_product FROM public.merchandise_products
   WHERE id=(v_item->>'product_id')::uuid AND status='published' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A product in your cart is no longer available.'; END IF;
  IF v_product.stock_quantity<v_qty THEN RAISE EXCEPTION 'Not enough stock for %.',v_product.name; END IF;
  UPDATE public.merchandise_products SET stock_quantity=stock_quantity-v_qty,updated_at=now() WHERE id=v_product.id;
  v_line:=v_product.price_ksh*v_qty;
  v_subtotal:=v_subtotal+v_line;
  INSERT INTO public.merchandise_order_items(order_id,product_id,product_name,unit_price_ksh,quantity,line_total_ksh)
   VALUES(p_order_id,v_product.id,v_product.name,v_product.price_ksh,v_qty,v_line);
  v_count:=v_count+1;
 END LOOP;
 IF v_count=0 OR v_subtotal<=0 THEN RAISE EXCEPTION 'Your cart is empty.'; END IF;
 UPDATE public.merchandise_orders SET subtotal_ksh=v_subtotal,total_ksh=v_subtotal,order_status='payment_pending' WHERE id=p_order_id;
 RETURN jsonb_build_object('id',p_order_id,'order_number',p_order_number,'total_ksh',v_subtotal);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.place_merchandise_order(uuid,text,text,text,text,text,text,text,jsonb,text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.place_merchandise_order(uuid,text,text,text,text,text,text,text,jsonb,text) TO anon;

CREATE INDEX IF NOT EXISTS merchandise_order_items_order_id_idx ON public.merchandise_order_items(order_id);
CREATE INDEX IF NOT EXISTS merchandise_order_items_product_id_idx ON public.merchandise_order_items(product_id);
CREATE INDEX IF NOT EXISTS merchandise_orders_payment_verified_by_idx ON public.merchandise_orders(payment_verified_by);
CREATE INDEX IF NOT EXISTS merchandise_products_created_by_idx ON public.merchandise_products(created_by);
CREATE INDEX IF NOT EXISTS council_meetings_created_by_idx ON public.council_meetings(created_by);
CREATE INDEX IF NOT EXISTS council_minutes_created_by_idx ON public.council_minutes(created_by);
CREATE INDEX IF NOT EXISTS council_minutes_meeting_id_idx ON public.council_minutes(meeting_id);
CREATE INDEX IF NOT EXISTS council_tasks_assigned_to_idx ON public.council_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS council_tasks_created_by_idx ON public.council_tasks(created_by);
