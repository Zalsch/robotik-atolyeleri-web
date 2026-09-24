-- Keep existing application records intact while replacing the external identity link.
-- Legacy accounts without a password hash remain unable to sign in until an
-- authorized password reset supplies a new hash.
create table app_private.legacy_identity_links (
  user_id uuid primary key references public.app_users(id),
  external_user_id text not null unique
);
insert into app_private.legacy_identity_links (user_id, external_user_id)
  select id, clerk_user_id from public.app_users;
revoke all on app_private.legacy_identity_links from public, anon, authenticated;
grant select on app_private.legacy_identity_links to service_role;

alter table public.app_users
  add column password_hash text,
  add column session_version integer not null default 1 check (session_version > 0),
  add constraint app_users_argon2id_hash check (password_hash is null or left(password_hash, 10) = '$argon2id$');
alter table public.app_users drop column clerk_user_id;
create unique index app_users_one_admin on public.app_users ((role)) where role = 'admin';

create function app_private.bump_session_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.password_hash is distinct from old.password_hash
     or new.active is distinct from old.active then
    new.session_version := old.session_version + 1;
  else
    new.session_version := old.session_version;
  end if;
  return new;
end;
$$;
create trigger app_users_session_version before update on public.app_users
for each row execute function app_private.bump_session_version();
revoke all on function app_private.bump_session_version() from public, anon, authenticated;
grant execute on function app_private.bump_session_version() to service_role;

-- An atomic, shared limiter works across server instances. Buckets are HMACs
-- produced on the application server, so usernames and IPs are not stored here.
create table app_private.login_attempts (
  bucket text primary key check (bucket ~ '^[a-f0-9]{64}$'),
  attempts integer not null,
  reset_at timestamptz not null
);
alter table app_private.login_attempts enable row level security;
revoke all on app_private.login_attempts from public, anon, authenticated;
grant select, insert, update, delete on app_private.login_attempts to service_role;

create function public.consume_login_attempt(p_bucket text, p_limit integer)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_attempts integer;
begin
  if p_bucket !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid login limit input';
  end if;
  insert into app_private.login_attempts(bucket, attempts, reset_at)
    values (p_bucket, 1, now() + interval '15 minutes')
  on conflict (bucket) do update set
    attempts = case when app_private.login_attempts.reset_at <= now()
      then 1 else app_private.login_attempts.attempts + 1 end,
    reset_at = case when app_private.login_attempts.reset_at <= now()
      then now() + interval '15 minutes' else app_private.login_attempts.reset_at end
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end;
$$;

create function public.clear_login_attempt(p_bucket text)
returns void language plpgsql set search_path = '' as $$
begin
  if p_bucket !~ '^[a-f0-9]{64}$' then raise exception 'invalid login bucket'; end if;
  delete from app_private.login_attempts where bucket = p_bucket;
end;
$$;

revoke all on function public.consume_login_attempt(text, integer) from public, anon, authenticated;
revoke all on function public.clear_login_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_login_attempt(text, integer) to service_role;
grant execute on function public.clear_login_attempt(text) to service_role;

-- Replace the old Clerk-based RPC signature with a password-hash based one.
drop function public.create_student_with_enrollment(text, text, text, uuid);
create function public.create_student_with_enrollment(
  p_password_hash text, p_username text, p_display_name text, p_class_id uuid
) returns public.app_users
language plpgsql set search_path = '' as $$
declare
  v_student public.app_users;
begin
  insert into public.app_users(password_hash, role, username, display_name)
    values (p_password_hash, 'student', p_username, trim(p_display_name))
    returning * into v_student;
  insert into public.enrollments(class_id, student_id)
    values (p_class_id, v_student.id);
  return v_student;
end;
$$;
revoke all on function public.create_student_with_enrollment(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_student_with_enrollment(text, text, text, uuid)
  to service_role;
