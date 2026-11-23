-- Merchandise dashboard: discounts, stock history, audit trail, storefront settings, order tracking.
alter table public.merchandise_products
  add column if not exists original_price_ksh integer check (original_price_ksh is null or original_price_ksh>0),
  add column if not exists low_stock_threshold integer not null default 5 check (low_stock_threshold>=0);
alter table public.merchandise_orders add column if not exists payment_note text not null default '' check (char_length(payment_note)<=500);

create or replace function private.merch_can(kind text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.asa_account_is_active((select auth.uid())) and (
  exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin')
  or exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and (
     (kind in ('merch','any') and ca.can_manage_merchandise) or (kind in ('finance','any') and ca.can_manage_finance))));
$$;
grant execute on function private.merch_can(text) to authenticated;

create table if not exists public.merchandise_stock_movements(
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.merchandise_products(id) on delete cascade,
 change_qty integer not null,
 stock_after integer,
 kind text not null check (kind in ('sale','restock','adjustment','cancellation','correction')),
 reason text not null default '' check (char_length(reason)<=300),
 order_id uuid references public.merchandise_orders(id) on delete set null,
 created_by uuid,
 created_at timestamptz not null default now());
create index if not exists merch_mov_product_idx on public.merchandise_stock_movements(product_id,created_at desc);
create table if not exists public.merchandise_audit_log(
 id bigint generated always as identity primary key,
 order_id uuid references public.merchandise_orders(id) on delete cascade,
 action text not null, detail jsonb not null default '{}', actor uuid,
 created_at timestamptz not null default now());
create index if not exists merch_audit_order_idx on public.merchandise_audit_log(order_id,created_at desc);
create table if not exists public.storefront_settings(
 key text primary key check (key in ('banner','promo_message','hidden_categories','announcement','campaign')),
 value jsonb not null default '{}', updated_by uuid, updated_at timestamptz not null default now());

alter table public.merchandise_stock_movements enable row level security;
alter table public.merchandise_audit_log enable row level security;
alter table public.storefront_settings enable row level security;
revoke all on public.merchandise_stock_movements,public.merchandise_audit_log,public.storefront_settings from anon,authenticated;
grant select on public.merchandise_stock_movements,public.merchandise_audit_log to authenticated;
grant select on public.storefront_settings to anon,authenticated;
grant insert,update,delete on public.storefront_settings to authenticated;
create policy "Staff read stock movements" on public.merchandise_stock_movements for select to authenticated using (private.merch_can('any'));
create policy "Staff read merch audit" on public.merchandise_audit_log for select to authenticated using (private.merch_can('any'));
create policy "Storefront settings public" on public.storefront_settings for select to anon,authenticated using (true);
create policy "Storefront settings insert" on public.storefront_settings for insert to authenticated with check (private.merch_can('merch'));
create policy "Storefront settings update" on public.storefront_settings for update to authenticated using (private.merch_can('merch')) with check (private.merch_can('merch'));
create policy "Storefront settings delete" on public.storefront_settings for delete to authenticated using (private.merch_can('merch'));
create or replace function public.adjust_merchandise_stock(p_product uuid,p_delta integer,p_kind text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_new integer;
begin
 if not private.merch_can('merch') then raise exception 'Only merchandise officers can adjust stock.'; end if;
 if p_kind not in ('restock','adjustment','correction') or p_delta=0 or abs(p_delta)>100000 then raise exception 'Invalid stock adjustment.'; end if;
 select stock_quantity+p_delta into v_new from public.merchandise_products where id=p_product for update;
 if not found then raise exception 'Product not found.'; end if;
 if v_new<0 then raise exception 'Stock cannot go below zero.'; end if;
 update public.merchandise_products set stock_quantity=v_new,updated_at=now() where id=p_product;
 insert into public.merchandise_stock_movements(product_id,change_qty,stock_after,kind,reason,created_by) values(p_product,p_delta,v_new,p_kind,left(coalesce(p_reason,''),300),auth.uid());
 return jsonb_build_object('stock',v_new);
end $$;
revoke all on function public.adjust_merchandise_stock(uuid,integer,text,text) from public,anon;
grant execute on function public.adjust_merchandise_stock(uuid,integer,text,text) to authenticated;

create or replace function private.merch_order_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare r record; v_new integer;
begin
 if OLD.order_status='cancelled' and NEW.order_status<>'cancelled' then raise exception 'A cancelled order cannot be reopened; ask the customer to place a new order.'; end if;
 if NEW.order_status is distinct from OLD.order_status then
  insert into public.merchandise_audit_log(order_id,action,detail,actor) values(NEW.id,'order_status',jsonb_build_object('from',OLD.order_status,'to',NEW.order_status),auth.uid());
  if NEW.order_status='cancelled' then
   for r in select product_id,quantity from public.merchandise_order_items where order_id=NEW.id and product_id is not null loop
    update public.merchandise_products set stock_quantity=stock_quantity+r.quantity,updated_at=now() where id=r.product_id returning stock_quantity into v_new;
    if found then insert into public.merchandise_stock_movements(product_id,change_qty,stock_after,kind,reason,order_id,created_by) values(r.product_id,r.quantity,v_new,'cancellation','Order '||NEW.order_number||' cancelled',NEW.id,auth.uid()); end if;
   end loop;
  end if;
 end if;
 if NEW.payment_status is distinct from OLD.payment_status then
  insert into public.merchandise_audit_log(order_id,action,detail,actor) values(NEW.id,'payment_status',jsonb_build_object('from',OLD.payment_status,'to',NEW.payment_status,'reference',NEW.payment_reference,'note',NEW.payment_note),auth.uid());
 end if;
 return NEW;
end $$;
drop trigger if exists merch_order_audit_trigger on public.merchandise_orders;
create trigger merch_order_audit_trigger after update on public.merchandise_orders for each row execute function private.merch_order_audit();

create or replace function public.guard_merchandise_payment_verification() returns trigger language plpgsql set search_path='' as $$
BEGIN
 IF (NEW.payment_status IS DISTINCT FROM OLD.payment_status OR NEW.payment_verified_by IS DISTINCT FROM OLD.payment_verified_by OR NEW.payment_verified_at IS DISTINCT FROM OLD.payment_verified_at OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference OR NEW.payment_note IS DISTINCT FROM OLD.payment_note)
  AND NOT (EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id=(SELECT auth.uid()) AND au.role='admin')
   OR EXISTS(SELECT 1 FROM public.council_role_assignments ca WHERE ca.user_id=(SELECT auth.uid()) AND ca.is_active AND ca.can_manage_finance)) THEN
   RAISE EXCEPTION 'Only authorised finance officers can verify or change payment records.';
 END IF;
 RETURN NEW;
END $$;

create or replace function public.track_merchandise_order(p_order_number text,p_email text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.merchandise_orders%rowtype;
begin
 select * into o from public.merchandise_orders where order_number=btrim(p_order_number) and customer_email=lower(btrim(p_email));
 if not found then return null; end if;
 return jsonb_build_object('order_number',o.order_number,'order_status',o.order_status,'payment_status',o.payment_status,'payment_note',o.payment_note,'total_ksh',o.total_ksh,'created_at',o.created_at,
  'items',coalesce((select jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity,'line_total_ksh',i.line_total_ksh)) from public.merchandise_order_items i where i.order_id=o.id),'[]'::jsonb));
end $$;
revoke all on function public.track_merchandise_order(text,text) from public;
grant execute on function public.track_merchandise_order(text,text) to anon,authenticated;

create or replace function public.place_merchandise_order(p_order_id uuid, p_order_number text, p_customer_name text, p_customer_email text, p_customer_phone text, p_collection_method text, p_customer_note text, p_payment_method text, p_items jsonb, p_payment_reference text DEFAULT ''::text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
DECLARE v_item jsonb; v_product public.merchandise_products%ROWTYPE; v_qty integer; v_subtotal integer:=0; v_line integer; v_count integer:=0;
BEGIN
 IF char_length(btrim(p_customer_name))<2 OR char_length(p_customer_name)>120 OR position('@' in p_customer_email)<=1 OR char_length(p_customer_email)>180 OR char_length(btrim(p_customer_phone))<7 OR char_length(p_customer_phone)>40 OR p_collection_method NOT IN ('collection','delivery_arranged') OR p_payment_method NOT IN ('mpesa','other') OR char_length(coalesce(p_payment_reference,''))>100 OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>30 THEN
   RAISE EXCEPTION 'Please check checkout details and cart.';
 END IF;
 INSERT INTO public.merchandise_orders(id,order_number,customer_name,customer_email,customer_phone,collection_method,customer_note,payment_method,payment_reference,subtotal_ksh,total_ksh)
 VALUES(p_order_id,left(p_order_number,80),btrim(p_customer_name),lower(btrim(p_customer_email)),btrim(p_customer_phone),p_collection_method,left(coalesce(p_customer_note,''),1000),p_payment_method,left(coalesce(p_payment_reference,''),100),1,1);
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  v_qty:=(v_item->>'quantity')::integer;
  IF v_qty<1 OR v_qty>100 THEN RAISE EXCEPTION 'Invalid item quantity.'; END IF;
  SELECT * INTO v_product FROM public.merchandise_products WHERE id=(v_item->>'product_id')::uuid AND status='published' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A product in your cart is no longer available.'; END IF;
  IF v_product.stock_quantity<v_qty THEN RAISE EXCEPTION 'Not enough stock for %.',v_product.name; END IF;
  UPDATE public.merchandise_products SET stock_quantity=stock_quantity-v_qty,updated_at=now() WHERE id=v_product.id;
  INSERT INTO public.merchandise_stock_movements(product_id,change_qty,stock_after,kind,reason,order_id) VALUES(v_product.id,-v_qty,v_product.stock_quantity-v_qty,'sale','Order '||left(p_order_number,80),p_order_id);
  v_line:=v_product.price_ksh*v_qty; v_subtotal:=v_subtotal+v_line;
  INSERT INTO public.merchandise_order_items(order_id,product_id,product_name,unit_price_ksh,quantity,line_total_ksh) VALUES(p_order_id,v_product.id,v_product.name,v_product.price_ksh,v_qty,v_line);
  v_count:=v_count+1;
 END LOOP;
 IF v_count=0 OR v_subtotal<=0 THEN RAISE EXCEPTION 'Your cart is empty.'; END IF;
 UPDATE public.merchandise_orders SET subtotal_ksh=v_subtotal,total_ksh=v_subtotal,order_status='payment_pending' WHERE id=p_order_id;
 RETURN jsonb_build_object('id',p_order_id,'order_number',p_order_number,'total_ksh',v_subtotal);
END $function$;
