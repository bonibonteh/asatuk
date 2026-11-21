-- Restrict the helper to own-account checks unless the caller is an active administrator.
create or replace function public.asa_account_is_active(p_user_id uuid) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
begin
 if auth.uid() is null then return false; end if;
 if p_user_id is distinct from auth.uid() and not exists(select 1 from public.admin_users au where au.user_id=auth.uid() and au.role='admin' and not au.is_suspended) then return false; end if;
 if exists(select 1 from public.council_account_requests r where r.user_id=p_user_id and r.status in ('suspended','rejected','revoked')) then return false; end if;
 if exists(select 1 from public.admin_users au where au.user_id=p_user_id and au.role='admin') then return not exists(select 1 from public.admin_users au where au.user_id=p_user_id and au.role='admin' and au.is_suspended); end if;
 return exists(select 1 from public.council_role_assignments ca where ca.user_id=p_user_id and ca.is_active);
end $$;
revoke all on function public.asa_account_is_active(uuid) from public,anon;
grant execute on function public.asa_account_is_active(uuid) to authenticated;

create or replace function private.audit_council_assignment_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare target_id uuid; request_id uuid; event_action text; safe_details jsonb;
begin
 target_id:=case when TG_OP='DELETE' then OLD.user_id else NEW.user_id end;
 select r.id into request_id from public.council_account_requests r where r.user_id=target_id limit 1;
 event_action:=case when TG_OP='INSERT' then 'assignment_created' when TG_OP='UPDATE' then 'assignment_updated' else 'assignment_deleted' end;
 if TG_OP='DELETE' then safe_details:=jsonb_build_object('docket',OLD.docket,'role_title',OLD.role_title,'is_active',OLD.is_active);
 else safe_details:=jsonb_build_object('docket',NEW.docket,'role_title',NEW.role_title,'is_active',NEW.is_active,'permissions',jsonb_build_object('secretariat',NEW.can_manage_secretariat,'events',NEW.can_manage_events,'academics',NEW.can_manage_academics,'pr',NEW.can_manage_pr,'merchandise',NEW.can_manage_merchandise,'finance',case when NEW.role_title='Assistant Treasurer' then false else NEW.can_manage_finance end)); end if;
 insert into public.council_access_audit(request_id,target_user_id,actor_user_id,action,details) values(request_id,target_id,auth.uid(),event_action,safe_details);
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
drop trigger if exists audit_council_assignment_changes on public.council_role_assignments;
create trigger audit_council_assignment_changes after insert or update or delete on public.council_role_assignments for each row execute function private.audit_council_assignment_change();
