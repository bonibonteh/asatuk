-- Treasurer finance workspace, part B: server-side financial operations (chapter-validated, audited).
create or replace function private.fin_log(ch text,act text,ttype text,tid uuid,det jsonb) returns void language sql security definer set search_path='' as $$
 insert into public.treasurer_audit_log(actor_user_id,action,target_type,target_id,details,chapter) values((select auth.uid()),act,ttype,tid,coalesce(det,'{}'),ch) $$;

create or replace function public.fin_record_transaction(p_chapter text,p_date date,p_direction text,p_category text,p_description text,p_amount numeric,p_method text,p_reference text,p_docket text default '',p_responsible text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 if not private.fin_can_manage(p_chapter) then raise exception 'You are not the Treasurer for this chapter.'; end if;
 if p_direction not in ('income','expense') or p_amount<=0 or btrim(coalesce(p_category,''))='' then raise exception 'Check the transaction details.'; end if;
 insert into public.treasurer_transactions(chapter,transaction_date,direction,category,description,amount_kes,payment_method,reference,docket,responsible,status,created_by)
  values(p_chapter,coalesce(p_date,current_date),p_direction,btrim(p_category),left(coalesce(p_description,''),300),p_amount,left(coalesce(p_method,''),40),nullif(btrim(coalesce(p_reference,'')),''),nullif(p_docket,''),nullif(p_responsible,''),'pending',auth.uid()) returning id into v;
 perform private.fin_log(p_chapter,'transaction_recorded','transaction',v,jsonb_build_object('direction',p_direction,'amount',p_amount,'category',p_category));
 return v;
end $$;

create or replace function public.fin_verify_transaction(p_id uuid,p_reject boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare t public.treasurer_transactions%rowtype;
begin
 select * into t from public.treasurer_transactions where id=p_id for update;
 if not found or not private.fin_can_manage(t.chapter) then raise exception 'Transaction not found or not permitted.'; end if;
 if t.status<>'pending' then raise exception 'Only pending transactions can be verified or rejected.'; end if;
 update public.treasurer_transactions set status=case when p_reject then 'rejected' else 'verified' end,verified_by=auth.uid(),verified_at=now(),updated_at=now() where id=p_id;
 perform private.fin_log(t.chapter,case when p_reject then 'transaction_rejected' else 'transaction_verified' end,'transaction',p_id,jsonb_build_object('amount',t.amount_kes));
end $$;

create or replace function public.fin_reverse_transaction(p_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.treasurer_transactions%rowtype; v uuid;
begin
 select * into t from public.treasurer_transactions where id=p_id for update;
 if not found or not private.fin_can_manage(t.chapter) then raise exception 'Transaction not found or not permitted.'; end if;
 if t.status not in ('verified','reconciled') or t.reverses_id is not null then raise exception 'Only a verified original transaction can be reversed.'; end if;
 if btrim(coalesce(p_reason,''))='' then raise exception 'Give a reason for the reversal.'; end if;
 update public.treasurer_transactions set status='reversed',updated_at=now() where id=p_id;
 insert into public.treasurer_transactions(chapter,transaction_date,direction,category,description,amount_kes,payment_method,reference,status,created_by,verified_by,verified_at,reverses_id,docket,responsible,request_id)
  values(t.chapter,current_date,case when t.direction='income' then 'expense' else 'income' end,t.category,'Reversal: '||left(p_reason,200),t.amount_kes,t.payment_method,null,'verified',auth.uid(),auth.uid(),now(),t.id,t.docket,t.responsible,t.request_id) returning id into v;
 perform private.fin_log(t.chapter,'transaction_reversed','transaction',p_id,jsonb_build_object('reason',p_reason,'reversal',v));
 return v;
end $$;

create or replace function public.fin_set_settings(p_chapter text,p_fee integer,p_opening integer,p_low integer,p_refund_days integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.fin_can_manage(p_chapter) then raise exception 'Not permitted.'; end if;
 if p_fee<0 or p_low<0 or p_refund_days<1 or p_refund_days>365 then raise exception 'Invalid settings.'; end if;
 update public.fin_settings set registration_fee_ksh=p_fee,opening_balance_ksh=p_opening,low_balance_ksh=p_low,refund_days=p_refund_days,updated_by=auth.uid(),updated_at=now() where chapter=p_chapter;
 perform private.fin_log(p_chapter,'settings_changed','settings',null,jsonb_build_object('fee',p_fee,'opening',p_opening));
end $$;

-- membership
create or replace function private.fin_member_chapter(prog text) returns text language sql immutable set search_path='' as $$
 select case when lower(coalesce(prog,'')) like '%urban%' or lower(coalesce(prog,'')) like '%planning%' then 'Urban Planning' else 'Architecture' end $$;
grant execute on function private.fin_member_chapter(text) to authenticated;

create or replace function public.fin_sync_dues(p_chapter text) returns integer language plpgsql security definer set search_path='' as $$
declare n integer; fee integer;
begin
 if not private.fin_can_manage(p_chapter) then raise exception 'Not permitted.'; end if;
 select registration_fee_ksh into fee from public.fin_settings where chapter=p_chapter;
 insert into public.fin_member_dues(chapter,member_id,amount_due) select p_chapter,m.id,fee from public.members m where m.status='approved' and private.fin_member_chapter(m.programme)=p_chapter on conflict (chapter,member_id) do nothing;
 get diagnostics n=row_count;
 update public.fin_member_dues set amount_due=fee where chapter=p_chapter and amount_paid=0 and amount_due<>fee;
 return n;
end $$;

create or replace function public.fin_member_roster(p_chapter text) returns table(dues_id uuid,member_id uuid,full_name text,email text,phone text,reg_no text,year text,registered_at timestamptz,member_status text,amount_due integer,amount_paid integer,status text,payment_reference text,verified_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.fin_can_view(p_chapter) then raise exception 'Not permitted.'; end if;
 return query select d.id,m.id,m.full_name,m.email,m.phone,m.reg_no,m.year::text,m.submitted_at,m.status,d.amount_due,d.amount_paid,d.status,d.payment_reference,d.verified_at from public.members m left join public.fin_member_dues d on d.member_id=m.id and d.chapter=p_chapter where private.fin_member_chapter(m.programme)=p_chapter order by m.full_name;
end $$;

create or replace function public.fin_confirm_dues(p_dues uuid,p_amount integer,p_reference text,p_method text) returns void language plpgsql security definer set search_path='' as $$
declare d public.fin_member_dues%rowtype; tx uuid; nm text; paid integer;
begin
 select * into d from public.fin_member_dues where id=p_dues for update;
 if not found or not private.fin_can_manage(d.chapter) then raise exception 'Not found or not permitted.'; end if;
 if p_amount<=0 or btrim(coalesce(p_reference,''))='' then raise exception 'Enter the amount and the payment reference.'; end if;
 if d.amount_paid+p_amount>d.amount_due then raise exception 'That would exceed the amount due (KSh %).',d.amount_due; end if;
 select full_name into nm from public.members where id=d.member_id;
 begin
  insert into public.treasurer_transactions(chapter,transaction_date,direction,category,description,amount_kes,payment_method,reference,status,created_by,verified_by,verified_at)
   values(d.chapter,current_date,'income','Membership registration','Registration payment: '||coalesce(nm,'member'),p_amount,left(coalesce(p_method,'M-Pesa'),40),btrim(p_reference),'verified',auth.uid(),auth.uid(),now()) returning id into tx;
 exception when unique_violation then raise exception 'That payment reference has already been recorded for this chapter.'; end;
 paid:=d.amount_paid+p_amount;
 update public.fin_member_dues set amount_paid=paid,status=case when paid>=amount_due and amount_due>0 then 'paid' else 'partial' end,payment_reference=btrim(p_reference),payment_method=p_method,verified_by=auth.uid(),verified_at=now() where id=p_dues;
 perform private.fin_log(d.chapter,'dues_confirmed','member_dues',p_dues,jsonb_build_object('amount',p_amount,'reference',p_reference,'tx',tx));
end $$;

create or replace function public.fin_mark_dues_unpaid(p_dues uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare d public.fin_member_dues%rowtype;
begin
 select * into d from public.fin_member_dues where id=p_dues for update;
 if not found or not private.fin_can_manage(d.chapter) then raise exception 'Not found or not permitted.'; end if;
 if d.amount_paid>0 then raise exception 'Payments already confirmed must be reversed in the ledger first.'; end if;
 update public.fin_member_dues set status='unpaid',notes=left(coalesce(p_reason,''),500) where id=p_dues;
 perform private.fin_log(d.chapter,'dues_marked_unpaid','member_dues',p_dues,jsonb_build_object('reason',p_reason));
end $$;

-- docket requests
create or replace function public.fin_submit_request(p_chapter text,p_docket text,p_title text,p_purpose text,p_event text,p_amount integer,p_items jsonb,p_required date,p_responsible text,p_justification text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n integer; v_ref text; v uuid;
begin
 if p_chapter not in ('Architecture','Urban Planning') then raise exception 'Choose a chapter.'; end if;
 if not (private.fin_can_manage(p_chapter) or private.fin_my_docket(p_chapter,p_docket)) then raise exception 'You can only submit requests for your own docket and chapter.'; end if;
 if p_amount<=0 or char_length(btrim(coalesce(p_title,'')))<3 then raise exception 'Enter a title and a positive amount.'; end if;
 insert into public.fin_counters(chapter,last_no) values(p_chapter,1) on conflict (chapter) do update set last_no=public.fin_counters.last_no+1 returning last_no into n;
 v_ref:='FIN/'||case p_chapter when 'Architecture' then 'ARC' else 'URP' end||'/'||to_char(now(),'YYYY')||'/'||lpad(n::text,4,'0');
 insert into public.fin_requests(ref,chapter,docket,title,purpose,event_name,amount_requested,items,required_date,responsible,justification,status,created_by)
  values(v_ref,p_chapter,p_docket,btrim(p_title),left(coalesce(p_purpose,''),1000),left(coalesce(p_event,''),160),p_amount,coalesce(p_items,'[]'),p_required,left(coalesce(p_responsible,''),120),left(coalesce(p_justification,''),2000),'submitted',auth.uid()) returning id into v;
 perform private.fin_log(p_chapter,'request_submitted','request',v,jsonb_build_object('ref',v_ref,'amount',p_amount,'docket',p_docket));
 return jsonb_build_object('id',v,'ref',v_ref);
end $$;

create or replace function public.fin_review_request(p_id uuid,p_action text,p_amount integer default 0,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare r public.fin_requests%rowtype;
begin
 select * into r from public.fin_requests where id=p_id for update;
 if not found then raise exception 'Request not found.'; end if;
 if p_action='under_review' then
  if not private.fin_can_manage(r.chapter) then raise exception 'Only the chapter Treasurer can start a review.'; end if;
  if r.status<>'submitted' then raise exception 'Only submitted requests can be reviewed.'; end if;
  update public.fin_requests set status='under_review',updated_at=now() where id=p_id;
 elsif p_action in ('approve','partial','reject') then
  if not private.fin_can_approve(r.chapter) then raise exception 'You are not authorised to approve requests for this chapter.'; end if;
  if r.status not in ('submitted','under_review') then raise exception 'This request has already been decided.'; end if;
  if p_action='reject' then
   if btrim(coalesce(p_note,''))='' then raise exception 'Give a reason for rejection.'; end if;
   update public.fin_requests set status='rejected',approved_amount=0,decision_note=left(p_note,500),approved_by=auth.uid(),updated_at=now() where id=p_id;
  else
   if p_action='approve' then p_amount:=r.amount_requested; end if;
   if p_amount<=0 or p_amount>r.amount_requested then raise exception 'Approved amount must be between 1 and the requested amount.'; end if;
   update public.fin_requests set status=case when p_amount=r.amount_requested then 'approved' else 'partially_approved' end,approved_amount=p_amount,decision_note=left(coalesce(p_note,''),500),approved_by=auth.uid(),updated_at=now() where id=p_id;
  end if;
 else raise exception 'Unknown action.'; end if;
 perform private.fin_log(r.chapter,'request_'||p_action,'request',p_id,jsonb_build_object('ref',r.ref,'amount',p_amount,'note',p_note));
end $$;

create or replace function private.fin_recalc(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.fin_requests%rowtype; rel integer; acc integer;
begin
 select * into r from public.fin_requests where id=p_id;
 if r.status in ('draft','submitted','under_review','rejected','closed') then return; end if;
 select coalesce(sum(amount) filter (where kind='release'),0), coalesce(sum(amount) filter (where kind in ('expense','refund') and verified_at is not null),0) into rel,acc from public.fin_request_entries where request_id=p_id;
 update public.fin_requests set status=case when rel=0 then case when approved_amount=amount_requested then 'approved' else 'partially_approved' end when acc=0 then 'funds_released' when acc>=rel then 'fully_accounted' else 'partially_accounted' end,
  refund_deadline=coalesce(refund_deadline,case when rel>0 then current_date+(select refund_days from public.fin_settings where chapter=r.chapter) end),updated_at=now() where id=p_id;
end $$;

create or replace function public.fin_record_entry(p_request uuid,p_kind text,p_amount integer,p_description text,p_reference text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.fin_requests%rowtype; v uuid; rel integer; spent integer; tx uuid;
begin
 select * into r from public.fin_requests where id=p_request for update;
 if not found then raise exception 'Request not found.'; end if;
 if p_amount<=0 then raise exception 'Enter a positive amount.'; end if;
 select coalesce(sum(amount) filter (where kind='release'),0),coalesce(sum(amount) filter (where kind='expense'),0) into rel,spent from public.fin_request_entries where request_id=p_request;
 if p_kind='release' then
  if not private.fin_can_manage(r.chapter) then raise exception 'Only the chapter Treasurer can release funds.'; end if;
  if r.status not in ('approved','partially_approved','funds_released','partially_accounted','awaiting_accountability') then raise exception 'Funds can only be released on an approved request.'; end if;
  if rel+p_amount>r.approved_amount then raise exception 'That would release more than the approved amount (KSh %).',r.approved_amount; end if;
 elsif p_kind='expense' then
  if not (private.fin_can_manage(r.chapter) or r.created_by=auth.uid() or private.fin_my_docket(r.chapter,r.docket)) then raise exception 'Not permitted.'; end if;
  if rel=0 then raise exception 'No funds have been released yet.'; end if;
  if spent+p_amount>rel then raise exception 'Expenditure would exceed the funds released (KSh %). Request extra funding instead.',rel; end if;
 elsif p_kind='refund' then
  if not (private.fin_can_manage(r.chapter) or r.created_by=auth.uid() or private.fin_my_docket(r.chapter,r.docket)) then raise exception 'Not permitted.'; end if;
  if rel=0 then raise exception 'No funds have been released yet.'; end if;
  if (select coalesce(sum(amount),0) from public.fin_request_entries where request_id=p_request and kind='refund')+p_amount>rel-spent then raise exception 'Refund is more than the unspent balance.'; end if;
 else raise exception 'Unknown entry type.'; end if;
 insert into public.fin_request_entries(request_id,chapter,kind,amount,description,reference,recorded_by) values(p_request,r.chapter,p_kind,p_amount,left(coalesce(p_description,''),300),left(coalesce(p_reference,''),100),auth.uid()) returning id into v;
 if p_kind='release' then
  insert into public.treasurer_transactions(chapter,transaction_date,direction,category,description,amount_kes,payment_method,reference,status,created_by,verified_by,verified_at,docket,request_id,entry_id)
   values(r.chapter,current_date,'expense','Docket allocation','Funds released: '||r.ref||' '||r.title,p_amount,'Disbursement',nullif(p_reference,''),'verified',auth.uid(),auth.uid(),now(),r.docket,r.id,v) returning id into tx;
  update public.fin_request_entries set verified_by=auth.uid(),verified_at=now() where id=v;
 end if;
 perform private.fin_recalc(p_request);
 perform private.fin_log(r.chapter,'entry_'||p_kind,'request',p_request,jsonb_build_object('ref',r.ref,'amount',p_amount,'entry',v));
 return v;
end $$;

create or replace function public.fin_verify_entry(p_entry uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.fin_request_entries%rowtype; r public.fin_requests%rowtype;
begin
 select * into e from public.fin_request_entries where id=p_entry for update;
 if not found or not private.fin_can_manage(e.chapter) then raise exception 'Not found or not permitted.'; end if;
 if e.verified_at is not null then raise exception 'Already verified.'; end if;
 select * into r from public.fin_requests where id=e.request_id;
 update public.fin_request_entries set verified_by=auth.uid(),verified_at=now() where id=p_entry;
 if e.kind='refund' then
  insert into public.treasurer_transactions(chapter,transaction_date,direction,category,description,amount_kes,payment_method,reference,status,created_by,verified_by,verified_at,docket,request_id,entry_id)
   values(e.chapter,current_date,'income','Docket refund','Refund received: '||r.ref||' '||r.title,e.amount,'Refund',nullif(e.reference,''),'verified',auth.uid(),auth.uid(),now(),r.docket,r.id,e.id);
 end if;
 perform private.fin_recalc(e.request_id);
 perform private.fin_log(e.chapter,'entry_verified','request',e.request_id,jsonb_build_object('kind',e.kind,'amount',e.amount));
end $$;

create or replace function public.fin_close_request(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.fin_requests%rowtype;
begin
 select * into r from public.fin_requests where id=p_id for update;
 if not found or not private.fin_can_manage(r.chapter) then raise exception 'Not found or not permitted.'; end if;
 if r.status<>'fully_accounted' then raise exception 'A request can only be closed once it is fully accounted for.'; end if;
 update public.fin_requests set status='closed',updated_at=now() where id=p_id;
 perform private.fin_log(r.chapter,'request_closed','request',p_id,jsonb_build_object('ref',r.ref));
end $$;

create or replace function public.fin_budget_decision(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare b public.fin_event_budgets%rowtype; tot numeric;
begin
 select * into b from public.fin_event_budgets where id=p_id for update;
 if not found then raise exception 'Budget not found.'; end if;
 select coalesce(sum(quantity*unit_cost),0) into tot from public.fin_budget_lines where budget_id=p_id;
 if p_action='submit' then
  if not private.fin_can_manage(b.chapter) or b.status not in ('draft','rejected') then raise exception 'Not permitted.'; end if;
  if tot<=0 then raise exception 'Add budget lines first.'; end if;
  update public.fin_event_budgets set status='submitted',updated_at=now() where id=p_id;
 elsif p_action in ('approve','reject') then
  if not private.fin_can_approve(b.chapter) or b.status<>'submitted' then raise exception 'Not permitted.'; end if;
  update public.fin_event_budgets set status=case when p_action='approve' then 'approved' else 'rejected' end,approved_total=case when p_action='approve' then tot::integer end,updated_at=now() where id=p_id;
 elsif p_action='lock' then
  if not private.fin_can_manage(b.chapter) or b.status<>'approved' then raise exception 'Only approved budgets can be locked.'; end if;
  update public.fin_event_budgets set status='locked',updated_at=now() where id=p_id;
 elsif p_action='revise' then
  if not private.fin_can_manage(b.chapter) or b.status not in ('approved','locked','rejected') then raise exception 'Not permitted.'; end if;
  update public.fin_event_budgets set status='draft',revision=revision+1,updated_at=now() where id=p_id;
 else raise exception 'Unknown action.'; end if;
 perform private.fin_log(b.chapter,'budget_'||p_action,'budget',p_id,jsonb_build_object('event',b.event_name,'total',tot,'revision',b.revision));
end $$;

do $$ declare f text; begin foreach f in array array['fin_record_transaction(text,date,text,text,text,numeric,text,text,text,text)','fin_verify_transaction(uuid,boolean)','fin_reverse_transaction(uuid,text)','fin_set_settings(text,integer,integer,integer,integer)','fin_sync_dues(text)','fin_member_roster(text)','fin_confirm_dues(uuid,integer,text,text)','fin_mark_dues_unpaid(uuid,text)','fin_submit_request(text,text,text,text,text,integer,jsonb,date,text,text)','fin_review_request(uuid,text,integer,text)','fin_record_entry(uuid,text,integer,text,text)','fin_verify_entry(uuid)','fin_close_request(uuid)','fin_budget_decision(uuid,text)'] loop
 execute format('revoke all on function public.%s from public,anon',f); execute format('grant execute on function public.%s to authenticated',f); end loop; end $$;
grant execute on function private.fin_member_chapter(text) to authenticated;
