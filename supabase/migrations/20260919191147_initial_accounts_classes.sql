-- Clerk authenticates users. Only the trusted server uses Supabase's secret key.
-- No browser or Supabase Auth role receives table access.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  role text not null check (role in ('admin', 'teacher', 'student')),
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9._-]{3,32}$'),
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  created_by uuid not null references public.app_users(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.app_users(id),
  assigned_at timestamptz not null default now(),
  primary key (class_id, teacher_id)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  student_id uuid not null references public.app_users(id),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  check (left_at is null or left_at >= joined_at)
);

create unique index enrollments_one_active_per_class
  on public.enrollments (class_id, student_id) where left_at is null;
create index class_teachers_teacher_id_idx on public.class_teachers (teacher_id);
create index enrollments_student_active_idx on public.enrollments (student_id) where left_at is null;
create index enrollments_class_active_idx on public.enrollments (class_id) where left_at is null;

create function app_private.check_class_creator() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.app_users where id = new.created_by and role = 'admin' and active) then
    raise exception 'class creator must be an active admin';
  end if;
  return new;
end;
$$;
create trigger classes_creator_check before insert or update of created_by on public.classes
for each row execute function app_private.check_class_creator();

create function app_private.check_class_teacher() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Serializes concurrent assignments for the same class.
  perform 1 from public.classes where id = new.class_id and active for update;
  if not found then raise exception 'class is not active'; end if;

  if not exists (select 1 from public.app_users where id = new.teacher_id and role = 'teacher' and active) then
    raise exception 'assigned user must be an active teacher';
  end if;

  if (select count(*) from public.class_teachers
      where class_id = new.class_id and teacher_id <> new.teacher_id) >= 2 then
    raise exception 'a class can have at most two teachers';
  end if;
  return new;
end;
$$;
create trigger class_teacher_limit before insert or update on public.class_teachers
for each row execute function app_private.check_class_teacher();

create function app_private.check_student_enrollment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.app_users where id = new.student_id and role = 'student') then
    raise exception 'enrollment user must be a student';
  end if;
  if not exists (select 1 from public.classes where id = new.class_id and active) then
    raise exception 'class is not active';
  end if;
  return new;
end;
$$;
create trigger enrollment_student_role before insert or update of class_id, student_id on public.enrollments
for each row execute function app_private.check_student_enrollment();

revoke all on function app_private.check_class_creator() from public, anon, authenticated;
revoke all on function app_private.check_class_teacher() from public, anon, authenticated;
revoke all on function app_private.check_student_enrollment() from public, anon, authenticated;
grant execute on function app_private.check_class_creator() to service_role;
grant execute on function app_private.check_class_teacher() to service_role;
grant execute on function app_private.check_student_enrollment() to service_role;

alter table public.app_users enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.enrollments enable row level security;

revoke all on table public.app_users, public.classes, public.class_teachers, public.enrollments
  from anon, authenticated;
grant select, insert, update, delete on table public.app_users, public.classes,
  public.class_teachers, public.enrollments to service_role;

-- These functions keep multi-table changes atomic. The trusted Next.js server
-- checks the Clerk identity and role before calling them with the secret key.
create function public.create_class_with_teachers(
  p_name text, p_created_by uuid, p_teacher_ids uuid[] default '{}'
) returns public.classes
language plpgsql set search_path = '' as $$
declare
  v_class public.classes;
  v_count integer;
begin
  select count(distinct id) into v_count from unnest(p_teacher_ids) as id;
  if coalesce(array_length(p_teacher_ids, 1), 0) <> v_count or v_count > 2 then
    raise exception 'choose at most two distinct teachers';
  end if;
  insert into public.classes(name, created_by)
    values (trim(p_name), p_created_by) returning * into v_class;
  insert into public.class_teachers(class_id, teacher_id)
    select v_class.id, id from unnest(p_teacher_ids) as id;
  return v_class;
end;
$$;

create function public.set_class_teachers(p_class_id uuid, p_teacher_ids uuid[])
returns void language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  select count(distinct id) into v_count from unnest(p_teacher_ids) as id;
  if coalesce(array_length(p_teacher_ids, 1), 0) <> v_count or v_count > 2 then
    raise exception 'choose at most two distinct teachers';
  end if;
  perform 1 from public.classes where id = p_class_id and active for update;
  if not found then raise exception 'class is not active'; end if;
  delete from public.class_teachers where class_id = p_class_id;
  insert into public.class_teachers(class_id, teacher_id)
    select p_class_id, id from unnest(p_teacher_ids) as id;
end;
$$;

create function public.create_student_with_enrollment(
  p_clerk_user_id text, p_username text, p_display_name text, p_class_id uuid
) returns public.app_users
language plpgsql set search_path = '' as $$
declare
  v_student public.app_users;
begin
  insert into public.app_users(clerk_user_id, role, username, display_name)
    values (p_clerk_user_id, 'student', p_username, trim(p_display_name))
    returning * into v_student;
  insert into public.enrollments(class_id, student_id)
    values (p_class_id, v_student.id);
  return v_student;
end;
$$;

create function public.enroll_existing_student(p_class_id uuid, p_student_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.app_users where id = p_student_id and role = 'student' for update;
  if not found then raise exception 'student not found'; end if;
  insert into public.enrollments(class_id, student_id) values (p_class_id, p_student_id);
  update public.app_users set active = true, updated_at = now() where id = p_student_id;
end;
$$;

create function public.remove_student_from_class(p_class_id uuid, p_student_id uuid)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_still_active boolean;
begin
  perform 1 from public.app_users where id = p_student_id and role = 'student' for update;
  if not found then raise exception 'student not found'; end if;
  update public.enrollments set left_at = greatest(now(), joined_at)
    where class_id = p_class_id and student_id = p_student_id and left_at is null;
  if not found then raise exception 'active enrollment not found'; end if;
  select exists(select 1 from public.enrollments where student_id = p_student_id and left_at is null)
    into v_still_active;
  if not v_still_active then
    update public.app_users set active = false, updated_at = now() where id = p_student_id;
  end if;
  return v_still_active;
end;
$$;

revoke all on function public.create_class_with_teachers(text, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.set_class_teachers(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.create_student_with_enrollment(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.enroll_existing_student(uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_student_from_class(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_class_with_teachers(text, uuid, uuid[]) to service_role;
grant execute on function public.set_class_teachers(uuid, uuid[]) to service_role;
grant execute on function public.create_student_with_enrollment(text, text, text, uuid) to service_role;
grant execute on function public.enroll_existing_student(uuid, uuid) to service_role;
grant execute on function public.remove_student_from_class(uuid, uuid) to service_role;
