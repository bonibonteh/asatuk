-- Reopen revoked ASA TUK council requests without creating duplicate auth users.
create or replace function public.admin_reopen_council_request(p_request_id uuid, p_notes text default '') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare actor uuid:=auth.uid(); req public.council_account_requests%rowtype; confirmed_at timestamptz; next_status text;
begin
 if actor is null or not exists(select 1 from public.admin_users au where au.user_id=actor and au.role='admin' and not au.is_suspended) then raise exception 'Only an active ASA TUK administrator can reopen council requests.'; end if;
 select * into req from public.council_account_requests where id=p_request_id for update;
 if not found then raise exception 'Council request not found.'; end if;
 if req.user_id=actor then raise exception 'You cannot reopen your own council request.'; end if;
 if req.status <> 'revoked' then raise exception 'Only revoked requests can be reopened.'; end if;
 select u.email_confirmed_at into confirmed_at from auth.users u where u.id=req.user_id;
 next_status:=case when confirmed_at is null then 'pending_email_verification' else 'pending_approval' end;
 update public.council_account_requests set status=next_status,admin_notes=coalesce(p_notes,''),reviewed_by=actor,reviewed_at=now(),updated_at=now() where id=req.id;
 update public.council_role_assignments set is_active=false,updated_at=now() where user_id=req.user_id;
 update public.admin_users set is_suspended=true where user_id=req.user_id and role='admin';
 insert into public.council_access_audit(request_id,target_user_id,actor_user_id,action,details) values(req.id,req.user_id,actor,'reopen',jsonb_build_object('previous_status','revoked','new_status',next_status,'notes',left(coalesce(p_notes,''),1000)));
 return jsonb_build_object('ok',true,'request_id',req.id,'status',next_status);
end $$;
revoke all on function public.admin_reopen_council_request(uuid,text) from public,anon;
grant execute on function public.admin_reopen_council_request(uuid,text) to authenticated;
