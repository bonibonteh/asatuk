-- Keep request status in sync with Supabase email verification without requiring a login first.
create or replace function private.mark_council_email_verified() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if old.email_confirmed_at is null and new.email_confirmed_at is not null then
  update public.council_account_requests set status='pending_approval',updated_at=now()
  where user_id=new.id and status='pending_email_verification';
 end if;
 return new;
end $$;
drop trigger if exists asa_mark_council_email_verified on auth.users;
create trigger asa_mark_council_email_verified after update of email_confirmed_at on auth.users for each row execute function private.mark_council_email_verified();
