create or replace function public.connect_set_consent(p_meeting uuid, p_consent text) returns void language plpgsql security definer set search_path=public as $$
declare nm text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_consent not in ('granted','declined') then raise exception 'Invalid consent'; end if;
 select display_name into nm from council_role_assignments where user_id=auth.uid() and is_active limit 1;
 insert into connect_participants(meeting_id,user_id,display_name,consent,consent_at) values(p_meeting,auth.uid(),coalesce(nm,''),p_consent,now())
 on conflict(meeting_id,user_id) do update set consent=excluded.consent, consent_at=now();
end$$;

create or replace function public.connect_add_segment(p_meeting uuid, p_speaker text, p_speaker_user uuid, p_start int, p_end int, p_text text, p_source text default 'manual') returns uuid language plpgsql security definer set search_path=public as $$
declare i uuid;
begin
 if not private.asa_council_can_manage_records() then raise exception 'Not permitted'; end if;
 if coalesce(btrim(p_text),'')='' then raise exception 'Empty segment'; end if;
 insert into connect_transcript_segments(meeting_id,speaker_name,speaker_user_id,start_ms,end_ms,text,source)
 values(p_meeting,coalesce(nullif(btrim(p_speaker),''),'Unknown speaker'),p_speaker_user,p_start,p_end,btrim(p_text),p_source) returning id into i;
 return i;
end$$;

create or replace function public.connect_edit_segment(p_id uuid, p_text text, p_speaker text default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if not private.asa_council_can_manage_records() then raise exception 'Not permitted'; end if;
 if coalesce(btrim(p_text),'')='' then raise exception 'Empty segment'; end if;
 update connect_transcript_segments set original_text=coalesce(original_text,text), text=btrim(p_text),
  speaker_name=coalesce(nullif(btrim(p_speaker),''),speaker_name), edited=true, edited_by=auth.uid() where id=p_id;
 if not found then raise exception 'Segment not found'; end if;
end$$;

-- idempotent enqueue: same key returns the existing job, never a duplicate
create or replace function public.connect_enqueue_job(p_meeting uuid, p_kind text, p_key text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare k text; j uuid;
begin
 if not private.asa_council_can_manage_records() then raise exception 'Not permitted'; end if;
 k:=coalesce(p_key, p_meeting||':'||p_kind||':'||(select count(*) from connect_transcript_segments where meeting_id=p_meeting)||':'||coalesce((select max(version) from connect_ai_outputs where meeting_id=p_meeting),0));
 insert into connect_jobs(meeting_id,kind,idempotency_key,created_by) values(p_meeting,p_kind,k,auth.uid()) on conflict(idempotency_key) do nothing returning id into j;
 if j is null then select id into j from connect_jobs where idempotency_key=k; end if;
 return j;
end$$;

create or replace function public.connect_retry_job(p_job uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not private.asa_council_can_manage_records() then raise exception 'Not permitted'; end if;
 update connect_jobs set status='pending',attempts=attempts+1,error=null,updated_at=now() where id=p_job and status='failed' and attempts<max_attempts;
 if not found then raise exception 'Job cannot be retried (not failed or retries used up)'; end if;
end$$;

create or replace function public.connect_log_job_result(p_job uuid, p_ok boolean, p_error text default null, p_model text default null) returns void language plpgsql security definer set search_path=public as $$
declare m uuid; k text;
begin
 if not private.asa_council_can_manage_records() then raise exception 'Not permitted'; end if;
 update connect_jobs set status=case when p_ok then 'succeeded' else 'failed' end,error=left(p_error,1000),model=coalesce(p_model,model),updated_at=now() where id=p_job returning meeting_id,kind into m,k;
 if not p_ok then insert into connect_health_events(service,level,message,meeting_id) values(case when k='transcription' then 'transcription' else 'ai' end,'error',coalesce(left(p_error,500),'Job failed'),m); end if;
end$$;

-- AI (or manual) draft: new version, previous drafts superseded; meeting is never touched
create or replace function public.connect_save_draft(p_meeting uuid, p_summary text, p_decisions jsonb, p_actions jsonb, p_model text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v int; o uuid; a jsonb; ch text;
begin
 if not private.asa_council_can_manage_records() then raise exception 'Not permitted'; end if;
 select chapter into ch from council_meetings where id=p_meeting; if not found then raise exception 'Meeting not found'; end if;
 select coalesce(max(version),0)+1 into v from connect_ai_outputs where meeting_id=p_meeting;
 update connect_ai_outputs set status='superseded' where meeting_id=p_meeting and status='draft';
 insert into connect_ai_outputs(meeting_id,version,summary,decisions,model,created_by) values(p_meeting,v,coalesce(p_summary,''),coalesce(p_decisions,'[]'),p_model,auth.uid()) returning id into o;
 for a in select * from jsonb_array_elements(coalesce(p_actions,'[]')) loop
  insert into connect_action_points(meeting_id,output_id,title,description,docket,chapter,assigned_to,due_date)
  values(p_meeting,o,a->>'title',coalesce(a->>'description',''),coalesce(a->>'docket','Secretariat'),ch,nullif(a->>'assigned_to','')::uuid,nullif(a->>'due_date','')::date);
 end loop;
 return o;
end$$;

create or replace function public.connect_edit_action(p_id uuid, p_title text, p_docket text, p_assigned uuid, p_due date) returns void language plpgsql security definer set search_path=public as $$
begin
 if not private.connect_is_sg() then raise exception 'Only the Secretary General can edit action points'; end if;
 update connect_action_points set title=p_title,docket=p_docket,assigned_to=p_assigned,due_date=p_due where id=p_id and status='proposed';
 if not found then raise exception 'Only proposed action points can be edited'; end if;
end$$;

-- SG approval: only now does anything enter the official archive
create or replace function public.connect_approve_minutes(p_output uuid, p_summary text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare o connect_ai_outputs; m council_meetings; mid uuid;
begin
 if not private.connect_is_sg() then raise exception 'Only the Secretary General can approve minutes'; end if;
 select * into o from connect_ai_outputs where id=p_output for update;
 if not found then raise exception 'Draft not found'; end if;
 if o.status<>'draft' then raise exception 'Only a current draft can be approved'; end if;
 select * into m from council_meetings where id=o.meeting_id;
 update connect_ai_outputs set status='approved',summary=coalesce(p_summary,summary),approved_by=auth.uid(),approved_at=now() where id=o.id;
 insert into council_minutes(meeting_id,title,meeting_date,minutes_text,status,created_by,chapter)
 values(m.id,'Minutes: '||m.title,m.starts_at::date,coalesce(p_summary,o.summary),'approved',auth.uid(),m.chapter) returning id into mid;
 return mid;
end$$;

create or replace function public.connect_reject_draft(p_output uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not private.connect_is_sg() then raise exception 'Only the Secretary General can reject drafts'; end if;
 update connect_ai_outputs set status='rejected' where id=p_output and status='draft';
 if not found then raise exception 'Only a current draft can be rejected'; end if;
 update connect_action_points set status='rejected' where output_id=p_output and status='proposed';
end$$;

-- approved-only task creation, exactly once
create or replace function public.connect_approve_action(p_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare a connect_action_points; t uuid;
begin
 if not private.connect_is_sg() then raise exception 'Only the Secretary General can approve action points'; end if;
 select * into a from connect_action_points where id=p_id for update;
 if not found then raise exception 'Action point not found'; end if;
 if a.task_id is not null then return a.task_id; end if;
 if a.status<>'proposed' then raise exception 'Action point is %', a.status; end if;
 insert into council_tasks(title,description,docket,assigned_to,due_date,status,created_by,chapter)
 values(a.title,a.description,a.docket,a.assigned_to,a.due_date,'open',auth.uid(),a.chapter) returning id into t;
 update connect_action_points set status='approved',task_id=t,approved_by=auth.uid() where id=p_id;
 if a.assigned_to is not null then
  begin
   insert into connect_notifications(user_id,action_point_id,message) values(a.assigned_to,a.id,'New task: '||a.title||coalesce(' (due '||a.due_date||')','')) on conflict do nothing;
  exception when others then
   insert into connect_health_events(service,level,message,meeting_id) values('notification','error',left(sqlerrm,500),a.meeting_id);
  end;
 end if;
 return t;
end$$;

create or replace function public.connect_health() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not private.connect_is_sg() then raise exception 'Not permitted'; end if;
 return jsonb_build_object('db','ok','checked_at',now(),
  'pending_jobs',(select count(*) from connect_jobs where status in ('pending','running')),
  'failed_jobs',(select count(*) from connect_jobs where status='failed'),
  'failed_recordings',(select count(*) from connect_recordings where status='failed'),
  'failed_notifications',(select count(*) from connect_notifications where delivery_status='failed')+(select count(*) from connect_health_events where service='notification' and created_at>now()-interval '7 days'),
  'recent_errors',coalesce((select jsonb_agg(e) from (select service,message,created_at from connect_health_events where level='error' order by created_at desc limit 20) e),'[]'));
end$$;
do $$ declare f text; begin
 foreach f in array array['connect_set_consent(uuid,text)','connect_add_segment(uuid,text,uuid,int,int,text,text)','connect_edit_segment(uuid,text,text)','connect_enqueue_job(uuid,text,text)','connect_retry_job(uuid)','connect_log_job_result(uuid,boolean,text,text)','connect_save_draft(uuid,text,jsonb,jsonb,text)','connect_edit_action(uuid,text,text,uuid,date)','connect_approve_minutes(uuid,text)','connect_reject_draft(uuid)','connect_approve_action(uuid)','connect_health()'] loop
  execute format('revoke execute on function public.%s from public, anon',f);
  execute format('grant execute on function public.%s to authenticated',f);
 end loop; end $$;
