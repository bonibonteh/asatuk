-- ASA TUK Treasurer Workspace: private finance records and documents
create table if not exists public.treasurer_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 180),
  category text not null default 'Other Financial Records',
  financial_period text not null default '',
  description text not null default '',
  tags text[] not null default '{}',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null check (file_size >= 0),
  version_group uuid not null default gen_random_uuid(),
  version_number integer not null default 1 check (version_number >= 1),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists treasurer_documents_created_at_idx on public.treasurer_documents(created_at desc);
create index if not exists treasurer_documents_category_idx on public.treasurer_documents(category);

create table if not exists public.treasurer_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null default current_date,
  direction text not null check (direction in ('income','expense')),
  category text not null,
  description text not null,
  amount_kes numeric(14,2) not null check (amount_kes > 0),
  payment_method text not null default 'M-Pesa',
  reference text,
  status text not null default 'pending' check (status in ('pending','verified','rejected','reconciled')),
  receipt_document_id uuid references public.treasurer_documents(id) on delete set null,
  created_by uuid not null references auth.users(id),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists treasurer_transactions_date_idx on public.treasurer_transactions(transaction_date desc);
create index if not exists treasurer_transactions_status_idx on public.treasurer_transactions(status);

create table if not exists public.treasurer_budgets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 180),
  category text not null default 'General',
  financial_period text not null default '',
  approved_amount_kes numeric(14,2) not null check (approved_amount_kes >= 0),
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists treasurer_budgets_period_idx on public.treasurer_budgets(financial_period);

create table if not exists public.treasurer_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists treasurer_audit_log_created_idx on public.treasurer_audit_log(created_at desc);

alter table public.treasurer_documents enable row level security;
alter table public.treasurer_transactions enable row level security;
alter table public.treasurer_budgets enable row level security;
alter table public.treasurer_audit_log enable row level security;

create or replace function private.asa_treasury_can_view()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select private.asa_account_is_active((select auth.uid()))
  and (
    exists (select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended)
    or exists (select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_finance)
  );
$$;

create or replace function private.asa_treasury_can_approve()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select private.asa_account_is_active((select auth.uid()))
  and (
    exists (select 1 from public.admin_users au where au.user_id=(select auth.uid()) and au.role='admin' and not au.is_suspended)
    or exists (select 1 from public.council_role_assignments ca where ca.user_id=(select auth.uid()) and ca.is_active and ca.can_manage_finance and (lower(ca.role_title) like '%treasurer%' or ca.docket='Executive'))
  );
$$;

drop policy if exists "Treasury staff read finance documents" on public.treasurer_documents;
create policy "Treasury staff read finance documents" on public.treasurer_documents for select to authenticated using (private.asa_treasury_can_view());
drop policy if exists "Treasury staff upload finance documents" on public.treasurer_documents;
create policy "Treasury staff upload finance documents" on public.treasurer_documents for insert to authenticated with check (private.asa_treasury_can_view() and uploaded_by=(select auth.uid()));
drop policy if exists "Treasury staff update finance document metadata" on public.treasurer_documents;
create policy "Treasury staff update finance document metadata" on public.treasurer_documents for update to authenticated using (private.asa_treasury_can_view()) with check (private.asa_treasury_can_view());
drop policy if exists "Treasury staff delete finance documents" on public.treasurer_documents;
create policy "Treasury staff delete finance documents" on public.treasurer_documents for delete to authenticated using (private.asa_treasury_can_view());

drop policy if exists "Treasury staff read transactions" on public.treasurer_transactions;
create policy "Treasury staff read transactions" on public.treasurer_transactions for select to authenticated using (private.asa_treasury_can_view());
drop policy if exists "Treasury staff create transactions" on public.treasurer_transactions;
create policy "Treasury staff create transactions" on public.treasurer_transactions for insert to authenticated with check (private.asa_treasury_can_view() and created_by=(select auth.uid()) and status='pending' and verified_by is null and verified_at is null);
drop policy if exists "Treasurer or admin update transactions" on public.treasurer_transactions;
create policy "Treasurer or admin update transactions" on public.treasurer_transactions for update to authenticated using (private.asa_treasury_can_approve()) with check (private.asa_treasury_can_approve());

drop policy if exists "Treasury staff read budgets" on public.treasurer_budgets;
create policy "Treasury staff read budgets" on public.treasurer_budgets for select to authenticated using (private.asa_treasury_can_view());
drop policy if exists "Treasury staff create budgets" on public.treasurer_budgets;
create policy "Treasury staff create budgets" on public.treasurer_budgets for insert to authenticated with check (private.asa_treasury_can_view() and created_by=(select auth.uid()));
drop policy if exists "Treasury staff update budgets" on public.treasurer_budgets;
create policy "Treasury staff update budgets" on public.treasurer_budgets for update to authenticated using (private.asa_treasury_can_view()) with check (private.asa_treasury_can_view());
drop policy if exists "Treasury staff delete budgets" on public.treasurer_budgets;
create policy "Treasury staff delete budgets" on public.treasurer_budgets for delete to authenticated using (private.asa_treasury_can_approve());

drop policy if exists "Treasury staff read audit log" on public.treasurer_audit_log;
create policy "Treasury staff read audit log" on public.treasurer_audit_log for select to authenticated using (private.asa_treasury_can_view());
drop policy if exists "Treasury staff append audit log" on public.treasurer_audit_log;
create policy "Treasury staff append audit log" on public.treasurer_audit_log for insert to authenticated with check (private.asa_treasury_can_view() and actor_user_id=(select auth.uid()));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('treasurer-finance','treasurer-finance',false,31457280,
 array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/csv','application/pdf','image/jpeg','image/png','image/webp','application/zip','application/x-zip-compressed'])
on conflict (id) do update set public=false,file_size_limit=31457280,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Treasury staff read private finance files" on storage.objects;
create policy "Treasury staff read private finance files" on storage.objects for select to authenticated using (bucket_id='treasurer-finance' and private.asa_treasury_can_view());
drop policy if exists "Treasury staff upload private finance files" on storage.objects;
create policy "Treasury staff upload private finance files" on storage.objects for insert to authenticated with check (bucket_id='treasurer-finance' and private.asa_treasury_can_view() and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Treasury staff update private finance files" on storage.objects;
create policy "Treasury staff update private finance files" on storage.objects for update to authenticated using (bucket_id='treasurer-finance' and private.asa_treasury_can_view()) with check (bucket_id='treasurer-finance' and private.asa_treasury_can_view());
drop policy if exists "Treasury staff delete private finance files" on storage.objects;
create policy "Treasury staff delete private finance files" on storage.objects for delete to authenticated using (bucket_id='treasurer-finance' and private.asa_treasury_can_view());

grant select, insert, update, delete on public.treasurer_documents, public.treasurer_transactions, public.treasurer_budgets to authenticated;
grant select, insert on public.treasurer_audit_log to authenticated;
grant usage, select on sequence public.treasurer_audit_log_id_seq to authenticated;
