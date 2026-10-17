create or replace function public.admin_review_council_request_with_extended_permissions(
 p_request_id uuid,p_decision text,p_role_title text default null,p_docket text default null,
 p_can_manage_secretariat boolean default false,p_can_manage_events boolean default false,p_can_manage_academics boolean default false,
 p_can_manage_pr boolean default false,p_can_manage_merchandise boolean default false,p_can_manage_finance boolean default false,
 p_can_manage_projects boolean default false,p_can_manage_gallery boolean default false,p_can_manage_membership boolean default false,
 p_can_manage_timetables boolean default false,p_can_manage_leadership boolean default false,p_notes text default ''
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare actor uuid:=auth.uid(); req public.council_account_requests%rowtype; result jsonb;
begin
 if actor is null or not exists(select 1 from public.admin_users au where au.user_id=actor and au.role='admin' and not au.is_suspended) then raise exception 'Only an active ASA TUK administrator can review council requests.'; end if;
 select * into req from public.council_account_requests where id=p_request_id;
 if not found then raise exception 'Council request not found.'; end if;
 if req.user_id=actor then raise exception 'You cannot approve or reject your own request.'; end if;
 result:=public.admin_review_council_request(p_request_id,p_decision,p_role_title,p_docket,p_can_manage_secretariat,p_can_manage_events,p_can_manage_academics,p_can_manage_pr,p_can_manage_merchandise,p_can_manage_finance,p_notes);
 if p_decision='approve' then
 update public.council_role_assignments set can_manage_projects=coalesce(p_can_manage_projects,false),can_manage_gallery=coalesce(p_can_manage_gallery,false),
 can_manage_membership=coalesce(p_can_manage_membership,false),can_manage_timetables=coalesce(p_can_manage_timetables,false),
 can_manage_leadership=coalesce(p_can_manage_leadership,false),can_manage_finance=case when req.requested_position='Assistant Treasurer' then false else coalesce(p_can_manage_finance,false) end,updated_at=now()
 where user_id=req.user_id and docket=coalesce(nullif(trim(p_docket),''),req.assigned_docket);
 end if;
 return result;
end $$;
revoke all on function public.admin_review_council_request_with_extended_permissions(uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) from public,anon;
grant execute on function public.admin_review_council_request_with_extended_permissions(uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) to authenticated;
