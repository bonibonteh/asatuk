create or replace function private.enforce_assistant_treasurer_limits() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin if lower(coalesce(new.role_title,'')) like '%assistant treasurer%' then new.can_manage_finance:=false; end if; return new; end $$;
drop trigger if exists enforce_assistant_treasurer_limits on public.council_role_assignments;
create trigger enforce_assistant_treasurer_limits before insert or update of role_title,can_manage_finance on public.council_role_assignments for each row execute function private.enforce_assistant_treasurer_limits();

create or replace function private.audit_council_assignment_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare target_id uuid; request_id uuid; event_action text; safe_details jsonb;
begin
 target_id:=case when TG_OP='DELETE' then OLD.user_id else NEW.user_id end;
 select r.id into request_id from public.council_account_requests r where r.user_id=target_id limit 1;
 event_action:=case when TG_OP='INSERT' then 'assignment_created' when TG_OP='UPDATE' then 'assignment_updated' else 'assignment_deleted' end;
 if TG_OP='DELETE' then safe_details:=jsonb_build_object('docket',OLD.docket,'role_title',OLD.role_title,'is_active',OLD.is_active);
 else safe_details:=jsonb_build_object('docket',NEW.docket,'role_title',NEW.role_title,'is_active',NEW.is_active,'permissions',jsonb_build_object('secretariat',NEW.can_manage_secretariat,'events',NEW.can_manage_events,'academics',NEW.can_manage_academics,'pr',NEW.can_manage_pr,'merchandise',NEW.can_manage_merchandise,'finance',case when lower(coalesce(NEW.role_title,'')) like '%assistant treasurer%' then false else NEW.can_manage_finance end,'projects',NEW.can_manage_projects,'gallery',NEW.can_manage_gallery,'membership',NEW.can_manage_membership,'timetables',NEW.can_manage_timetables,'leadership',NEW.can_manage_leadership)); end if;
 insert into public.council_access_audit(request_id,target_user_id,actor_user_id,action,details) values(request_id,target_id,auth.uid(),event_action,safe_details);
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
