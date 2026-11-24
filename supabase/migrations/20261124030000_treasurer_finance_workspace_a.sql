-- Treasurer finance workspace, part A: helpers, chapter-aware tables, RLS.
create or replace function private.fin_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select private.asa_account_is_active((select auth.uid())) and exists(select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended) $$;
create or replace function private.fin_can_manage(ch text) returns boolean language sql stable security definer set search_path='' as $$
 select ch in ('Architecture','Urban Planning') and (private.fin_is_admin() or (private.asa_account_is_active((select auth.uid())) and exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_finance and ca.chapter=ch and (lower(btrim(ca.role_title))='treasurer' or ca.docket='Treasury')))) $$;
create or replace function private.fin_can_approve(ch text) returns boolean language sql stable security definer set search_path='' as $$
 select private.fin_can_manage(ch) or (ch in ('Architecture','Urban Planning') and private.asa_account_is_active((select auth.uid())) and exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_finance and ((ca.chapter=ch and ca.docket='Executive') or ca.chapter='Association'))) $$;
create or replace function private.fin_can_view(ch text) returns boolean language sql stable security definer set search_path='' as $$
 select private.fin_can_approve(ch) or (ch in ('Architecture','Urban Planning') and private.asa_account_is_active((select auth.uid())) and exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.chapter=ch and ca.docket='Executive')) $$;
create or replace function private.fin_my_docket(ch text, dk text) returns boolean language sql stable security definer set search_path='' as $$
 select private.asa_account_is_active((select auth.uid())) and exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.chapter=ch and ca.docket=dk) $$;
create or replace function private.fin_is_member(ch text) returns boolean language sql stable security definer set search_path='' as $$
 select private.asa_account_is_active((select auth.uid())) and exists(select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.chapter=ch) $$;
grant execute on function private.fin_is_admin(),private.fin_can_manage(text),private.fin_can_approve(text),private.fin_can_view(text),private.fin_my_docket(text,text),private.fin_is_member(text) to authenticated;

-- existing tables become chapter-aware
alter table public.treasurer_transactions add column if not exists chapter text,add column if not exists docket text,add column if not exists responsible text,add column if not exists reverses_id uuid references public.treasurer_transactions(id),add column if not exists request_id uuid,add column if not exists entry_id uuid;
alter table public.treasurer_budgets add column if not exists chapter text;
alter table public.treasurer_documents add column if not exists chapter text;
alter table public.treasurer_audit_log add column if not exists chapter text;
update public.treasurer_transactions set chapter='Architecture' where chapter is null;
update public.treasurer_budgets set chapter='Architecture' where chapter is null;
update public.treasurer_documents set chapter='Architecture' where chapter is null;
alter table public.treasurer_transactions alter column chapter set not null,add constraint tt_chapter_chk check (chapter in ('Architecture','Urban Planning'));
alter table public.treasurer_budgets alter column chapter set not null,add constraint tb_chapter_chk check (chapter in ('Architecture','Urban Planning'));
alter table public.treasurer_documents alter column chapter set not null,add constraint td_chapter_chk check (chapter in ('Architecture','Urban Planning'));
alter table public.treasurer_transactions drop constraint treasurer_transactions_status_check;
alter table public.treasurer_transactions add constraint treasurer_transactions_status_check check (status in ('pending','verified','rejected','reconciled','reversed'));
create unique index if not exists fin_tx_income_ref_unique on public.treasurer_transactions(chapter,lower(reference)) where reference is not null and reference<>'' and direction='income' and reverses_id is null;
create index if not exists fin_tx_chapter_date on public.treasurer_transactions(chapter,transaction_date desc);

-- Old chapter-blind policies stay but can no longer grant anything (their helpers now return false); chapter-aware policies below replace them.
create or replace function private.asa_treasury_can_view() returns boolean language sql stable set search_path='' as $$ select false $$;
create or replace function private.asa_treasury_can_approve() returns boolean language sql stable set search_path='' as $$ select false $$;
revoke insert,update,delete on public.treasurer_transactions,public.treasurer_audit_log from authenticated;
create policy fin_tx_select on public.treasurer_transactions for select to authenticated using (private.fin_can_view(chapter));
create policy fin_audit_select on public.treasurer_audit_log for select to authenticated using (chapter is not null and private.fin_can_view(chapter));
create policy fin_bud_select on public.treasurer_budgets for select to authenticated using (private.fin_can_view(chapter));
create policy fin_bud_write on public.treasurer_budgets for all to authenticated using (private.fin_can_manage(chapter)) with check (private.fin_can_manage(chapter) and created_by=(select auth.uid()));
create policy fin_doc_select on public.treasurer_documents for select to authenticated using (private.fin_can_view(chapter));
create policy fin_doc_write on public.treasurer_documents for all to authenticated using (private.fin_can_manage(chapter)) with check (private.fin_can_manage(chapter));

-- new tables
create table public.fin_settings(chapter text primary key check (chapter in ('Architecture','Urban Planning')),registration_fee_ksh integer not null default 0 check (registration_fee_ksh>=0),opening_balance_ksh integer not null default 0,low_balance_ksh integer not null default 5000,refund_days integer not null default 14,updated_by uuid,updated_at timestamptz not null default now());
insert into public.fin_settings(chapter) values('Architecture'),('Urban Planning');
create table public.fin_counters(chapter text primary key,last_no integer not null default 0);
create table public.fin_member_dues(id uuid primary key default gen_random_uuid(),chapter text not null check (chapter in ('Architecture','Urban Planning')),member_id uuid not null references public.members(id) on delete cascade,amount_due integer not null default 0 check (amount_due>=0),amount_paid integer not null default 0 check (amount_paid>=0),status text not null default 'unpaid' check (status in ('unpaid','partial','paid')),payment_reference text,payment_method text,verified_by uuid,verified_at timestamptz,notes text not null default '' check (char_length(notes)<=500),created_at timestamptz not null default now(),unique(chapter,member_id));
create table public.fin_requests(id uuid primary key default gen_random_uuid(),ref text not null unique,chapter text not null check (chapter in ('Architecture','Urban Planning')),docket text not null,title text not null check (char_length(title) between 3 and 160),purpose text not null default '',event_name text not null default '',amount_requested integer not null check (amount_requested>0),items jsonb not null default '[]',required_date date,responsible text not null default '',justification text not null default '',status text not null default 'submitted' check (status in ('draft','submitted','under_review','approved','partially_approved','rejected','funds_released','awaiting_accountability','partially_accounted','fully_accounted','closed')),approved_amount integer not null default 0 check (approved_amount>=0),decision_note text not null default '',refund_deadline date,created_by uuid not null,approved_by uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.fin_request_entries(id uuid primary key default gen_random_uuid(),request_id uuid not null references public.fin_requests(id) on delete cascade,chapter text not null,kind text not null check (kind in ('release','expense','refund')),amount integer not null check (amount>0),description text not null default '' check (char_length(description)<=300),reference text not null default '',recorded_by uuid not null,verified_by uuid,verified_at timestamptz,created_at timestamptz not null default now());
create table public.fin_event_budgets(id uuid primary key default gen_random_uuid(),chapter text not null check (chapter in ('Architecture','Urban Planning')),event_name text not null,docket text not null default '',event_date date,venue text not null default '',coordinator text not null default '',expected_attendance integer,objective text not null default '',deadline date,status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','locked')),revision integer not null default 1,approved_total integer,created_by uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.fin_budget_lines(id uuid primary key default gen_random_uuid(),budget_id uuid not null references public.fin_event_budgets(id) on delete cascade,chapter text not null,category text not null default 'General',description text not null default '',quantity numeric not null default 1 check (quantity>=0),unit_cost numeric not null default 0 check (unit_cost>=0),priority text not null default 'medium' check (priority in ('high','medium','low')),notes text not null default '');
create table public.fin_calendar(id uuid primary key default gen_random_uuid(),chapter text not null check (chapter in ('Architecture','Urban Planning')),title text not null,kind text not null default 'other',due_date date not null,done boolean not null default false,created_by uuid not null,created_at timestamptz not null default now());
create table public.fin_tasks(id uuid primary key default gen_random_uuid(),chapter text not null check (chapter in ('Architecture','Urban Planning')),title text not null,detail text not null default '',assignee text not null default '',due_date date,status text not null default 'open' check (status in ('open','resolved')),request_id uuid references public.fin_requests(id) on delete set null,created_by uuid not null,created_at timestamptz not null default now(),resolved_at timestamptz);
create index on public.fin_requests(chapter,status);create index on public.fin_request_entries(request_id);create index on public.fin_member_dues(chapter);create index on public.fin_budget_lines(budget_id);

do $$ declare t text; begin foreach t in array array['fin_settings','fin_counters','fin_member_dues','fin_requests','fin_request_entries','fin_event_budgets','fin_budget_lines','fin_calendar','fin_tasks'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon,authenticated',t); execute format('grant select on public.%I to authenticated',t); end loop; end $$;
grant insert,update,delete on public.fin_event_budgets,public.fin_budget_lines,public.fin_calendar,public.fin_tasks to authenticated;
create policy s_sel on public.fin_settings for select to authenticated using (private.fin_can_view(chapter));
create policy d_sel on public.fin_member_dues for select to authenticated using (private.fin_can_view(chapter));
create policy r_sel on public.fin_requests for select to authenticated using (private.fin_can_view(chapter) or created_by=(select auth.uid()) or private.fin_my_docket(chapter,docket));
create policy e_sel on public.fin_request_entries for select to authenticated using (private.fin_can_view(chapter) or exists(select 1 from public.fin_requests r where r.id=request_id and (r.created_by=(select auth.uid()) or private.fin_my_docket(r.chapter,r.docket))));
create policy b_sel on public.fin_event_budgets for select to authenticated using (private.fin_can_view(chapter));
create policy b_ins on public.fin_event_budgets for insert to authenticated with check (private.fin_can_manage(chapter) and created_by=(select auth.uid()) and status='draft');
create policy b_upd on public.fin_event_budgets for update to authenticated using (private.fin_can_manage(chapter) and status in ('draft','rejected')) with check (private.fin_can_manage(chapter));
create policy b_del on public.fin_event_budgets for delete to authenticated using (private.fin_can_manage(chapter) and status in ('draft','rejected'));
create policy l_sel on public.fin_budget_lines for select to authenticated using (private.fin_can_view(chapter));
create policy l_all on public.fin_budget_lines for all to authenticated using (private.fin_can_manage(chapter) and exists(select 1 from public.fin_event_budgets b where b.id=budget_id and b.status in ('draft','rejected'))) with check (private.fin_can_manage(chapter) and exists(select 1 from public.fin_event_budgets b where b.id=budget_id and b.chapter=fin_budget_lines.chapter and b.status in ('draft','rejected')));
create policy c_sel on public.fin_calendar for select to authenticated using (private.fin_can_view(chapter));
create policy c_all on public.fin_calendar for all to authenticated using (private.fin_can_manage(chapter)) with check (private.fin_can_manage(chapter) and created_by=(select auth.uid()));
create policy t_sel on public.fin_tasks for select to authenticated using (private.fin_can_view(chapter));
create policy t_all on public.fin_tasks for all to authenticated using (private.fin_can_manage(chapter)) with check (private.fin_can_manage(chapter) and created_by=(select auth.uid()));
